import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceRareEmojiPolicy } from "../_shared/chat-style.ts";
import {
  attemptPrivateEgress,
  canSendInstagramPrivateMessage,
  isInstagramDirectEnabled,
  planDirectState,
  planInstagramWebhookWork,
  publicCommentAcknowledgement,
  publicCommentChannelNote,
  publicCommentDisabledReply,
  publicCommentPublicOnlySystemPrompt,
} from "./instagram-direct-policy.ts";
// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM-WEBHOOK — Ana atende o Direct do Instagram (@budamix.br)
//
// Mesmo "cérebro" do whatsapp-cloud-webhook (RAG de produtos/correções/políticas/
// FAQ + Claude + visão Gemini + áudio Groq). Muda só o encanamento de entrada/saída,
// porque o Instagram entrega a mensagem no formato Messenger (entry[].messaging[])
// e responde via POST /me/messages com Page access token.
//
// Fluxo: "Instagram API with Facebook Login" (conta IG vinculada à Página do FB).
//   - Receber: webhook do objeto "instagram", campo "messages".
//   - Enviar:  POST https://graph.facebook.com/v25.0/me/messages
//              body { recipient:{id:IGSID}, message:{text} }, Page token.
//   - Janela de 24h para responder (regra da Meta).
//
// Secrets necessários (Supabase → Edge Functions):
//   IG_PAGE_TOKEN          Page access token (System User) c/ instagram_manage_messages
//   IG_VERIFY_TOKEN        token de verificação do webhook (você escolhe a string)
//   IG_BUSINESS_ID         (opcional) id da conta IG, p/ blindar contra eco
//   ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / GROQ_API_KEY  (reuso)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY                            (reuso)
// ─────────────────────────────────────────────────────────────────────────────
// Fluxo "Instagram API with Instagram Login" (login empresarial): envio/leitura via
// graph.instagram.com com Instagram user access token (NÃO Page token do graph.facebook.com).
// App IG: GB ATENDIMENTO-IG (1031407156045572) · conta @budamix.br (IG id 28143817631888077).
// Deploy SEM JWT (verify_jwt=false em config.toml + NO_JWT_FUNCTIONS): o Meta chama sem JWT
// Supabase; a proteção é hub.verify_token (GET) + assinatura HMAC (POST), não o gateway.
const GRAPH = "https://graph.instagram.com";
// ─── Facebook: comentários na Página (orgânicos e de anúncio) ───
// Não existe DM aqui — a Budamix não tem permissão de Messenger. A resposta é
// SEMPRE pública, então ela precisa se bastar sozinha.
const GRAPH_FB = "https://graph.facebook.com/v23.0";
const FB_PAGE_ID = Deno.env.get("FB_PAGE_ID") || "106066888942641";
let FB_TOKEN = null;
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
let IG_TOKEN = Deno.env.get("IG_PAGE_TOKEN"); // fallback inicial; loadIgToken() sobrescreve com o da tabela (renovado pelo cron)
const IG_BUSINESS_ID = Deno.env.get("IG_BUSINESS_ID") || "";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const DEBOUNCE_MS = 8000;
const CHUNK_SEP = "\\\\";
const MAX_CHUNKS = 4;
const IG_TEXT_LIMIT = 950; // Instagram corta texto em ~1000 chars; deixo folga
// Botões (quick replies) do Direct. Limites da Meta: no máximo 13 botões e
// título de até 20 caracteres. Título maior derruba a mensagem INTEIRA em
// silêncio — por isso truncamos aqui em vez de confiar no modelo.
const QR_MAX = 13;
const QR_TITLE_MAX = 20;
const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));

