import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateMLQuestionResponse } from "../_shared/ml-response-validator.ts";

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

/* ───────────────────── Get ML access token ───────────────────── */

async function getMLToken(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await supabase
    .from("marketplace_tokens")
    .select("access_token, token_expires_at, refresh_token, id")
    .eq("platform", "mercado_livre")
    .eq("status", "active")
    .limit(1)
    .single();

  if (!data?.access_token) return null;

  // Check if token is expired and refresh if needed
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    log("token_expired_refreshing");
    const refreshed = await refreshMLToken(supabase, data.id, data.refresh_token!);
    return refreshed;
  }

  return data.access_token;
}

async function refreshMLToken(
  supabase: ReturnType<typeof createClient>,
  tokenId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const res = await fetch(`${ML_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: Deno.env.get("ML_APP_ID"),
        client_secret: Deno.env.get("ML_CLIENT_SECRET"),
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (!data.access_token) {
      log("token_refresh_failed", { error: data });
      return null;
    }

    await supabase.from("marketplace_tokens").update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", tokenId);

    log("token_refreshed");
    return data.access_token;
  } catch (e) {
    log("token_refresh_error", { error: String(e) });
    return null;
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
  productContext: string
): Promise<{ answer: string; tokens: number; timeMs: number }> {
  const start = Date.now();

  const systemPrompt = `Você é a Giovana, assistente virtual da Budamix. Você está respondendo uma PERGUNTA DE COMPRADOR no Mercado Livre.

REGRAS PARA PERGUNTAS DO MERCADO LIVRE:
1. Resposta CURTA e DIRETA — máximo 350 caracteres (limite do ML)
2. Tom profissional mas amigável
3. SEM emojis (o ML não renderiza bem)
4. SEM formatação WhatsApp (*negrito*, _itálico_) — use texto puro
5. SEM links — o comprador já está no anúncio
6. SEM saudação longa — vá direto ao ponto
7. Responda EXATAMENTE o que foi perguntado
8. Se não souber a resposta, diga que a informação não está confirmada no cadastro/anúncio e que será verificada internamente. NUNCA peça para o cliente entrar em contato, falar conosco, chamar no WhatsApp, mandar mensagem ou procurar atendimento.
9. NUNCA invente informações que não estão no contexto do produto
10. Use "Olá!" ou "Oi!" como saudação curta se necessário
11. PROIBIÇÃO ABSOLUTA: não use nenhuma variação de "entre em contato conosco", "fale conosco", "nossa equipe técnica", "para mais detalhes", "chame a gente", "mande mensagem" ou redirecionamento para outro canal.

CONTEXTO DO PRODUTO:
${productContext}`;

  const model = agentConfig.model || "claude-sonnet-4-6";
  const temperature = parseFloat(agentConfig.temperature || "0.3");

  let answer = "";
  let tokens = 0;

  if (model.startsWith("claude")) {
    // Anthropic
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
    // OpenAI
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
    // Groq (llama, mixtral, etc)
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
  // Try to find product by platform_item_id in product_listings
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
        "name, short_description, full_description, material, dimensions, price_site, price_marketplace, usage_suggestions, differentials, variations, stock_quantity, stock_status"
      )
      .eq("id", listings[0].product_id)
      .single();
    product = data;
  }

  // Also check marketplace_product_mapping
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
          "name, short_description, full_description, material, dimensions, price_site, price_marketplace, usage_suggestions, differentials, variations, stock_quantity, stock_status"
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
  if (product.stock_status) parts.push(`Estoque: ${product.stock_status} (${product.stock_quantity ?? 0} un.)`);

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

  // Get ML token
  const token = await getMLToken(supabase);
  if (!token) {
    log("no_ml_token");
    return;
  }

  // Fetch question details from ML API
  const question = await mlGet(`/questions/${questionId}`, token);
  if (!question || question.error) {
    log("fetch_question_failed", { error: question?.error || "unknown" });
    return;
  }

  // Only process questions for our seller
  if (String(question.seller_id) !== String(userId)) {
    log("question_not_for_seller", { seller: question.seller_id, expected: userId });
    return;
  }

  // Skip if already answered on ML
  if (question.status === "ANSWERED") {
    log("question_already_answered_on_ml", { questionId });
    return;
  }

  // Check if already in our DB
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

  // Fetch item title from ML API (FIX: was saving item ID as product_name)
  const productName = await fetchItemTitle(itemId, token);
  log("item_title_fetched", { itemId, productName });

  // Get product context from our catalog
  const productContext = await getProductContext(supabase, itemId, productName);
  const faqContext = await getFAQContext(supabase);
  const policiesContext = await getPoliciesContext(supabase);
  const fullContext = productContext + faqContext + policiesContext;

  // Get agent config
  const agentConfig = await getAgentConfig(supabase);

  // Generate AI answer
  let aiResult: { answer: string; tokens: number; timeMs: number };
  try {
    aiResult = await generateAIAnswer(
      question.text,
      productName,
      agentConfig,
      fullContext
    );
    const validation = validateMLQuestionResponse(aiResult.answer);
    if (validation.forbiddenContactDetected) {
      log("forbidden_contact_blocked_before_ml_post", {
        reasons: validation.forbiddenContactReasons,
        original: aiResult.answer.slice(0, 300),
        questionId,
      });
      aiResult.answer = "Olá! No momento essa informação técnica não está confirmada no cadastro do produto. Vamos verificar internamente e atualizar o anúncio quando necessário.";
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

    // Save as failed
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

  // Post answer to ML
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

  // Save to DB — FIX: standardize answered_by to 'ai_agent', clear error_message on success
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
    record.answered_by = "ai_agent"; // FIX: was 'ai'
    record.answered_at = new Date().toISOString();
    record.error_message = null; // FIX: don't leave stale error
  } else {
    // Check if the error is because it was already answered (race condition)
    if (postError.includes("not_active_item")) {
      record.status = "skipped";
      record.error_message = `item_inactive_on_post: ${postError}`;
    } else if (postError.includes("already_answered") || postError.includes("ALREADY_ANSWERED")) {
      // Question was answered by someone else — save but don't mark as error
      record.status = "answered";
      record.answer_text = aiResult.answer;
      record.answered_by = "ai_agent";
      record.answered_at = new Date().toISOString();
      record.error_message = null; // FIX: don't flag as error if answer was delivered
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
        // Process async to respond quickly to ML
        handleQuestion(resource, user_id).catch((e) =>
          log("question_handler_error", { error: String(e) })
        );
        break;
      }

      case "items": {
        log("item_notification", { resource });
        // Future: sync item updates
        break;
      }

      case "orders_v2": {
        log("order_notification", { resource });
        // Future: sync order updates
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
