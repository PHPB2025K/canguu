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
const GRAPH = "https://graph.facebook.com/v25.0";
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const IG_TOKEN = Deno.env.get("IG_PAGE_TOKEN");
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
async function getOrCreateConversation(customerId) {
  const r = await db("conversations?customer_id=eq." + customerId + "&status=eq.active&order=started_at.desc&limit=1&select=id");
  const rows = await r.json();
  if (Array.isArray(rows) && rows.length) return rows[0].id;
  const c = await db("conversations", {
    method: "POST",
    headers: {
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      customer_id: customerId,
      channel: "instagram",
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
    const r = await db("policies?is_active=eq.true&select=title,category,marketplace,summary&order=priority.desc&limit=6");
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
  ctx = ctx ? ctx + "\n\n" + originNote : "=== CONTEXTO DE ATENDIMENTO ===\n" + originNote;
  const reply = await anaReply(sys, hist, ctx);
  if (reply && reply.trim()) {
    await sendInstagram(igsid, reply);
    await saveMessage(convId, "agent", reply);
  }
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
    for (const e of body.entry || []){
      for (const ev of e.messaging || []){
        // ignora eco (mensagem que a própria conta enviou) e eventos sem mensagem real
        if (ev.message && (ev.message.is_echo || (ev.sender && ev.sender.id === IG_BUSINESS_ID))) continue;
        if (!ev.message) continue;                       // read/reaction/postback -> ignora (v1)
        if (!ev.message.text && !(ev.message.attachments && ev.message.attachments.length)) continue;
        events.push(ev);
      }
    }
    globalThis.EdgeRuntime?.waitUntil((async ()=>{
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
    })());
    return new Response("EVENT_RECEIVED", { status: 200 });
  }
  return new Response("ok", { status: 200 });
});