function db(path, init = {}) {
  const h = {
    "Content-Type": "application/json",
    "apikey": SR,
    "Authorization": "Bearer " + SR
  };
  if (init.headers) Object.assign(h, init.headers);
  return fetch(SU + "/rest/v1/" + path, {
    ...init,
    headers: h
  });
}
async function callRpc(name, args) {
  try {
    const r = await db("rpc/" + name, {
      method: "POST",
      body: JSON.stringify(args)
    });
    if (!r.ok) {
      console.log("rpc " + name + " http " + r.status, (await r.text()).slice(0, 160));
      return [];
    }
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (e) {
    console.log("rpc exc " + name, String(e));
    return [];
  }
}
// Cliente do Instagram: keyed por IGSID em phone="ig:<IGSID>", source="instagram".
function igPhone(igsid) {
  return "ig:" + igsid;
}
async function getOrCreateCustomer(igsid, name, prefix = "ig:") {
  const phone = prefix + igsid;
  const r = await db("customers?phone=eq." + encodeURIComponent(phone) + "&select=id");
  const rows = await r.json();
  if (Array.isArray(rows) && rows.length) return rows[0].id;
  const c = await db("customers", {
    method: "POST",
    headers: {
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      phone,
      name: name || null,
      source: prefix === "fb:" ? "facebook" : "instagram",
      marketplace_user_id: igsid
    })
  });
  const bruto = await c.text();
  let cr;
  try { cr = JSON.parse(bruto); } catch (_e) { cr = null; }
  // Falhar aqui em silêncio custa caro: o comentário some sem virar atendimento.
  if (!Array.isArray(cr) || !cr[0] || !cr[0].id) {
    // corrida: outro evento pode ter criado o mesmo cliente entre o select e o insert
    const rr = await db("customers?phone=eq." + encodeURIComponent(phone) + "&select=id&limit=1");
    if (rr.ok) { const rj = await rr.json(); if (Array.isArray(rj) && rj[0]) return rj[0].id; }
    throw new Error("customers insert falhou (" + c.status + "): " + bruto.slice(0, 300));
  }
  return cr[0].id;
}
async function getOrCreateConversation(customerId, channel = "instagram") {
  // Conversa ÚNICA por cliente/canal: reusa sempre a mais recente, independente
  // do status. Escalada/assumida por humano -> reusa como está (handoff guard).
  // Resolvida/fechada com a Ana -> reabre a mesma conversa (status active).
  const r = await db("conversations?customer_id=eq." + customerId + "&channel=eq." + encodeURIComponent(channel) + "&order=started_at.desc&limit=1&select=id,status,assigned_to");
  const rows = await r.json();
  if (Array.isArray(rows) && rows.length) {
    const conv = rows[0];
    if ((conv.assigned_to || "agent") === "agent" && conv.status !== "active") {
      await db("conversations?id=eq." + conv.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" })
      });
    }
    return conv.id;
  }
  const c = await db("conversations", {
    method: "POST",
    headers: {
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      customer_id: customerId,
      channel: channel,
      status: "active",
      assigned_to: "agent"
    })
  });
  const cr = await c.json();
  return cr[0].id;
}
async function saveMessage(conversationId, sender, content, extra = {}) {
  await db("messages", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      sender,
      content,
      ...extra
    })
  });
}
// Grava devolvendo o id (o aceno publico de reclamacao reserva a vez com uma linha).
async function salvarComId(conversationId, sender, content, extra = {}) {
  try {
    const r = await db("messages", {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify({ conversation_id: conversationId, sender, content, ...extra })
    });
    const j = await r.json().catch(()=>null);
    return r.ok && Array.isArray(j) && j[0] ? j[0].id : null;
  } catch (_e) { return null; }
}
async function patchMensagem(id, patch) {
  if (!id) return;
  try { await db("messages?id=eq." + id, { method: "PATCH", body: JSON.stringify(patch) }); } catch (_e) {}
}
async function apagarMensagem(id) {
  if (!id) return;
  try { await db("messages?id=eq." + id, { method: "DELETE" }); } catch (_e) {}
}
// ─── Modelo (01/10/2026): a Ana segue agent_config.model (Opus 5.5, esforco high) ───
// Claude 4.7+ recusa temperature e pensa antes de responder; o texto vem no bloco
// "text". Se o modelo principal falhar, 1 tentativa no modelo de reserva.
const MODELO_PADRAO = "claude-sonnet-4-6";
const MODELO_RESERVA = "claude-sonnet-4-6";
const MODELOS_COM_RACIOCINIO = /claude-(opus-4-[7-9]|opus-[5-9]|sonnet-[5-9]|fable)/i;
let MODELO_CACHE = { v: "", t: 0 };
async function getAgentModel() {
  if (MODELO_CACHE.v && Date.now() - MODELO_CACHE.t < 60000) return MODELO_CACHE.v;
  let v = "";
  try {
    const r = await db("agent_config?config_key=eq.model&select=config_value");
    const rows = await r.json();
    v = Array.isArray(rows) && rows[0]?.config_value ? String(rows[0].config_value).trim() : "";
  } catch (_e) {}
  MODELO_CACHE = { v: v.startsWith("claude") ? v : MODELO_PADRAO, t: Date.now() };
  return MODELO_CACHE.v;
}
async function chamarClaude(system, messages, maxTokens = 800) {
  const principal = await getAgentModel();
  const fila = [principal, ...[MODELO_RESERVA].filter((m)=>m !== principal)];
  for (const modelo of fila) {
    const body = { model: modelo, max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages };
    if (MODELOS_COM_RACIOCINIO.test(modelo)) { body.max_tokens = Math.max(maxTokens, 8000); body.output_config = { effort: "high" }; }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(()=>({}));
      if (!res.ok || j.error) { console.log("anthropic err " + modelo + " http " + res.status, JSON.stringify(j.error || j).slice(0, 300)); continue; }
      const bloco = Array.isArray(j.content) ? j.content.find((c)=>c && c.type === "text" && c.text) : null;
      const text = bloco ? bloco.text : "";
      if (!text.trim()) { console.log("anthropic sem texto " + modelo, String(j.stop_reason || "")); continue; }
      if (modelo !== principal) console.log("modelo de reserva usado: " + principal + " -> " + modelo);
      const u = j.usage || {};
      return { text, tokens_in: u.input_tokens || 0, tokens_out: u.output_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0, model: modelo };
    } catch (e) { console.log("anthropic exc " + modelo, String(e)); }
  }
  return { text: "", tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0, model: "" };
}
async function getSystemPrompt() {
  try {
    const r = await db("agent_config?config_key=eq.system_prompt&select=config_value");
    const rows = await r.json();
    if (Array.isArray(rows) && rows[0]?.config_value) return rows[0].config_value;
  } catch (_e) {}
  return "Voce e a Ana, atendente da Budamix (utilidades domesticas). Responda de forma natural, humana e prestativa, em portugues do Brasil, frases curtas.";
}
async function getInstagramDirectState() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const r = await db("agent_config?config_key=eq.instagram_direct_enabled&select=config_value", {
      signal: controller.signal,
    });
    if (!r.ok) {
      console.log("instagram direct config http", r.status);
      return "unavailable";
    }
    const rows = await r.json();
    return isInstagramDirectEnabled(Array.isArray(rows) ? rows[0]?.config_value : null)
      ? "enabled"
      : "disabled";
  } catch (e) {
    console.log("instagram direct config exc", String(e));
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}
async function getInstagramDirectEnabled() {
  return (await getInstagramDirectState()) === "enabled";
}
async function getRecentMessages(conversationId) {
  const r = await db("messages?conversation_id=eq." + conversationId + "&order=created_at.desc&limit=20&select=sender,content,created_at");
  const rows = await r.json();
  if (!Array.isArray(rows)) return [];
  return rows.reverse();
}
async function getLatestCustomerMsgId(conversationId) {
  const r = await db("messages?conversation_id=eq." + conversationId + "&sender=eq.customer&order=created_at.desc&limit=1&select=whatsapp_message_id");
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].whatsapp_message_id ?? null : null;
}
async function getConversationAssignee(conversationId) {
  const r = await db("conversations?id=eq." + conversationId + "&select=assigned_to");
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].assigned_to ?? null : null;
}
async function generateEmbedding(text) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 2000)
      })
    });
    const j = await r.json();
    if (j.error || !j.data || !j.data[0]) {
      console.log("embed err", JSON.stringify(j.error || j).slice(0, 160));
      return null;
    }
    return j.data[0].embedding;
  } catch (e) {
    console.log("embed exc", String(e));
    return null;
  }
}
function money(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return "R$ " + n.toFixed(2).replace(".", ",");
}
function jsonObj(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    const o = JSON.parse(String(v));
    return o && typeof o === "object" ? o : null;
  } catch  {
    return null;
  }
}
function fmtProduct(p) {
  const lines = [];
  lines.push("• " + (p.name || p.sku) + " (SKU " + p.sku + (p.product_line ? ", linha " + p.product_line : "") + ")");
  const desc = p.short_description || p.full_description;
  if (desc) lines.push("  " + String(desc).replace(/\s+/g, " ").slice(0, 280));
  if (p.material) lines.push("  Material: " + p.material);
  const priceParts = [];
  const ps = money(p.price_site);
  if (ps) priceParts.push("Site " + ps);
  const mp = jsonObj(p.price_marketplace);
  if (mp) {
    for (const [k, v] of Object.entries(mp)){
      const m = money(v);
      if (m) priceParts.push(k + " " + m);
    }
  }
  if (priceParts.length) lines.push("  Preco: " + priceParts.join(" | "));
  const est = ((p.stock_status || "") + (p.stock_quantity != null ? " (" + p.stock_quantity + " un)" : "")).trim();
  if (est) lines.push("  Estoque: " + est);
  if (p.differentials) lines.push("  Diferenciais: " + String(p.differentials).replace(/\s+/g, " ").slice(0, 200));
  if (p.usage_suggestions) lines.push("  Uso: " + String(p.usage_suggestions).replace(/\s+/g, " ").slice(0, 160));
  if (p.site_link) lines.push("  Link site: " + p.site_link);
  const links = jsonObj(p.marketplace_links);
  if (links) {
    const lp = Object.entries(links).filter(([_, v])=>v).map(([k, v])=>k + ": " + v);
    if (lp.length) lines.push("  Links marketplace: " + lp.join(" | "));
  }
  return lines.join("\n");
}
async function getPolicies() {
  try {
    // Escopo por canal: só policies GLOBAIS (marketplace null) + do DM do IG (instagram_dm).
    // Evita vazamento de policy de outro canal (ex.: "canal público ML") pro DM, que é privado.
    const r = await db("policies?is_active=eq.true&or=(marketplace.is.null,marketplace.eq.instagram_dm)&select=title,category,marketplace,summary&order=priority.desc&limit=6");
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return "";
    return rows.map((p)=>"- [" + (p.category || "geral") + (p.marketplace ? "/" + p.marketplace : "") + "] " + p.title + (p.summary ? ": " + p.summary : "")).join("\n");
  } catch (_e) {
    return "";
  }
}
async function getFaqs() {
  try {
    const r = await db("faq?is_active=eq.true&select=question,answer&order=usage_count.desc&limit=8");
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return "";
    return rows.map((f)=>"P: " + f.question + "\nR: " + f.answer).join("\n\n");
  } catch (_e) {
    return "";
  }
}
function latestUserText(history) {
  const parts = [];
  for(let i = history.length - 1; i >= 0; i--){
    if (history[i].sender === "customer") parts.unshift(history[i].content);
    else break;
  }
  return parts.join(" ").trim();
}
async function buildGrounding(queryText) {
  if (!queryText || queryText.trim().length < 2) return "";
  const sections = [];
  const embedding = await generateEmbedding(queryText);
  if (embedding) {
    const [prodRows, corrRows] = await Promise.all([
      callRpc("match_products", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.3,
        match_count: 6
      }),
      callRpc("search_corrections", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: 0.65,
        match_count: 3,
        p_channel: "instagram"
      })
    ]);
    if (corrRows.length) sections.push("## CORRECOES APRENDIDAS (referencia PRIORITARIA — respostas ja validadas pela equipe)\n" + corrRows.map((c)=>"P: " + c.original_question + "\nR: " + c.recommended_response).join("\n\n"));
    if (prodRows.length) sections.push("## Produtos Relevantes (catalogo REAL — preco e estoque atuais)\n" + prodRows.map(fmtProduct).join("\n\n"));
  }
  const [pol, faqs] = await Promise.all([
    getPolicies(),
    getFaqs()
  ]);
  if (pol) sections.push("## Politicas Relevantes\n" + pol);
  if (faqs) sections.push("## Perguntas Frequentes\n" + faqs);
  if (!sections.length) return "";
  return "=== CONTEXTO DE ATENDIMENTO (dados REAIS da Budamix) ===\nUse SOMENTE as informacoes abaixo para falar de produtos, precos, estoque, links, prazos e politicas. Se a info NAO estiver aqui, diga que vai verificar — NUNCA invente produto, preco, estoque ou link.\n\n" + sections.join("\n\n");
}
async function anaReply(systemPrompt, history, contextBlock) {
  const raw = history.filter((m)=>m.content && m.content.trim()).map((m)=>({
      role: m.sender === "customer" ? "user" : "assistant",
      content: m.content
    }));
  const merged = [];
  for (const m of raw){
    if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += "\n" + m.content;
    else merged.push({
      role: m.role,
      content: m.content
    });
  }
  while(merged.length && merged[0].role !== "user")merged.shift();
  if (!merged.length) return { text: "", tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 };
  if (contextBlock && contextBlock.trim()) {
    for(let i = merged.length - 1; i >= 0; i--){
      if (merged[i].role === "user") {
        merged[i].content = contextBlock.trim() + "\n\n---\n# Mensagem atual do cliente:\n" + merged[i].content;
        break;
      }
    }
  }
  // A API recusa historico que termina em 'assistant' (falha muda): corta o fim.
  while(merged.length && merged[merged.length - 1].role !== "user")merged.pop();
  if (!merged.length) return { text: "", tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 };
  return await chamarClaude(systemPrompt, merged, 800);
}
// Quebra a resposta em "balões" e respeita o limite de tamanho do Instagram.
function hardWrap(s) {
  const out = [];
  let t = s.trim();
  while (t.length > IG_TEXT_LIMIT) {
    let cut = t.lastIndexOf(" ", IG_TEXT_LIMIT);
    if (cut < IG_TEXT_LIMIT * 0.6) cut = IG_TEXT_LIMIT;
    out.push(t.slice(0, cut).trim());
    t = t.slice(cut).trim();
  }
  if (t) out.push(t);
  return out;
}
function splitChunks(text) {
  let chunks = text.split(CHUNK_SEP).map((c)=>c.trim()).filter((c)=>c.length > 0);
  if (chunks.length <= 1 && text.includes("\n\n")) {
    const nn = text.split(/\n\n+/).map((c)=>c.trim()).filter((c)=>c.length > 0);
    if (nn.length > 1) chunks = nn;
  }
  if (chunks.length === 0) return [];
  if (chunks.length > MAX_CHUNKS) chunks = chunks.slice(0, MAX_CHUNKS);
  // garante o limite de caracteres do IG em cada balão
  return chunks.flatMap(hardWrap).slice(0, MAX_CHUNKS + 2);
}
// ─── Envio / ações no Instagram (Graph API, Page token) ───
async function igAction(igsid, sender_action) {
  if (!IG_TOKEN) return;
  try {
    const r = await fetch(GRAPH + "/me/messages?access_token=" + IG_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: igsid }, sender_action })
    });
    const j = await r.json();
    if (j.error) console.log("ig action err", sender_action, JSON.stringify(j.error));
  } catch (e) {
    console.log("ig action exc", String(e));
  }
}
async function igPost(igsid, message) {
  const r = await fetch(GRAPH + "/me/messages?access_token=" + IG_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igsid }, message })
  });
  return await r.json();
}
async function sendOne(igsid, body, quickReplies) {
  if (!IG_TOKEN) {
    console.log("IG_PAGE_TOKEN missing - skip send");
    return;
  }
  const message = { text: body };
  if (quickReplies && quickReplies.length) message.quick_replies = quickReplies;
  const j = await igPost(igsid, message);
  if (!j.error) return;
  console.log("ig send err", JSON.stringify(j.error));
  // Botão recusado NUNCA pode calar a Ana: reenvia o mesmo texto sem os botões.
  if (message.quick_replies) {
    const j2 = await igPost(igsid, { text: body });
    if (j2.error) console.log("ig send retry err", JSON.stringify(j2.error));
    else console.log("ig send: botoes recusados, texto entregue sem eles");
  }
}
async function privateEgressAllowed(acceptedEnabled = true) {
  return await attemptPrivateEgress(
    acceptedEnabled,
    getInstagramDirectEnabled,
    async () => true,
  );
}
async function guardedIgAction(igsid, sender_action, acceptedEnabled = true) {
  return await attemptPrivateEgress(
    acceptedEnabled,
    getInstagramDirectEnabled,
    async () => { await igAction(igsid, sender_action); return true; },
  );
}
async function guardedSendOne(igsid, body, acceptedEnabled = true, quickReplies) {
  return await attemptPrivateEgress(
    acceptedEnabled,
    getInstagramDirectEnabled,
    async () => { await sendOne(igsid, body, quickReplies); return true; },
  );
}
async function sendInstagram(igsid, text, acceptedEnabled = true, quickReplies) {
  const chunks = splitChunks(text);
  let sent = false;
  for(let i = 0; i < chunks.length; i++){
    if (i > 0 && !await guardedIgAction(igsid, "typing_on", acceptedEnabled)) return sent;
    const delay = Math.min(Math.max(chunks[i].length * 45, 1000), 3500);
    await sleep(delay);
    // Os botões só existem colados no último balão — no meio da rajada eles
    // sumiriam assim que o balão seguinte chegasse.
    const qr = (i === chunks.length - 1) ? quickReplies : undefined;
    if (!await guardedSendOne(igsid, chunks[i], acceptedEnabled, qr)) return sent;
    sent = true;
  }
  return sent;
}
// Busca nome/username do cliente (best-effort; depende da permissão de mensagens).
async function fetchProfile(igsid) {
  if (!IG_TOKEN) return "";
  try {
    const r = await fetch(GRAPH + "/" + igsid + "?fields=name,username&access_token=" + IG_TOKEN);
    const j = await r.json();
    if (j && (j.name || j.username)) return j.name || ("@" + j.username);
  } catch (_e) {}
  return "";
}
// ─── MIDIA: Instagram entrega URL direta no webhook (sem media-id) ───
async function downloadUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download " + res.status);
  const mime = res.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), bytes: buf, mime };
}
function extFor(mime) {
  const mm = (mime || "").split(";")[0].trim().toLowerCase();
  const map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/zip": "zip" };
  if (map[mm]) return map[mm];
  if (mm.startsWith("image/")) return "jpg";
  if (mm.startsWith("audio/")) return "ogg";
  if (mm.startsWith("video/")) return "mp4";
  return "bin";
}
// Tipo que o navegador executaria (pagina, script, svg) e guardado como arquivo comum: so baixa, nao abre.
const TIPOS_QUE_EXECUTAM = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/(x-)?javascript|application\/ecmascript)$/i;
async function uploadToStorage(kind, convId, msgId, bytes, mime) {
  const safeId = String(msgId).replace(/[^A-Za-z0-9_-]/g, "_");
  const path = kind + "/" + convId + "/" + safeId + "." + extFor(mime);
  let ct = (mime || "").split(";")[0].trim() || "application/octet-stream";
  if (TIPOS_QUE_EXECUTAM.test(ct)) ct = "application/octet-stream";
  const r = await fetch(SU + "/storage/v1/object/chat-attachments/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + SR, apikey: SR, "Content-Type": ct, "x-upsert": "true", "Cache-Control": "3600" },
    body: bytes
  });
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 140);
    // Tipo fora da lista do bucket: guarda como arquivo comum (a tela oferece baixar), em vez de perder
    if (ct !== "application/octet-stream" && /mime|type/i.test(corpo)) return uploadToStorage(kind, convId, msgId, bytes, "application/octet-stream");
    throw new Error("storage " + r.status + " " + corpo);
  }
  return SU + "/storage/v1/object/public/chat-attachments/" + path;
}
async function transcribeAudio(base64, mime) {
  if (!GROQ_KEY) return null;
  const bytes = Uint8Array.from(atob(base64), (c)=>c.charCodeAt(0));
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mime || "audio/ogg" }), "audio.ogg");
  fd.append("model", "whisper-large-v3");
  fd.append("language", "pt");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + GROQ_KEY },
    body: fd
  });
  const j = await r.json();
  return j && j.text ? j.text : null;
}
async function describeImage(base64, mime) {
  if (!GEMINI_KEY) return null;
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_KEY;
  const payload = {
    contents: [{ parts: [
      { text: "Descreva objetivamente esta imagem enviada por um cliente da Budamix (utilidades domesticas), focando no que importa para o atendimento: produto/objeto mostrado, cor, defeito ou dano, texto/etiqueta visivel, comprovante de pagamento. Seja conciso (1-3 frases), em portugues." },
      { inline_data: { mime_type: (mime || "image/jpeg").split(";")[0], data: base64 } }
    ] }]
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  const t = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
  return t || null;
}
// ─── ANEXOS p/ a tela do Canggu (01/10/2026) ───
// Antes so o 1o anexo de foto/audio/video ficava guardado. Story, post ou reels compartilhado,
// card de produto, arquivo e a 2a foto em diante se perdiam (a equipe via "[template recebido]").
// Agora cada anexo vai para metadata.attachments com o arquivo guardado (quando ha) e o link.
const IG_COMPARTILHADO = {
  share: "Publicação compartilhada",
  ig_post: "Publicação compartilhada",
  story_mention: "Story que menciona a Budamix",
  story_reply: "Resposta a um story",
  ig_reel: "Reels compartilhado",
  reel: "Reels compartilhado",
  template: "Conteúdo compartilhado",
  fallback: "Link compartilhado"
};
const IG_KIND = { image: "image", animated_image: "image", video: "video", audio: "audio", file: "document" };
const LIMITE_ARQUIVO = 25 * 1024 * 1024; // limite do bucket chat-attachments
async function baixarLimitado(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("download " + res.status);
  if ((Number(res.headers.get("content-length")) || 0) > LIMITE_ARQUIVO) {
    try { await res.body?.cancel(); } catch (_e) {}
    return null;
  }
  const mime = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > LIMITE_ARQUIVO) return null;
  return { bytes, mime, size: bytes.length };
}
// URL da midia, link e titulo, no formato de cada tipo (post, reels, card de produto, link)
function midiaDoAnexo(a) {
  const p = a && a.payload || {};
  const el = p.generic && p.generic.elements && p.generic.elements[0] || p.elements && p.elements[0] || p.product && p.product.elements && p.product.elements[0] || null;
  if (a && a.type === "fallback") return { url: null, link: p.url || null, title: p.title || null };
  return {
    url: p.url || el && el.image_url || null,
    link: el && el.default_action && el.default_action.url || el && el.url || p.link || null,
    title: el && el.title || p.title || null
  };
}
async function guardarAnexosExtras(message, convId, msgId, metaPrimeiro) {
  const atts = message && message.attachments || [];
  const lista = [];
  for (let i = 0; i < atts.length && i < 10; i++) {
    const a = atts[i] || {};
    const tipo = a.type || "anexo";
    // 1o anexo de foto/audio/video e tratado em processarPrimeiroAnexo (chaves image_url/audio_url/video_url)
    if (i === 0 && (tipo === "image" || tipo === "audio" || tipo === "video")) continue;
    const { url, link, title } = midiaDoAnexo(a);
    const rotulo = IG_COMPARTILHADO[tipo] || null;
    const item = { kind: IG_KIND[tipo] || "link", url: null, title: rotulo, link };
    if (rotulo && title && title !== rotulo) item.caption = String(title).slice(0, 300);
    if (url) {
      try {
        const arq = await baixarLimitado(url);
        if (!arq) item.upload_error = "arquivo maior que 25 MB";
        else {
          const kind = IG_KIND[tipo] || (arq.mime.startsWith("image/") ? "image" : arq.mime.startsWith("video/") ? "video" : arq.mime.startsWith("audio/") ? "audio" : "document");
          // IG entrega voz como video/mp4: normaliza p/ o <audio> tocar (igual ao 1o anexo)
          const mime = kind === "audio" && !arq.mime.startsWith("audio/") ? "audio/mp4" : arq.mime;
          item.kind = kind;
          item.mime = mime;
          item.size = arq.size;
          item.url = await uploadToStorage(kind, convId, i ? msgId + "_" + i : msgId, arq.bytes, mime);
        }
      } catch (e) {
        console.log("anexo extra err", String(e));
        item.upload_error = String(e).slice(0, 160);
      }
    }
    lista.push(item);
  }
  return lista;
}
async function processAttachments(message, convId, msgId) {
  const r = await processarPrimeiroAnexo(message, convId, msgId);
  if (!r) return r;
  const lista = await guardarAnexosExtras(message, convId, msgId, r.meta || {});
  if (lista.length) {
    r.meta = r.meta || {};
    r.meta.attachments = lista;
    // Formato cru dos tipos novos (story, card, reels...) para conferencia: so tipo e payload
    r.meta.ig_payload = JSON.stringify((message.attachments || []).map((a)=>({ type: a && a.type, payload: a && a.payload }))).slice(0, 2000);
  }
  return r;
}
// Processa o 1o anexo do Instagram (image / audio / video / share / story_mention): o texto que a Ana le.
async function processarPrimeiroAnexo(message, convId, msgId) {
  const atts = message && message.attachments || [];
  if (!atts.length) return null;
  const a = atts[0];
  const url = a && a.payload && a.payload.url;
  const meta = {};
  try {
    if (a.type === "image" && url) {
      const md = await downloadUrl(url);
      const imgMime = (md.mime && md.mime.startsWith("image/")) ? md.mime : "image/jpeg"; // blinda content-type p/ o <img> renderizar
      try {
        meta.image_url = await uploadToStorage("image", convId, msgId, md.bytes, imgMime);
        meta.image_mimetype = imgMime;
      } catch (e) { console.log("img upload err", String(e)); }
      const desc = await describeImage(md.base64, md.mime);
      if (desc) meta.ai_description = desc;
      return { text: desc ? "[Foto enviada pelo cliente] " + desc : "[Foto recebida]", meta };
    }
    if (a.type === "audio" && url) {
      const md = await downloadUrl(url);
      // IG entrega voz como video/mp4 → normaliza p/ audio/mp4 (.m4a), senão o <audio> do front não toca.
      const audMime = (md.mime && md.mime.startsWith("audio/")) ? md.mime : "audio/mp4";
      try {
        meta.audio_url = await uploadToStorage("audio", convId, msgId, md.bytes, audMime);
        meta.audio_mimetype = audMime;
      } catch (e) { console.log("audio upload err", String(e)); }
      const txt = await transcribeAudio(md.base64, md.mime);
      meta.transcribed = !!(txt && txt.trim());
      return { text: txt && txt.trim() ? txt.trim() : "[Audio recebido]", meta };
    }
    if (a.type === "story_mention") {
      return { text: "[O cliente mencionou a Budamix em um story]", meta };
    }
    if (a.type === "share" || a.type === "story_reply") {
      const cap = (message.text || "").trim();
      return { text: (cap ? cap + " " : "") + "[O cliente respondeu/compartilhou um conteudo do Instagram]", meta };
    }
    if (a.type === "video" && url) {
      try {
        // sem base64 e com teto: video grande nem entra na memoria da funcao
        const md = await baixarLimitado(url);
        if (!md) meta.upload_error = "arquivo maior que 25 MB";
        else {
          meta.video_url = await uploadToStorage("video", convId, msgId, md.bytes, md.mime);
          meta.video_mimetype = md.mime;
        }
      } catch (e) {
        console.log("video upload err", String(e));
        meta.upload_error = String(e).slice(0, 160);
      }
      return { text: "[Video recebido]", meta };
    }
  } catch (e) {
    console.log("attachment err", String(e));
  }
  return { text: "[" + (a.type || "anexo") + " recebido]", meta };
}
// Um evento de mensagem do Instagram (já filtrado: tem message, não é eco).
async function handleEvent(ev) {
  const igsid = ev.sender && ev.sender.id;
  const message = ev.message || {};
  if (!igsid) return;
  const mid = message.mid || ("ts_" + (ev.timestamp || ""));
  let text = (message.text || "").trim();
  let mediaMeta = {};
  let mtype = "text";
  // Toque em botão: o Instagram manda o TÍTULO em message.text (que já é o
  // sinal que a Ana lê) e o código interno em quick_reply.payload. Guardamos o
  // payload só para conferência — o roteamento é pelo título mesmo.
  if (message.quick_reply && message.quick_reply.payload) {
    mediaMeta.quick_reply_payload = String(message.quick_reply.payload).slice(0, 120);
    if (!text) text = mediaMeta.quick_reply_payload;
  }

  const name = await fetchProfile(igsid);
  const customerId = await getOrCreateCustomer(igsid, name);
  const convId = await getOrCreateConversation(customerId);

  if (message.attachments && message.attachments.length) {
    mtype = message.attachments[0].type || "attachment";
    const r = await processAttachments(message, convId, mid);
    if (r) {
      if (r.text && r.text.trim()) text = text ? text + "\n" + r.text : r.text;
      mediaMeta = r.meta || {};
    }
  }
  if (!text) text = "[mensagem sem texto]";

  await saveMessage(convId, "customer", text, {
    message_type: mtype,
    whatsapp_message_id: mid,
    metadata: Object.keys(mediaMeta).length ? mediaMeta : undefined
  });
  return { igsid, convId, lastMsgId: mid };
}
// Mensagem "desfeita" (unsend) pelo cliente no Instagram -> apaga a nossa copia
// (privacidade/LGPD + exigencia da Meta: deletar a copia local quando o usuario apaga).
async function deleteMessageByMid(mid) {
  if (!mid) return;
  try {
    const r = await db("messages?whatsapp_message_id=eq." + encodeURIComponent(mid), { method: "DELETE" });
    if (!r.ok) console.log("ig unsend del http " + r.status, (await r.text()).slice(0, 160));
    else console.log("ig unsend: apagada copia local mid=" + mid);
  } catch (e) {
    console.log("ig unsend exc", String(e));
  }
}
// Carrega o token IG da tabela integration_tokens (renovado pelo cron a cada 3 dias);
// cai pro env IG_PAGE_TOKEN se a tabela ainda estiver vazia (1o boot, antes do 1o refresh).
async function loadIgToken() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const r = await db("integration_tokens?provider=eq.instagram&select=access_token&limit=1", {
      signal: controller.signal,
    });
    if (r.ok) {
      const j = await r.json();
      if (j[0] && j[0].access_token) IG_TOKEN = j[0].access_token;
    }
  } catch (e) {
    console.log("loadIgToken exc", String(e));
  } finally {
    clearTimeout(timeout);
  }
}
// Botões: a Ana sinaliza com [[BOTOES: Opção A | Opção B]] no fim da resposta.
// Precisa rodar ANTES de escalateIfFlagged, que apaga todo [[...]] do texto.
function extractQuickReplies(reply) {
  const m = reply.match(/\[\[\s*BOTOES\s*:?\s*([^\]]*)\]\]/i);
  if (!m) return { quickReplies: [], reply };
  const stripped = reply
    .replace(/\s*\[\[\s*BOTOES\s*:?[^\]]*\]\]\s*/gi, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  const quickReplies = (m[1] || "")
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, QR_MAX)
    .map((t) => {
      // corta por ponto de código, não por unidade UTF-16: acento e emoji contam 1
      const title = Array.from(t).slice(0, QR_TITLE_MAX).join("");
      const payload = "QR_" + title.toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
      return { content_type: "text", title, payload: payload || "QR" };
    });
  return { quickReplies, reply: stripped };
}
const BUTTONS_NOTE = "## Botoes (so no Direct do Instagram)\nVoce pode oferecer botoes tocaveis. Para isso termine a resposta com o marcador [[BOTOES: Texto A | Texto B]] — o marcador e INTERNO, some antes de chegar no cliente, e os botoes aparecem colados no ultimo balao.\nREGRAS: no maximo 13 botoes; cada texto com no maximo 20 caracteres; nunca use botao quando a resposta pedir texto livre (CEP, nome, numero do pedido, endereco).\nUSE NA TRIAGEM: ao perguntar se e revenda ou uso pessoal, termine com [[BOTOES: Atacado — CNPJ | Uso pessoal]].\nUse tambem quando a escolha for curta e fechada (ex.: cor: [[BOTOES: Tampa vermelha | Tampa cinza]]). Fora disso, responda em texto normal.";
// Token da Página do Facebook: derivado do token de Ads via /me/accounts.
// Assim não há segredo novo pra guardar nem pra renovar — se o de Ads vive, esse vive.
async function loadFbPageToken() {
  if (FB_TOKEN) return FB_TOKEN;
  try {
    const r = await db("integration_tokens?provider=eq.meta_ads&select=access_token&limit=1");
    if (!r.ok) return null;
    const j = await r.json();
    const adsTok = j[0] && j[0].access_token;
    if (!adsTok) return null;
    const a = await fetch(GRAPH_FB + "/me/accounts?fields=id,access_token&access_token=" + adsTok);
    const aj = await a.json();
    if (aj.error) { console.log("fb page token err", JSON.stringify(aj.error)); return null; }
    const page = (aj.data || []).find((p) => p.id === FB_PAGE_ID) || (aj.data || [])[0];
    FB_TOKEN = (page && page.access_token) || null;
  } catch (e) { console.log("loadFbPageToken exc", String(e)); }
  return FB_TOKEN;
}
async function sendPublicFacebookReply(commentId, text) {
  const tok = await loadFbPageToken();
  if (!tok) { console.log("fb reply: sem token da pagina"); return false; }
  try {
    const r = await fetch(GRAPH_FB + "/" + commentId + "/comments?access_token=" + tok, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const j = await r.json();
    if (j.error) { console.log("fb reply err", JSON.stringify(j.error)); return false; }
    return true;
  } catch (e) { console.log("fb reply exc", String(e)); return false; }
}
// Escalonamento: a Ana sinaliza com [[ESCALAR: motivo]] quando o caso precisa de humano.
const ESCALATION_NOTE = "## Quando escalar (humano) vs resolver sozinha\nESCALE SOMENTE se: o cliente pedir explicitamente falar com humano/atendente DEPOIS de voce ja ter tentado ajudar; mencao a Procon/processo/advogado/disputa formal; cliente muito irritado/ofensivo; pagamento duplicado ou dinheiro que so a equipe pode mover; a compra foi no SITE Budamix (a equipe resolve direto — colete nº do pedido e foto antes de escalar); ou voce ja orientou o passo a passo e o cliente nao conseguiu / o problema persiste.\nNAO ESCALE de primeira: produto quebrado/com defeito/errado/faltando ou pedido que nao chegou em compra de MARKETPLACE. Nesses casos VOCE resolve guiando o cliente no AUTOATENDIMENTO do canal da compra: acolha em uma frase, pergunte onde comprou (se nao souber), peca nº do pedido e foto quando ajudar, e oriente passo a passo a abrir a solicitacao NO PROPRIO app/site onde comprou — Mercado Livre: Minhas compras > toca no pedido > 'Devolver ou reclamar'; Shopee: Minhas compras > toca no pedido > 'Pedido de Devolucao/Reembolso'; Amazon: Meus pedidos > toca no pedido > 'Devolver ou substituir itens'. Explique que a plataforma exige que a solicitacao seja aberta pelo proprio cliente, que e rapido e seguro, e que voce acompanha e tira duvidas em cada passo.\nFORMATO quando escalar: comece a resposta EXATAMENTE com o marcador [[ESCALAR: motivo curto]] e depois UMA frase curta avisando que vai transferir. O marcador e INTERNO: NUNCA pode aparecer no meio ou no fim do texto.";
async function escalateIfFlagged(reply, convId, channel, preview) {
  // O marcador e instrucao interna: detecta em QUALQUER posicao (a IA as vezes
  // erra e poe no fim) e remove todo [[...]] antes do envio — nunca vaza pro cliente.
  const m = reply.match(/\[\[\s*ESCALAR\s*:?\s*([^\]]*)\]\]/i);
  const stripped = reply.replace(/\s*\[\[[^\]]*\]\]\s*/gi, " ").replace(/ {2,}/g, " ").trim();
  if (!m) return { escalated: false, reply: stripped };
  const reason = (m[1] || "").trim() || "Cliente precisa de atendimento humano";
  const clean = stripped || "Vou te transferir para um atendente humano, ja ja alguem te responde por aqui.";
  try {
    await fetch(SU + "/functions/v1/escalate-notify?key=" + encodeURIComponent(Deno.env.get("IG_VERIFY_TOKEN") || ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: convId, reason, channel, preview: (preview || "").slice(0, 180) })
    });
  } catch (e) { console.log("escalate call err", String(e)); }
  return { escalated: true, reply: clean };
}
// Depois de salvar a rajada, decide e responde (uma vez por conversa).
async function replyConversation(convId, igsid, lastMsgId, acceptedEnabled) {
  await sleep(DEBOUNCE_MS);
  if (!await privateEgressAllowed(acceptedEnabled)) return;
  const latestId = await getLatestCustomerMsgId(convId);
  if (latestId && latestId !== lastMsgId) return; // chegou msg mais nova -> ela responde a rajada
  const assignee = await getConversationAssignee(convId);
  if (assignee && assignee !== "agent") return;    // humano assumiu -> Ana fica quieta

  const sys = await getSystemPrompt();
  if (!await guardedIgAction(igsid, "mark_seen", acceptedEnabled)) return;
  if (!await guardedIgAction(igsid, "typing_on", acceptedEnabled)) return;
  const hist = await getRecentMessages(convId);
  const t0 = Date.now();
  let ctx = await buildGrounding(latestUserText(hist));
  const originNote = "## Cliente\nEste atendimento chegou pelo DIRECT DO INSTAGRAM (@budamix.br). NAO pergunte por onde o cliente nos encontrou. Para link de compra, prefira o do site da Budamix. Respostas curtas, no maximo ~2 paragrafos por balao.";
  const notes = originNote + "\n\n" + BUTTONS_NOTE + "\n\n" + ESCALATION_NOTE;
  ctx = ctx ? ctx + "\n\n" + notes : "=== CONTEXTO DE ATENDIMENTO ===\n" + notes;
  const gen = await anaReply(sys, hist, ctx);
  let reply = gen.text;
  const response_time_ms = Date.now() - t0;
  const tokens_in = gen.tokens_in || 0;
  const tokens_out = gen.tokens_out || 0;
  const tokens_cache_read = gen.cache_read || 0;
  const tokens_cache_write = gen.cache_write || 0;
  const tokens_used = (tokens_in + tokens_out) || null;
  if (reply && reply.trim()) {
    const qr = extractQuickReplies(reply);   // antes do escalateIfFlagged, que apaga [[...]]
    reply = qr.reply;
    const esc = await escalateIfFlagged(reply, convId, "instagram", latestUserText(hist));
    reply = enforceRareEmojiPolicy(esc.reply, latestUserText(hist));
    // Quem vai falar com humano não escolhe botão.
    const buttons = esc.escalated ? [] : qr.quickReplies;
    if (reply && reply.trim()) {
      const sent = await sendInstagram(igsid, reply, acceptedEnabled, buttons);
      if (sent) {
        await saveMessage(convId, "agent", reply, {
          response_time_ms, tokens_used, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write,
          metadata: buttons.length ? { quick_replies: buttons.map((b) => b.title) } : undefined
        });
      }
    }
  }
}
// ─── Comentários (posts + anúncios do Instagram) — modo híbrido: DM completo + reply público curto ───
// Reclamação em comentário público é assunto de gente, não de robô: pedido não
// entregue, acusação de golpe, produto com defeito, cobrança. A Ana registra e
// chama a equipe — responder isso sozinha, em público, faz mais estrago que bem.
function commentLooksLikeComplaint(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const kw = [
    "golpe", "fraude", "enganac", "enganaç", "picaret", "ladra", "ladrão", "ladrao", "roubo",
    "não recebi", "nao recebi", "não recebo", "nao recebo", "não chegou", "nao chegou",
    "não veio", "nao veio", "não entregue", "nao entregue", "nunca chegou", "recibi", "recibo",
    "quebrad", "trincad", "rachad", "defeito", "estragad", "manchad", "riscad", "danificad",
    "procon", "reclame aqui", "advogad", "processo", "denunc",
    "estorno", "reembols", "devoluç", "devoluc", "cancelar o pedido", "meu dinheiro",
    "não responde", "nao responde", "ninguém responde", "ninguem responde", "sem resposta",
  ];
  return kw.some((k) => t.includes(k));
}
function commentLooksAnswerable(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  if (t.includes("?")) return true;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false; // só emoji / curtida / @marcação / número solto
  const kw = ["preç","preco","valor","quanto","custa","comprar","compr","onde","como","tem ","disponiv","disponí","estoque","entrega","frete","tamanho","medida","cor ","cores","link","vende","quero","interess","promo","desconto","parcel","pix","boleto","catalog","loja","site",
    // pergunta de USO costuma vir sem interrogação ("Pode pôr no microondas")
    "microond","micro-ond","micro ond","freezer","congelad","lava-lou","lava lou","forno","air fry","material","garantia","vidro","plástic","plastic","litro","quantos","quantas","serve para","serve pra"];
  return kw.some((k)=>t.includes(k));
}
async function sendPublicCommentReply(commentId, text) {
  try {
    const r = await fetch(GRAPH + "/" + commentId + "/replies?access_token=" + IG_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const j = await r.json();
    if (j.error) { console.log("cmt public reply err", JSON.stringify(j.error)); return false; }
    return true;
  } catch (e) { console.log("cmt public exc", String(e)); return false; }
}
// Resposta privada ancorada no comentário (1o balão via comment_id; resto como DM normal).
// Retorna "complete", "partial" ou "none" para o comentário público nunca prometer mais do que saiu.
async function sendPrivateReplyToComment(commentId, igsid, text, directEnabled) {
  if (!canSendInstagramPrivateMessage(directEnabled)) return "none";
  const chunks = splitChunks(text);
  if (!chunks.length) return "none";
  if (!await privateEgressAllowed(directEnabled)) return "none";
  try {
    const r = await fetch(GRAPH + "/me/messages?access_token=" + IG_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: chunks[0] } })
    });
    const j = await r.json();
    if (j.error) { console.log("cmt private reply err", JSON.stringify(j.error)); return "none"; }
  } catch (e) { console.log("cmt private exc", String(e)); return "none"; }
  for (let i = 1; i < chunks.length; i++){
    await sleep(Math.min(Math.max(chunks[i].length * 45, 800), 3000));
    if (!await guardedSendOne(igsid, chunks[i], directEnabled)) return "partial";
  }
  return "complete";
}
// ─── Reclamação em comentário público: 1 frase de acolhimento + equipe (01/10/2026) ───
// Pedido do Pedro: a Ana responde "com frase de acolhimento coerente ao caso
// especifico". Antes era silencio ate um humano aparecer (3 a 12 dias em set/2026),
// com "golpe" exposto no post. A equipe continua sendo chamada e resolve o caso;
// a Ana so acolhe, 1 vez por pessoa a cada 24 h (quem posta 7 comentarios seguidos
// recebe 1 resposta), e nunca promete estorno, troca, prazo ou valor.
function temaReclamacao(t) {
  const s = String(t || "").toLowerCase();
  if (/estorno|reembols|meu dinheiro|cobran|cobrad|devolu/.test(s)) return "estorno";
  if (/n[aã]o (recebi|recebo|chegou|veio)|nunca chegou|atras|entrega|n[aã]o entreg/.test(s)) return "entrega";
  if (/quebrad|trincad|rachad|defeito|estragad|manchad|riscad|danificad/.test(s)) return "defeito";
  if (/n[aã]o respond|ningu[eé]m respond|sem resposta|bloque|apag/.test(s)) return "resposta";
  return "geral";
}
const ACOLHIMENTO_PADRAO = {
  estorno: "Oi! Sentimos muito pela demora com o seu estorno. Nossa equipe já está cuidando do seu caso e vai te responder por aqui.",
  entrega: "Oi! Sentimos muito pela demora na sua entrega. Nossa equipe já está verificando o seu caso e vai te responder por aqui.",
  defeito: "Oi! Sentimos muito que o produto tenha chegado assim. Nossa equipe já está cuidando do seu caso e vai te responder por aqui.",
  resposta: "Oi! Desculpa a demora em te responder. Nossa equipe já está com o seu caso e vai te responder por aqui.",
  geral: "Oi! Sentimos muito pela sua experiência. Nossa equipe já está cuidando do seu caso e vai te responder por aqui."
};
const ACOLHIMENTO_PROIBIDO = /mercado\s*livre|\bmeli\b|\bamazon\b|\bshopee\b|\bmagalu\b|marketplace|R\$|\breais\b|\bpre[cç]o\b|\d+[.,]\d{2}\b|\bdirect\b|\bdm\b|mensage(?:m|ns)\s+privad|(?:no|em)\s+privado|n[uú]mero do pedido|n[ºo°]\s*do pedido|\bfoto\b|\btelefone\b|\bwhats(?:app)?\b|\bendere[cç]o\b|dados pessoais|\bcpf\b|e-?mail|golpe|fraude|vamos (?:estornar|reembolsar|devolver|trocar|reenviar)|(?:estorno|reembolso|troca|devolu[cç][aã]o)\s+(?:em|at[eé])\s+\d|em at[eé] \d+\s*(?:dias|horas)|\bprazo\b|garantimos|\[\[/i;
function acolhimentoSeguro(gerado, tema) {
  const t = String(gerado || "").split(CHUNK_SEP).join(" ").replace(/\s+/g, " ").replace(/^["'“]|["'”]$/g, "").trim();
  if (!t || t.length > 240 || ACOLHIMENTO_PROIBIDO.test(t)) return ACOLHIMENTO_PADRAO[tema] || ACOLHIMENTO_PADRAO.geral;
  return t;
}
const ACOLHIMENTO_SISTEMA = "Você é a Ana, da Budamix (utilidades domésticas). Vai responder em PÚBLICO a um comentário de RECLAMAÇÃO num post ou anúncio da Budamix no Instagram ou no Facebook. Muita gente vai ler.\n"
  + "Escreva UMA ou DUAS frases curtas (no máximo 220 caracteres), em português do Brasil, que:\n"
  + "1) acolham com empatia o problema ESPECÍFICO que a pessoa contou (ex.: estorno que não chegou, entrega atrasada, produto que chegou quebrado, falta de resposta), sem repetir xingamento nem acusação;\n"
  + "2) digam que a equipe da Budamix já está cuidando do caso e vai responder por aqui.\n"
  + "PROIBIDO: discutir, se defender ou negar acusação (nunca escreva a palavra golpe); prometer reembolso, estorno, troca, reenvio, prazo ou valor; pedir número do pedido, foto, telefone, e-mail ou qualquer dado pessoal; citar direct, DM, WhatsApp ou mensagem privada; citar Mercado Livre, Shopee, Amazon ou qualquer marketplace; falar de preço; usar emoji ou marcadores.\n"
  + "Escreva só a resposta final, sem aspas.";
async function gerarAcolhimento(text, isFb) {
  const tema = temaReclamacao(text);
  const gen = await chamarClaude(ACOLHIMENTO_SISTEMA, [{ role: "user", content: "Comentário (" + (isFb ? "Facebook" : "Instagram") + "): " + String(text || "").slice(0, 600) }], 300);
  const texto = enforceRareEmojiPolicy(acolhimentoSeguro(gen.text, tema), String(text || ""));
  return { texto, tema, modelo: gen.model, gerado: gen.text };
}
// 1 aceno por PESSOA a cada 24 h. A reserva leva a chave "acolh:<autor>" e so segue
// a mais antiga: comentarios em rajada chegam em paralelo e podem abrir conversas
// diferentes para a mesma pessoa. Se a equipe ja respondeu nas ultimas 24 h, a Ana
// nao acena.
async function reservarAcolhimento(convId, autorId) {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  try {
    const h = await db("messages?conversation_id=eq." + convId + "&sender=eq.human_agent&created_at=gte." + desde + "&select=id&limit=1");
    const hj = await h.json();
    if (Array.isArray(hj) && hj.length) return null;
  } catch (_e) {}
  const chave = "acolh:" + autorId;
  const id = await salvarComId(convId, "agent", "[acolhimento publico em preparo]", { message_type: "text", whatsapp_message_id: chave, metadata: { reply_scope: "acolhimento" } });
  if (!id) return null;
  try {
    const r = await db("messages?whatsapp_message_id=eq." + encodeURIComponent(chave) + "&created_at=gte." + desde + "&select=id&order=created_at.asc,id.asc");
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length && rows[0].id !== id) { await apagarMensagem(id); return null; }
  } catch (_e) { await apagarMensagem(id); return null; }
  return id;
}
async function acolherReclamacaoPublica(commentId, convId, text, isFb, autorId) {
  const reserva = await reservarAcolhimento(convId, autorId);
  if (!reserva) { console.log("cmt reclamacao: ja houve resposta nas ultimas 24 h, sem novo aceno", convId); return "sem aceno (24h)"; }
  const a = await gerarAcolhimento(text, isFb);
  const publicado = isFb ? await sendPublicFacebookReply(commentId, a.texto) : await sendPublicCommentReply(commentId, a.texto);
  if (!publicado) { await apagarMensagem(reserva); return "aceno falhou"; }
  await patchMensagem(reserva, { content: a.texto, metadata: { reply_scope: "acolhimento", tema: a.tema, model: a.modelo } });
  return "aceno publicado";
}
async function handleComment(value, directEnabled, platform = "instagram") {
  const isFb = platform === "facebook";
  const commentId = value && value.id;
  const from = value && value.from;
  const text = ((value && value.text) || "").trim();
  if (!commentId) return;
  // No Facebook a Meta esconde a identidade de quem comenta a menos que a pessoa
  // tenha autorizado o app — então `from` costuma vir vazio. Sem dono não dá pra
  // mandar DM, mas dá pra responder em público, que é o que importa aqui.
  if (!isFb && (!from || !from.id)) return;
  // anti-loop: ignora comentário/reply da própria conta
  if (from && (from.id === IG_BUSINESS_ID || from.id === FB_PAGE_ID)) return;
  if (from && (from.username || from.name || "").toLowerCase() === "budamix.br") return;
  if (from && (from.name || "").toLowerCase() === "budamix") return;
  // A guarda de reclamação vem ANTES do filtro de intenção: "Golpe" não tem
  // interrogação nem palavra de compra e seria descartado em silêncio — justo o
  // comentário que mais precisa chegar em alguém.
  const ehReclamacao = commentLooksLikeComplaint(text);
  if (!ehReclamacao && !commentLooksAnswerable(text)) { console.log("cmt skip (sem intencao):", text.slice(0, 60)); return "sem intencao"; }

  const prefixo = isFb ? "fbcmt:" : "cmt:";
  // dedup: já respondemos esse comentário?
  try {
    const seen = await db("messages?whatsapp_message_id=eq." + encodeURIComponent(prefixo + commentId) + "&select=id&limit=1");
    if (seen.ok) { const sj = await seen.json(); if (sj.length) return "ja tratado"; }
  } catch (_e) {}

  const igsid = (from && from.id) || ("anon_" + commentId);
  const isAd = isFb
    ? !!value.is_ad
    : !!(value.media && value.media.media_product_type === "AD");
  const customerId = await getOrCreateCustomer(
    igsid,
    (from && (from.username || from.name)) || "",
    isFb ? "fb:" : "ig:",
  );
  // conversa de COMENTÁRIO separada do Direct → aba Comentários no Canggu
  const canal = isFb ? "facebook_comment" : "instagram_comment";
  const convId = await getOrCreateConversation(customerId, canal);
  const rotulo = isFb
    ? (isAd ? "[comentário Facebook · anúncio] " : "[comentário Facebook · post] ")
    : (isAd ? "[comentário · anúncio] " : "[comentário · post] ");
  await saveMessage(convId, "customer", rotulo + (text || "(sem texto)"), {
    message_type: "comment",
    whatsapp_message_id: prefixo + commentId,
    metadata: { comment_origin: isAd ? "ad" : "post", platform, media_id: (value.media && value.media.id) || value.post_id || null }
  });

  // Reclamação pública: registra, avisa a equipe e NÃO responde sozinha.
  if (ehReclamacao) {
    console.log("cmt reclamacao -> humano:", text.slice(0, 80));
    try {
      await fetch(SU + "/functions/v1/escalate-notify?key=" + encodeURIComponent(Deno.env.get("IG_VERIFY_TOKEN") || ""), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: convId,
          reason: "Reclamação em comentário público (" + (isFb ? "Facebook" : "Instagram") + (isAd ? " · anúncio" : " · post") + ") — precisa de resposta humana",
          channel: canal,
          preview: text.slice(0, 180),
        })
      });
    } catch (e) { console.log("escalate cmt err", String(e)); }
    try {
      await db("conversations?id=eq." + convId, {
        method: "PATCH",
        body: JSON.stringify({ status: "escalated", assigned_to: "human" })
      });
    } catch (_e) {}
    let aceno = "";
    try { aceno = await acolherReclamacaoPublica(commentId, convId, text, isFb, igsid); } catch (e) { console.log("aceno exc", String(e)); }
    return "reclamacao -> humano" + (aceno ? " + " + aceno : "");
  }

  // Facebook: SEMPRE só público. Sem Messenger, a resposta tem que se bastar.
  if (isFb || !directEnabled) {
    const safeSystem = publicCommentPublicOnlySystemPrompt();
    const publicContext = await buildGrounding(text);
    const publicHistory = [{ sender: "customer", content: text }];
    const gen = await anaReply(safeSystem, publicHistory, publicContext);
    const safeReply = enforceRareEmojiPolicy(gen.text || publicCommentDisabledReply(), text);
    const pub = publicCommentAcknowledgement({
      escalated: false,
      privateReplySent: false,
      directEnabled: false,
      reply: safeReply,
    });
    if (isFb) await sendPublicFacebookReply(commentId, pub);
    else await sendPublicCommentReply(commentId, pub);
    await saveMessage(convId, "agent", pub, {
      tokens_used: ((gen.tokens_in || 0) + (gen.tokens_out || 0)) || null,
      tokens_in: gen.tokens_in || 0,
      tokens_out: gen.tokens_out || 0,
      tokens_cache_read: gen.cache_read || 0,
      tokens_cache_write: gen.cache_write || 0,
    });
    return;
  }

  const sys = await getSystemPrompt();
  const hist = await getRecentMessages(convId);
  const t0 = Date.now();
  let ctx = await buildGrounding(text);
  const note = publicCommentChannelNote(directEnabled);
  ctx = ctx ? ctx + "\n\n" + note + "\n\n" + ESCALATION_NOTE : "=== CONTEXTO DE ATENDIMENTO ===\n" + note + "\n\n" + ESCALATION_NOTE;
  const gen = await anaReply(sys, hist, ctx);
  let reply = gen.text;
  const response_time_ms = Date.now() - t0;
  const tokens_in = gen.tokens_in || 0;
  const tokens_out = gen.tokens_out || 0;
  const tokens_cache_read = gen.cache_read || 0;
  const tokens_cache_write = gen.cache_write || 0;
  const tokens_used = (tokens_in + tokens_out) || null;
  if (!reply || !reply.trim()) return;

  const escC = await escalateIfFlagged(reply, convId, "instagram_comment", text);
  reply = enforceRareEmojiPolicy(escC.reply, text);
  const privateStatus = await sendPrivateReplyToComment(commentId, igsid, reply, directEnabled);
  const privateComplete = privateStatus === "complete";
  const privatePartial = privateStatus === "partial";
  const pub = privatePartial
    ? "Oi! Enviei uma parte no direct; nossa equipe continua te orientando por aqui."
    : publicCommentAcknowledgement({
      escalated: escC.escalated,
      privateReplySent: privateComplete,
      directEnabled: privateComplete,
      reply,
    });
  await sendPublicCommentReply(commentId, pub);
  await saveMessage(convId, "agent", privateComplete ? reply : pub, { response_time_ms, tokens_used, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write });
}
// ─── Webhook ───
Deno.serve(async (req)=>{
  // Verificação do webhook (handshake da Meta)
  if (req.method === "GET") {
    const u = new URL(req.url);
    // SONDA (01/10): gera o aceno publico de reclamacao sem publicar nem gravar.
    // Uso: GET ?probe=acolhimento&key=<IG_VERIFY_TOKEN>&q=<comentario>[&fb=1]
    if (u.searchParams.get("probe") === "acolhimento") {
      if (u.searchParams.get("key") !== Deno.env.get("IG_VERIFY_TOKEN")) return new Response("Forbidden", { status: 403 });
      const q = (u.searchParams.get("q") || "Golpe! Comprei e não recebi").slice(0, 600);
      const t0 = Date.now();
      const a = await gerarAcolhimento(q, u.searchParams.get("fb") === "1");
      return new Response(JSON.stringify({ ok: true, ms: Date.now() - t0, reclamacao: commentLooksLikeComplaint(q), ...a }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === Deno.env.get("IG_VERIFY_TOKEN")) {
      return new Response(u.searchParams.get("hub.challenge") || "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch (_e) {}
    // Facebook: comentário na Página (orgânico ou de anúncio). Chega pelo webhook
    // "page" ou pelo evento sintético do facebook-comments-poll. Trilha separada:
    // resposta só pública, sem Direct, sem depender da chave do Instagram.
    if (body && body.object === "page") {
      // ?sync=1 processa na hora e devolve o resultado — é assim que dá pra
      // testar sem depender de log. O poll normal usa o caminho assíncrono.
      const sincrono = new URL(req.url).searchParams.get("sync") === "1";
      const diag = [];
      const trabalho = (async ()=>{
        for (const entry of (Array.isArray(body.entry) ? body.entry : [])) {
          for (const ch of (Array.isArray(entry.changes) ? entry.changes : [])) {
            if (!ch || ch.field !== "feed") { diag.push("ignorado: campo=" + (ch && ch.field)); continue; }
            const v = ch.value || {};
            if (v.item !== "comment" || (v.verb && v.verb !== "add")) { diag.push("ignorado: item=" + v.item + " verb=" + v.verb); continue; }
            try {
              const r = await handleComment({
                id: v.comment_id || v.id,
                from: v.from || null,
                text: v.message || v.text || "",
                is_ad: !!v.is_ad,
                post_id: v.post_id || null,
              }, false, "facebook");
              diag.push((v.comment_id || v.id) + " -> " + (r || "ok"));
            } catch (e) {
              console.log("fb comment err", String(e));
              diag.push("ERRO " + (v.comment_id || v.id) + ": " + String(e && e.stack || e));
            }
          }
        }
      })();
      if (sincrono) {
        await trabalho;
        return new Response(JSON.stringify({ ok: true, diag }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      globalThis.EdgeRuntime?.waitUntil(trabalho);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    // Só tratamos o objeto "instagram"
    if (body && body.object !== "instagram") {
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    globalThis.EdgeRuntime?.waitUntil((async ()=>{
      const [, directState] = await Promise.all([
        loadIgToken(),              // usa o token renovado da tabela (cron a cada 3 dias)
        getInstagramDirectState(),
      ]);
      const directPlan = planDirectState(directState);
      const { events, deletions, comments, droppedDirectEvents } =
        planInstagramWebhookWork(body, directPlan.ingestPrivateEvents, IG_BUSINESS_ID);
      if (droppedDirectEvents > 0) {
        console.log("instagram direct disabled: dropped", droppedDirectEvents);
      }
      for (const mid of deletions){
        await deleteMessageByMid(mid);
      }
      const touched = new Map();
      for (const ev of events){
        try {
          const r = await handleEvent(ev);
          if (r) touched.set(r.convId, { igsid: r.igsid, lastMsgId: r.lastMsgId });
        } catch (e) {
          console.log("handle err", String(e));
        }
      }
      await Promise.all([...touched.entries()].map(([convId, info])=>
        replyConversation(convId, info.igsid, info.lastMsgId, directPlan.allowPrivateEgress).catch((e)=>console.log("reply err", String(e)))
      ));
      for (const cv of comments){
        try { await handleComment(cv, directPlan.allowPrivateEgress); } catch (e) { console.log("comment err", String(e)); }
      }
    })());
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
  return new Response("ok", { status: 200 });
});
