import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateMLQuestionResponse } from "../_shared/ml-response-validator.ts";
import { searchCorrections } from "../_shared/embeddings.ts";

/* ───────────────────── helpers ───────────────────── */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function log(step: string, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ fn: "ml-webhook", step, ts: new Date().toISOString(), ...extra })
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ───────────────────── ML API helpers ───────────────────── */

const ML_API = "https://api.mercadolibre.com";

async function mlGet(path: string, token: string) {
  const res = await fetch(`${ML_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function mlPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${ML_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

/* ───────────────────── Supabase client ───────────────────── */

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/* ───────────────────── Get ML access token (robust) ─────────────────────
 *
 * Mudanças vs versão anterior (21/05/2026):
 * - Buffer de 5min: refresh PROATIVO antes da expiração (evita race com webhooks
 *   chegando em rajada exatamente no momento da expiração).
 * - Retry em 5xx/429 no /oauth/token (1 retry com 1.5s de delay).
 * - Marca status='expired' no DB quando refresh falha definitivamente
 *   (visibilidade — não fica silencioso como antes).
 * - Logs detalhados (status code, response body parcial) para diagnóstico futuro.
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5min antes de expirar

async function getMLToken(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("marketplace_tokens")
    .select("access_token, token_expires_at, refresh_token, id")
    .eq("platform", "mercado_livre")
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !data?.access_token) {
    log("token_lookup_failed", { error: error?.message });
    return null;
  }

  // Refresh proativo: se expira em menos de 5min, refresh agora
  const expiresAtMs = data.token_expires_at
    ? new Date(data.token_expires_at).getTime()
    : 0;
  const nowMs = Date.now();

  if (expiresAtMs > nowMs + TOKEN_REFRESH_BUFFER_MS) {
    return data.access_token;
  }

  log("token_needs_refresh", {
    expiresIn: Math.round((expiresAtMs - nowMs) / 1000),
    tokenId: data.id,
  });

  return await refreshMLToken(supabase, data.id, data.refresh_token!);
}

async function refreshMLToken(
  supabase: ReturnType<typeof createClient>,
  tokenId: string,
  refreshToken: string
): Promise<string | null> {
  if (!refreshToken) {
    log("no_refresh_token");
    await markTokenExpired(supabase, tokenId, "no_refresh_token");
    return null;
  }

  const clientId = Deno.env.get("ML_APP_ID");
  const clientSecret = Deno.env.get("ML_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    log("missing_oauth_env", {
      has_app_id: !!clientId,
      has_secret: !!clientSecret,
    });
    return null;
  }

  // 2 tentativas em caso de 5xx/429
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${ML_API}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text);
      } catch {
        log("token_refresh_non_json", {
          status: res.status,
          body: text.slice(0, 300),
          attempt,
        });
      }

      if (res.status >= 200 && res.status < 300 && data.access_token) {
        const expiresIn = Number(data.expires_in) || 21600;
        const { error: updError } = await supabase
          .from("marketplace_tokens")
          .update({
            access_token: data.access_token as string,
            refresh_token: (data.refresh_token as string) || refreshToken,
            token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
            status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        if (updError) {
          log("token_refresh_db_update_failed", { error: updError.message });
          // Token novo está válido mas DB falhou — retorna mesmo assim,
          // próxima chamada tentará refresh de novo (com o refresh_token
          // que pode ter sido consumido — aí cai num invalid_grant).
          // Vale alertar mas não bloqueia processamento desta question.
        } else {
          log("token_refreshed", {
            new_expires_in_s: expiresIn,
            attempt,
          });
        }

        return data.access_token as string;
      }

      // Erro 4xx (credenciais inválidas, refresh_token expirado) — NÃO retry,
      // marca como expired pra parar de tentar
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        log("token_refresh_invalid_grant", {
          status: res.status,
          error: data.error,
          message: text.slice(0, 300),
          attempt,
        });
        await markTokenExpired(
          supabase,
          tokenId,
          `${res.status}_${String(data.error || "unknown")}`
        );
        return null;
      }

      // 5xx/429 — retry
      log("token_refresh_transient_error", {
        status: res.status,
        attempt,
        body: text.slice(0, 200),
      });
      if (attempt < 2) await sleep(1500);
    } catch (e) {
      log("token_refresh_exception", { error: String(e), attempt });
      if (attempt < 2) await sleep(1500);
    }
  }

  // Todas as tentativas falharam (transient)
  log("token_refresh_exhausted");
  return null;
}

async function markTokenExpired(
  supabase: ReturnType<typeof createClient>,
  tokenId: string,
  reason: string
) {
  try {
    await supabase
      .from("marketplace_tokens")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", tokenId);
    log("token_marked_expired", { tokenId, reason });
  } catch (e) {
    log("mark_expired_failed", { error: String(e) });
  }
}

/* ───────────────────── Fetch item title from ML ───────────────────── */

async function fetchItemTitle(itemId: string, token: string): Promise<string> {
  try {
    const item = await mlGet(`/items/${itemId}?attributes=id,title`, token);
    return item.title || itemId;
  } catch {
    log("fetch_item_title_failed", { itemId });
    return itemId; // fallback to item ID
  }
}

/* ───────────────────── AI answer generation ───────────────────── */

async function getAgentConfig(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("agent_config").select("config_key, config_value");
  const config: Record<string, string> = {};
  for (const row of data ?? []) {
    config[row.config_key] = row.config_value;
  }
  return config;
}

async function generateAIAnswer(
  questionText: string,
  productName: string,
  agentConfig: Record<string, string>,
  productContext: string,
  correctionContext = ""
): Promise<{ answer: string; tokens: number; timeMs: number }> {
  const start = Date.now();

  const systemPrompt = `Você é a Ana, assistente virtual da Budamix. Você está respondendo uma PERGUNTA DE COMPRADOR no Mercado Livre. A resposta é pública e vai direto ao comprador.

REGRAS PARA PERGUNTAS DO MERCADO LIVRE:
1. Resposta CURTA e DIRETA — máximo 350 caracteres (limite do ML).
2. Tom natural, cordial e prestativo — como uma pessoa real conversando, nunca telemarketing.
3. SEM emojis (o ML não renderiza bem).
4. SEM formatação (*negrito*, _itálico_) — texto puro.
5. SEM links e SEM mencionar outras plataformas (Shopee, Amazon, site próprio, WhatsApp). Toda a conversa acontece aqui no Mercado Livre.
6. Comece com "Olá!" (saudação breve, sem o nome do comprador).
7. Responda EXATAMENTE o que foi perguntado, usando o que se sabe no CONTEXTO DO PRODUTO abaixo.
8. NUNCA invente informação que não esteja no contexto do produto.
9. REGRA 17 (cética mas gentil) — PROIBIDO ABSOLUTO, mesmo quando faltar um dado:
   - NÃO admita falha de cadastro: nunca diga "não está detalhada/confirmada no cadastro", "não temos/tenho essa informação confirmada", "não consta no cadastro".
   - NÃO exponha processo interno: nunca diga "vou/vamos verificar internamente", "verificar com a equipe", "vamos atualizar o anúncio", "atualizar por aqui".
   - NÃO use frases de telemarketing: "estou/estamos à disposição", "entre em contato", "fale conosco", "nossa equipe técnica", "mande mensagem".
   - NÃO prometa proativamente devolução, reembolso, prazo de entrega ou estoque.
   Quando faltar um dado específico, responda com o que você SABE do produto; se realmente não souber, use EXATAMENTE: "Olá! Vou conferir essa informação e te retorno em breve." — sem expor cadastro nem processo interno.
10. Se a pergunta for sobre pagamento/checkout/Pix/QR Code, oriente o passo útil (copiar o código Pix e colar no banco, trocar de navegador/dispositivo, ou o suporte do próprio Mercado Livre) — NÃO trate como rastreamento de pedido já realizado.
11. Sobre ESTOQUE / DISPONIBILIDADE / quantidade: NÃO afirme que "tem em estoque" nem cite número de unidades. A disponibilidade real aparece no próprio anúncio ao adicionar ao carrinho/finalizar a compra — oriente o comprador por aí (ex.: "A quantidade disponível aparece no anúncio ao adicionar ao carrinho.").

CONTEXTO DO PRODUTO:
${productContext}${correctionContext}`;

  const model = agentConfig.model || "claude-sonnet-4-6";
  const temperature = parseFloat(agentConfig.temperature || "0.3");

  let answer = "";
  let tokens = 0;

  if (model.startsWith("claude")) {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model === "claude-sonnet-4-6" ? "claude-sonnet-4-20250514" : model,
        max_tokens: 500,
        temperature,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Pergunta do comprador sobre "${productName}":\n\n"${questionText}"`,
          },
        ],
      }),
    });
    const data = await res.json();
    answer = data.content?.[0]?.text || "";
    tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  } else if (model.startsWith("gpt") || model.startsWith("o")) {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Pergunta do comprador sobre "${productName}":\n\n"${questionText}"`,
          },
        ],
      }),
    });
    const data = await res.json();
    answer = data.choices?.[0]?.message?.content || "";
    tokens = data.usage?.total_tokens || 0;
  } else {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) throw new Error("GROQ_API_KEY not set");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Pergunta do comprador sobre "${productName}":\n\n"${questionText}"`,
          },
        ],
      }),
    });
    const data = await res.json();
    answer = data.choices?.[0]?.message?.content || "";
    tokens = data.usage?.total_tokens || 0;
  }

  return { answer: answer.trim(), tokens, timeMs: Date.now() - start };
}

