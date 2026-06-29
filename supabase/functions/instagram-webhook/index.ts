import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
async function getOrCreateCustomer(igsid, name) {
  const phone = igPhone(igsid);
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
      source: "instagram",
      marketplace_user_id: igsid
    })
  });
  const cr = await c.json();
  return cr[0].id;
}
async function getOrCreateConversation(customerId, channel = "instagram") {
  const r = await db("conversations?customer_id=eq." + customerId + "&status=eq.active&channel=eq." + encodeURIComponent(channel) + "&order=started_at.desc&limit=1&select=id");
  const rows = await r.json();
  if (Array.isArray(rows) && rows.length) return rows[0].id;
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
async function getSystemPrompt() {
  try {
    const r = await db("agent_config?config_key=eq.system_prompt&select=config_value");
    const rows = await r.json();
    if (Array.isArray(rows) && rows[0]?.config_value) return rows[0].config_value;
  } catch (_e) {}
  return "Voce e a Ana, atendente da Budamix (utilidades domesticas). Responda de forma natural, humana e prestativa, em portugues do Brasil, frases curtas.";
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
  if (!merged.length) return "";
  if (contextBlock && contextBlock.trim()) {
    for(let i = merged.length - 1; i >= 0; i--){
      if (merged[i].role === "user") {
        merged[i].content = contextBlock.trim() + "\n\n---\n# Mensagem atual do cliente:\n" + merged[i].content;
        break;
      }
    }
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: systemPrompt,
      messages: merged
    })
  });
  const j = await res.json();
  if (j.error) {
    console.log("anthropic err", JSON.stringify(j.error));
    return "";
  }
  return j.content && j.content[0] && j.content[0].text ? j.content[0].text : "";
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
async function sendOne(igsid, body) {
  if (!IG_TOKEN) {
    console.log("IG_PAGE_TOKEN missing - skip send");
    return;
  }
  const r = await fetch(GRAPH + "/me/messages?access_token=" + IG_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text: body } })
  });
  const j = await r.json();
  if (j.error) console.log("ig send err", JSON.stringify(j.error));
}
async function sendInstagram(igsid, text) {
  const chunks = splitChunks(text);
  for(let i = 0; i < chunks.length; i++){
    if (i > 0) await igAction(igsid, "typing_on");
    const delay = Math.min(Math.max(chunks[i].length * 45, 1000), 3500);
    await sleep(delay);
    await sendOne(igsid, chunks[i]);
  }
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
  const map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "video/mp4": "mp4" };
  if (map[mm]) return map[mm];
  if (mm.startsWith("image/")) return "jpg";
  if (mm.startsWith("audio/")) return "ogg";
  if (mm.startsWith("video/")) return "mp4";
  return "bin";
}
async function uploadToStorage(kind, convId, msgId, bytes, mime) {
  const safeId = String(msgId).replace(/[^A-Za-z0-9_-]/g, "_");
  const path = kind + "/" + convId + "/" + safeId + "." + extFor(mime);
  const ct = (mime || "").split(";")[0].trim() || "application/octet-stream";
  const r = await fetch(SU + "/storage/v1/object/chat-attachments/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + SR, apikey: SR, "Content-Type": ct, "x-upsert": "true", "Cache-Control": "3600" },
    body: bytes
  });
  if (!r.ok) throw new Error("storage " + r.status + " " + (await r.text()).slice(0, 140));
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
// Processa anexos do Instagram (image / audio / video / share / story_mention).
async function processAttachments(message, convId, msgId) {
  const atts = message && message.attachments || [];
  if (!atts.length) return null;
  const a = atts[0];
  const url = a && a.payload && a.payload.url;
  const meta = {};
  try {
    if (a.type === "image" && url) {
      const md = await downloadUrl(url);
      try {
        meta.image_url = await uploadToStorage("image", convId, msgId, md.bytes, md.mime);
        meta.image_mimetype = md.mime;
      } catch (e) { console.log("img upload err", String(e)); }
      const desc = await describeImage(md.base64, md.mime);
      if (desc) meta.ai_description = desc;
      return { text: desc ? "[Foto enviada pelo cliente] " + desc : "[Foto recebida]", meta };
    }
    if (a.type === "audio" && url) {
      const md = await downloadUrl(url);
      try {
        meta.audio_url = await uploadToStorage("audio", convId, msgId, md.bytes, md.mime);
        meta.audio_mimetype = md.mime;
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
        const md = await downloadUrl(url);
        meta.video_url = await uploadToStorage("video", convId, msgId, md.bytes, md.mime);
        meta.video_mimetype = md.mime;
      } catch (e) { console.log("video upload err", String(e)); }
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
  try {
    const r = await db("integration_tokens?provider=eq.instagram&select=access_token&limit=1");
    if (r.ok) {
      const j = await r.json();
      if (j[0] && j[0].access_token) IG_TOKEN = j[0].access_token;
    }
  } catch (e) {
    console.log("loadIgToken exc", String(e));
  }
}
// Escalonamento: a Ana sinaliza com [[ESCALAR: motivo]] quando o caso precisa de humano.
const ESCALATION_NOTE = "## Escalonamento\nSe o cliente PEDIR explicitamente falar com um humano/atendente/pessoa, OU for uma reclamacao seria (produto quebrado/com defeito/faltando/errado, pedido de reembolso/estorno, pedido que nao chegou, cliente claramente irritado, ou mencao a Procon/processo/advogado), comece sua resposta EXATAMENTE com o marcador [[ESCALAR: motivo curto]] e depois escreva UMA frase curta avisando que vai transferir para um atendente humano. Caso contrario, responda normalmente, SEM marcador.";
async function escalateIfFlagged(reply, convId, channel, preview) {
  const m = reply.match(/^\s*\[\[\s*ESCALAR\s*:?\s*([^\]]*)\]\]\s*/i);
  if (!m) return { escalated: false, reply };
  const reason = (m[1] || "").trim() || "Cliente precisa de atendimento humano";
  const clean = reply.slice(m[0].length).trim() || "Vou te transferir para um atendente humano, ja ja alguem te responde por aqui 🙏";
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
async function replyConversation(convId, igsid, lastMsgId) {
  await sleep(DEBOUNCE_MS);
  const latestId = await getLatestCustomerMsgId(convId);
  if (latestId && latestId !== lastMsgId) return; // chegou msg mais nova -> ela responde a rajada
  const assignee = await getConversationAssignee(convId);
  if (assignee && assignee !== "agent") return;    // humano assumiu -> Ana fica quieta

  const sys = await getSystemPrompt();
  await igAction(igsid, "mark_seen");
  await igAction(igsid, "typing_on");
  const hist = await getRecentMessages(convId);
  let ctx = await buildGrounding(latestUserText(hist));
  const originNote = "## Cliente\nEste atendimento chegou pelo DIRECT DO INSTAGRAM (@budamix.br). NAO pergunte por onde o cliente nos encontrou. Para link de compra, prefira o do site da Budamix. Respostas curtas, no maximo ~2 paragrafos por balao.";
  ctx = ctx ? ctx + "\n\n" + originNote + "\n\n" + ESCALATION_NOTE : "=== CONTEXTO DE ATENDIMENTO ===\n" + originNote + "\n\n" + ESCALATION_NOTE;
  let reply = await anaReply(sys, hist, ctx);
  if (reply && reply.trim()) {
    const esc = await escalateIfFlagged(reply, convId, "instagram", latestUserText(hist));
    reply = esc.reply;
    await sendInstagram(igsid, reply);
    await saveMessage(convId, "agent", reply);
  }
}
// ─── Comentários (posts + anúncios do Instagram) — modo híbrido: DM completo + reply público curto ───
function commentLooksAnswerable(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  if (t.includes("?")) return true;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false; // só emoji / curtida / @marcação / número solto
  const kw = ["preç","preco","valor","quanto","custa","comprar","compr","onde","como","tem ","disponiv","disponí","estoque","entrega","frete","tamanho","medida","cor ","cores","link","vende","quero","interess","promo","desconto","parcel","pix","boleto","catalog","loja","site"];
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
    if (j.error) console.log("cmt public reply err", JSON.stringify(j.error));
  } catch (e) { console.log("cmt public exc", String(e)); }
}
// Resposta privada ancorada no comentário (1o balão via comment_id; resto como DM normal). true se o DM saiu.
async function sendPrivateReplyToComment(commentId, igsid, text) {
  const chunks = splitChunks(text);
  if (!chunks.length) return false;
  try {
    const r = await fetch(GRAPH + "/me/messages?access_token=" + IG_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: chunks[0] } })
    });
    const j = await r.json();
    if (j.error) { console.log("cmt private reply err", JSON.stringify(j.error)); return false; }
  } catch (e) { console.log("cmt private exc", String(e)); return false; }
  for (let i = 1; i < chunks.length; i++){
    await sleep(Math.min(Math.max(chunks[i].length * 45, 800), 3000));
    await sendOne(igsid, chunks[i]);
  }
  return true;
}
async function handleComment(value) {
  const commentId = value && value.id;
  const from = value && value.from;
  const text = ((value && value.text) || "").trim();
  if (!commentId || !from || !from.id) return;
  // anti-loop: ignora comentário/reply da própria conta
  if (from.id === IG_BUSINESS_ID || ((from.username || "").toLowerCase() === "budamix.br")) return;
  if (!commentLooksAnswerable(text)) { console.log("cmt skip (sem intencao):", text.slice(0, 60)); return; }
  // dedup: já respondemos esse comentário?
  try {
    const seen = await db("messages?whatsapp_message_id=eq." + encodeURIComponent("cmt:" + commentId) + "&select=id&limit=1");
    if (seen.ok) { const sj = await seen.json(); if (sj.length) return; }
  } catch (_e) {}

  const igsid = from.id;
  const isAd = !!(value.media && value.media.media_product_type === "AD");
  const customerId = await getOrCreateCustomer(igsid, from.username || "");
  // conversa de COMENTÁRIO separada do Direct (channel='instagram_comment') → aba Comentários no Canggu
  const convId = await getOrCreateConversation(customerId, "instagram_comment");
  await saveMessage(convId, "customer", (isAd ? "[comentário · anúncio] " : "[comentário · post] ") + (text || "(sem texto)"), {
    message_type: "comment",
    whatsapp_message_id: "cmt:" + commentId,
    metadata: { comment_origin: isAd ? "ad" : "post", media_id: (value.media && value.media.id) || null }
  });

  const sys = await getSystemPrompt();
  const hist = await getRecentMessages(convId);
  let ctx = await buildGrounding(text);
  const note = "## Canal\nIsto e um COMENTARIO PUBLICO num post/anuncio do Instagram (@budamix.br), visivel a qualquer pessoa. A resposta completa vai por DM (direct); o reply publico e so um aceno curto. Seja cordial e util. NUNCA peca dado pessoal em publico, NUNCA sugira reclamacao. Para link de compra, prefira o site da Budamix.";
  ctx = ctx ? ctx + "\n\n" + note + "\n\n" + ESCALATION_NOTE : "=== CONTEXTO DE ATENDIMENTO ===\n" + note + "\n\n" + ESCALATION_NOTE;
  let reply = await anaReply(sys, hist, ctx);
  if (!reply || !reply.trim()) return;

  const escC = await escalateIfFlagged(reply, convId, "instagram_comment", text);
  reply = escC.reply;
  const okPriv = await sendPrivateReplyToComment(commentId, igsid, reply);
  const pub = escC.escalated
    ? "Oi! 😊 Já pedi pra nossa equipe te responder no seu direct 🙏"
    : (okPriv
      ? "Oi! 😊 Te respondi no seu direct com todos os detalhes 💬"
      : ("Oi! 😊 " + reply.split(CHUNK_SEP).join(" ").slice(0, 200)));
  await sendPublicCommentReply(commentId, pub);
  await saveMessage(convId, "agent", reply);
}
// ─── Webhook ───
Deno.serve(async (req)=>{
  // Verificação do webhook (handshake da Meta)
  if (req.method === "GET") {
    const u = new URL(req.url);
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
    // Só tratamos o objeto "instagram"
    if (body && body.object !== "instagram") {
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    const events = [];
    const deletions = [];
    const comments = [];
    for (const e of body.entry || []){
      for (const ev of e.messaging || []){
        // ignora eco (mensagem que a própria conta enviou) e eventos sem mensagem real
        if (ev.message && (ev.message.is_echo || (ev.sender && ev.sender.id === IG_BUSINESS_ID))) continue;
        // cliente "desfez o envio" (unsend) no IG -> apagar a nossa copia
        if (ev.message && ev.message.is_deleted) { if (ev.message.mid) deletions.push(ev.message.mid); continue; }
        if (!ev.message) continue;                       // read/reaction/postback -> ignora (v1)
        if (!ev.message.text && !(ev.message.attachments && ev.message.attachments.length)) continue;
        events.push(ev);
      }
      for (const ch of e.changes || []){            // comentários (posts + anúncios no IG)
        if (ch.field === "comments" && ch.value) comments.push(ch.value);
      }
    }
    globalThis.EdgeRuntime?.waitUntil((async ()=>{
      await loadIgToken();              // usa o token renovado da tabela (cron a cada 3 dias)
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
        replyConversation(convId, info.igsid, info.lastMsgId).catch((e)=>console.log("reply err", String(e)))
      ));
      for (const cv of comments){
        try { await handleComment(cv); } catch (e) { console.log("comment err", String(e)); }
      }
    })());
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
  return new Response("ok", { status: 200 });
});