/* ───────────────────── Product context via embedding ───────────────────── */

async function getProductContext(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  productName: string
): Promise<string> {
  const { data: listings } = await supabase
    .from("product_listings")
    .select("product_id")
    .eq("platform_item_id", itemId)
    .limit(1);

  let product = null;
  if (listings && listings.length > 0) {
    const { data } = await supabase
      .from("products")
      .select(
        "name, short_description, full_description, material, dimensions, price_site, price_marketplace, usage_suggestions, differentials, variations, stock_quantity, stock_status, updated_at"
      )
      .eq("id", listings[0].product_id)
      .single();
    product = data;
  }

  if (!product) {
    const { data: mapping } = await supabase
      .from("marketplace_product_mapping")
      .select("product_id")
      .eq("external_item_id", itemId)
      .limit(1);

    if (mapping && mapping.length > 0 && mapping[0].product_id) {
      const { data } = await supabase
        .from("products")
        .select(
          "name, short_description, full_description, material, dimensions, price_site, price_marketplace, usage_suggestions, differentials, variations, stock_quantity, stock_status, updated_at"
        )
        .eq("id", mapping[0].product_id)
        .single();
      product = data;
    }
  }

  if (!product) {
    return `Produto: ${productName}\n(Sem informações detalhadas no catálogo)`;
  }

  const parts = [`Produto: ${product.name}`];
  if (product.short_description) parts.push(`Descrição: ${product.short_description}`);
  if (product.full_description) parts.push(`Descrição completa: ${product.full_description}`);
  if (product.material) parts.push(`Material: ${product.material}`);
  if (product.dimensions) parts.push(`Dimensões: ${JSON.stringify(product.dimensions)}`);
  if (product.variations) parts.push(`Variações: ${JSON.stringify(product.variations)}`);
  if (product.usage_suggestions) parts.push(`Sugestões de uso: ${product.usage_suggestions}`);
  if (product.differentials) parts.push(`Diferenciais: ${product.differentials}`);
  // Estoque RELIGADO (27/06): sync diario de estoque ativo (lote ~08:00 BRT em products).
  // SEGURANCA: (1) expoe so DISPONIBILIDADE, nunca a quantidade crua (evita a Ana afirmar
  // numero que pode estar errado); (2) GUARDA DE FRESCOR — se o produto nao e atualizado ha
  // >3 dias, OMITE (sync pode ter quebrado; melhor a Ana nao falar de estoque do que errar).
  const stockStale =
    product.updated_at &&
    Date.now() - new Date(product.updated_at as string).getTime() > 3 * 24 * 60 * 60 * 1000;
  if (!stockStale && product.stock_status) {
    const disp =
      product.stock_status === "in_stock"
        ? "disponível em estoque"
        : product.stock_status === "out_of_stock"
        ? "sem estoque no momento"
        : String(product.stock_status);
    parts.push(`Disponibilidade: ${disp}`);
  }
  // NOTA: estoque por COR/variante ainda nao existe (campo variations vazio). Para perguntas de
  // cor especifica, a Ana NAO deve afirmar disponibilidade da cor — orientar a conferir no anuncio.

  return parts.join("\n");
}

/* ───────────────────── FAQ context ───────────────────── */

async function getFAQContext(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("faq")
    .select("question, answer")
    .eq("is_active", true)
    .limit(20);

  if (!data || data.length === 0) return "";

  return (
    "\n\nFAQ DA EMPRESA:\n" +
    data.map((f: { question: string; answer: string }) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n")
  );
}

/* ───────────────────── Policies context ───────────────────── */

async function getPoliciesContext(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("policies")
    .select("title, content, category")
    .eq("is_active", true)
    .or("marketplace.is.null,marketplace.eq.mercado_livre")
    .order("priority", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";

  return (
    "\n\nPOLÍTICAS:\n" +
    data.map((p: { title: string; content: string }) => `${p.title}: ${p.content}`).join("\n\n")
  );
}

/* ───────────────────── Handle question notification ───────────────────── */

async function handleQuestion(resource: string, userId: number) {
  const supabase = getSupabase();
  const questionId = resource.replace("/questions/", "");

  log("question_received", { questionId });

  const token = await getMLToken(supabase);
  if (!token) {
    log("no_ml_token");
    return;
  }

  const question = await mlGet(`/questions/${questionId}`, token);
  if (!question || question.error) {
    log("fetch_question_failed", { error: question?.error || "unknown" });
    return;
  }

  if (String(question.seller_id) !== String(userId)) {
    log("question_not_for_seller", { seller: question.seller_id, expected: userId });
    return;
  }

  if (question.status === "ANSWERED") {
    log("question_already_answered_on_ml", { questionId });
    return;
  }

  const { data: existing } = await supabase
    .from("marketplace_questions")
    .select("id")
    .eq("platform_question_id", questionId)
    .limit(1);

  if (existing && existing.length > 0) {
    log("question_already_in_db", { questionId });
    return;
  }

  const itemId = String(question.item_id);

  const productName = await fetchItemTitle(itemId, token);
  log("item_title_fetched", { itemId, productName });

  // GUARDA DE ANÚNCIO INATIVO (proativa): não gera nem posta em item inativo.
  // Evita o erro not_active_item e respostas obsoletas de anúncios antigos reingeridos
  // (ex.: pergunta de meses atrás reentrando após reconexão). Registra skipped p/ auditoria.
  const itemInfo = await mlGet(`/items/${itemId}?attributes=id,status`, token);
  if (itemInfo && itemInfo.status && itemInfo.status !== "active") {
    log("item_inactive_skip", { itemId, status: itemInfo.status });
    await supabase.from("marketplace_questions").insert({
      platform: "mercado_livre",
      platform_question_id: questionId,
      platform_item_id: itemId,
      product_name: productName,
      question_text: question.text,
      buyer_nickname: question.from?.nickname || "Comprador",
      seller_id: String(userId),
      status: "skipped",
      error_message: `item_inactive_skip: status=${itemInfo.status}`,
      external_created_at: question.date_created,
    });
    return;
  }

  const productContext = await getProductContext(supabase, itemId, productName);
  const faqContext = await getFAQContext(supabase);
  const policiesContext = await getPoliciesContext(supabase);
  const fullContext = productContext + faqContext + policiesContext;

  const agentConfig = await getAgentConfig(supabase);

  // LEARNING LOOP — pull operator-approved corrections (response_corrections)
  // for questions semantically similar to this one, and inject them into the
  // prompt so the AI reuses the answer a human already verified. Without this
  // the system kept repeating mistakes that had already been corrected.
  const CLEAN_FALLBACK = "Olá! Vou conferir essa informação e te retorno em breve.";
  let correctionContext = "";
  try {
    const hits = await searchCorrections(question.text, 0.65, 3);
    if (hits.length > 0) {
      const lines = hits
        .map(
          (c, i) =>
            `${i + 1}. Pergunta similar: "${c.originalQuestion}"\n   RESPOSTA APROVADA: "${c.recommendedResponse}" (similaridade ${(c.similarity * 100).toFixed(0)}%)`
        )
        .join("\n\n");
      correctionContext = `\n\n## RESPOSTAS APROVADAS PARA PERGUNTAS SIMILARES (USE OBRIGATORIAMENTE)\n\nUm operador humano JÁ corrigiu como esta pergunta deve ser respondida. Você DEVE usar a resposta aprovada abaixo como base, mantendo o mesmo conteúdo informacional.\n\n${lines}`;
      log("corrections_found", { count: hits.length, top: hits[0].similarity });
    } else {
      log("corrections_none_above_threshold", { threshold: 0.65 });
    }
  } catch (e) {
    log("corrections_search_failed", { error: String(e) });
  }

  let aiResult: { answer: string; tokens: number; timeMs: number };
  try {
    aiResult = await generateAIAnswer(
      question.text,
      productName,
      agentConfig,
      fullContext,
      correctionContext
    );
    const validation = validateMLQuestionResponse(aiResult.answer);
    if (validation.forbiddenContactDetected) {
      log("forbidden_contact_blocked_before_ml_post", {
        reasons: validation.forbiddenContactReasons,
        original: aiResult.answer.slice(0, 300),
        questionId,
      });
      // Substitute — priority: (1) operator-approved correction, (2) clean
      // fallback. NEVER reuse a hardcoded phrase that itself trips the
      // validator (the old bug). Always re-validate the substitute.
      let substitute = "";
      try {
        const hits = await searchCorrections(question.text, 0.55, 1);
        if (hits.length > 0) {
          substitute = hits[0].recommendedResponse;
          log("forbidden_substituted_by_correction", { similarity: hits[0].similarity });
        }
      } catch (e) {
        log("forbidden_correction_lookup_failed", { error: String(e) });
      }
      if (!substitute || substitute.trim().length === 0) {
        substitute = CLEAN_FALLBACK;
        log("forbidden_substituted_by_fallback", {});
      }
      const reval = validateMLQuestionResponse(substitute);
      aiResult.answer = reval.forbiddenContactDetected ? CLEAN_FALLBACK : reval.text;
    } else {
      aiResult.answer = validation.text;
    }

    log("ai_answer_generated", {
      timeMs: aiResult.timeMs,
      tokens: aiResult.tokens,
      answerLength: aiResult.answer.length,
      validationWarnings: validation.warnings,
    });
  } catch (e) {
    log("ai_generation_failed", { error: String(e) });

    await supabase.from("marketplace_questions").insert({
      platform: "mercado_livre",
      platform_question_id: questionId,
      platform_item_id: itemId,
      product_name: productName,
      question_text: question.text,
      buyer_nickname: question.from?.nickname || "Comprador",
      seller_id: String(userId),
      status: "failed",
      error_message: `ai_generation_failed: ${String(e)}`,
      external_created_at: question.date_created,
    });
    return;
  }

  let postSuccess = false;
  let postError = "";
  try {
    const postResult = await mlPost(`/answers`, token, {
      question_id: Number(questionId),
      text: aiResult.answer,
    });

    if (postResult.status >= 200 && postResult.status < 300) {
      postSuccess = true;
      log("answer_posted_to_ml", { questionId });
    } else {
      postError = `${postResult.data?.error || "unknown"}: ${JSON.stringify(postResult.data)}`;
      log("post_answer_failed", { status: postResult.status, error: postError });
    }
  } catch (e) {
    postError = `post_exception: ${String(e)}`;
    log("post_answer_exception", { error: String(e) });
  }

  const record: Record<string, unknown> = {
    platform: "mercado_livre",
    platform_question_id: questionId,
    platform_item_id: itemId,
    product_name: productName,
    question_text: question.text,
    buyer_nickname: question.from?.nickname || "Comprador",
    seller_id: String(userId),
    ai_suggested_answer: aiResult.answer,
    ai_response_time_ms: aiResult.timeMs,
    tokens_used: aiResult.tokens,
    external_created_at: question.date_created,
  };

  if (postSuccess) {
    record.status = "answered";
    record.answer_text = aiResult.answer;
    record.answered_by = "ai_agent";
    record.answered_at = new Date().toISOString();
    record.error_message = null;
  } else {
    if (postError.includes("not_active_item")) {
      record.status = "skipped";
      record.error_message = `item_inactive_on_post: ${postError}`;
    } else if (postError.includes("already_answered") || postError.includes("ALREADY_ANSWERED")) {
      record.status = "answered";
      record.answer_text = aiResult.answer;
      record.answered_by = "ai_agent";
      record.answered_at = new Date().toISOString();
      record.error_message = null;
      log("race_condition_already_answered", { questionId });
    } else {
      record.status = "failed";
      record.error_message = postError;
    }
  }

  const { error: insertError } = await supabase
    .from("marketplace_questions")
    .insert(record);

  if (insertError) {
    log("db_insert_failed", { error: insertError.message });
  } else {
    log("question_processed", { questionId, status: record.status });
  }
}

/* ───────────────────── Main handler ───────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { topic, resource, user_id, attempts } = body;

    log("received", { topic, resource, user_id, attempts });

    if (!topic || !resource) {
      return json({ status: "received" });
    }

    switch (topic) {
      case "questions": {
        log("question_notification", { resource });
        handleQuestion(resource, user_id).catch((e) =>
          log("question_handler_error", { error: String(e) })
        );
        break;
      }

      case "items": {
        log("item_notification", { resource });
        break;
      }

      case "orders_v2": {
        log("order_notification", { resource });
        break;
      }

      default: {
        log("unknown_topic", { topic });
        break;
      }
    }

    return json({ status: "received" });
  } catch (e) {
    log("handler_error", { error: String(e) });
    return json({ error: "internal_error" }, 500);
  }
});
