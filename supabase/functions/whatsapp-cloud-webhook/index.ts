import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const GRAPH = "https://graph.facebook.com/v25.0";
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const WA_TOKEN = Deno.env.get("WA_CLOUD_TOKEN");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const DEBOUNCE_MS = 8000;
const CHUNK_SEP = "\\\\";
const MAX_CHUNKS = 4;
// Menu de canais (origem). id 'src_<valor>' -> customers.source = <valor> (alinhado aos selos/filtros do Canggu).
// Só os 4 canais de VENDA (onde existe link de compra) + catch-all 'whatsapp' (= balde "Outro / WhatsApp" do Canggu).
const CHANNELS = [
  {
    id: "src_site",
    title: "Site Budamix"
  },
  {
    id: "src_mercado_livre",
    title: "Mercado Livre"
  },
  {
    id: "src_shopee",
    title: "Shopee"
  },
  {
    id: "src_amazon",
    title: "Amazon"
  },
  {
    id: "src_whatsapp",
    title: "Outro / Nao lembro"
  }
];
const PICKER_BODY = "Oi! 😊 Eu sou a Ana, da Budamix. Pra te atender certinho, me conta: por onde voce nos encontrou?";
const PICKER_MARK = PICKER_BODY + " [menu de canais enviado: Site, Mercado Livre, Shopee, Amazon, Outro]";
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
async function getOrCreateCustomer(phone, name) {
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
      source: "whatsapp"
    })
  });
  const cr = await c.json();
  return cr[0].id;
}
async function getCustomerSource(customerId) {
  try {
    const r = await db("customers?id=eq." + customerId + "&select=source");
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].source ?? null : null;
  } catch (_e) {
    return null;
  }
}
async function updateCustomerSource(customerId, source) {
  try {
    await db("customers?id=eq." + customerId, {
      method: "PATCH",
      body: JSON.stringify({
        source
      })
    });
  } catch (_e) {}
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
      channel: "whatsapp",
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
async function wasPickerSent(conversationId) {
  try {
    const r = await db("messages?conversation_id=eq." + conversationId + "&sender=eq.agent&message_type=eq.interactive&select=id&limit=1");
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_e) {
    return false;
  }
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
        p_channel: "whatsapp"
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
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: merged
    })
  });
  const j = await res.json();
  if (j.error) {
    console.log("anthropic err", JSON.stringify(j.error));
    return { text: "", tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 };
  }
  const text = j.content && j.content[0] && j.content[0].text ? j.content[0].text : "";
  const tokens_in = j.usage ? (j.usage.input_tokens || 0) : 0;
  const tokens_out = j.usage ? (j.usage.output_tokens || 0) : 0;
  const cache_read = j.usage ? (j.usage.cache_read_input_tokens || 0) : 0;
  const cache_write = j.usage ? (j.usage.cache_creation_input_tokens || 0) : 0;
  return { text, tokens_in, tokens_out, cache_read, cache_write };
}
function splitChunks(text) {
  let chunks = text.split(CHUNK_SEP).map((c)=>c.trim()).filter((c)=>c.length > 0);
  if (chunks.length <= 1 && text.includes("\n\n")) {
    const nn = text.split(/\n\n+/).map((c)=>c.trim()).filter((c)=>c.length > 0);
    if (nn.length > 1) chunks = nn;
  }
  if (chunks.length === 0) return [];
  if (chunks.length > MAX_CHUNKS) chunks = chunks.slice(0, MAX_CHUNKS);
  return chunks;
}
async function sendTyping(messageId) {
  const PNID = Deno.env.get("WA_CLOUD_PHONE_NUMBER_ID");
  const TOKEN = Deno.env.get("WA_CLOUD_TOKEN");
  if (!PNID || !TOKEN || !messageId) return;
  try {
    const r = await fetch(GRAPH + "/" + PNID + "/messages", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: {
          type: "text"
        }
      })
    });
    const j = await r.json();
    if (j.error) console.log("typing err", JSON.stringify(j.error));
  } catch (e) {
    console.log("typing exc", String(e));
  }
}
async function sendOne(to, body) {
  const PNID = Deno.env.get("WA_CLOUD_PHONE_NUMBER_ID");
  const TOKEN = Deno.env.get("WA_CLOUD_TOKEN");
  if (!PNID || !TOKEN) {
    console.log("WA_CLOUD creds missing - skip send");
    return;
  }
  const r = await fetch(GRAPH + "/" + PNID + "/messages", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: true,
        body
      }
    })
  });
  const j = await r.json();
  if (j.error) console.log("send err", JSON.stringify(j.error));
}
async function sendWhatsApp(to, text, inboundMsgId) {
  const chunks = splitChunks(text);
  for(let i = 0; i < chunks.length; i++){
    if (i > 0 && inboundMsgId) await sendTyping(inboundMsgId);
    const delay = Math.min(Math.max(chunks[i].length * 45, 1000), 3500);
    await sleep(delay);
    await sendOne(to, chunks[i]);
  }
}
async function sendChannelPicker(to) {
  const PNID = Deno.env.get("WA_CLOUD_PHONE_NUMBER_ID");
  const TOKEN = Deno.env.get("WA_CLOUD_TOKEN");
  if (!PNID || !TOKEN) {
    console.log("WA_CLOUD creds missing - skip picker");
    return;
  }
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Atendimento Budamix"
      },
      body: {
        text: PICKER_BODY
      },
      footer: {
        text: "Budamix"
      },
      action: {
        button: "Escolher canal",
        sections: [
          {
            title: "Por onde nos encontrou",
            rows: CHANNELS.map((c)=>({
                id: c.id,
                title: c.title
              }))
          }
        ]
      }
    }
  };
  try {
    const r = await fetch(GRAPH + "/" + PNID + "/messages", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (j.error) console.log("picker err", JSON.stringify(j.error));
  } catch (e) {
    console.log("picker exc", String(e));
  }
}
// ─── MIDIA: baixar da Meta (Graph) + ver imagem (Gemini) / ouvir audio (Groq) ───
async function downloadWaMedia(mediaId) {
  const meta = await fetch(GRAPH + "/" + mediaId, {
    headers: { Authorization: "Bearer " + WA_TOKEN }
  }).then((r)=>r.json());
  if (!meta || !meta.url) throw new Error("media url indisponivel");
  const res = await fetch(meta.url, { headers: { Authorization: "Bearer " + WA_TOKEN } });
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), bytes: buf, mime: meta.mime_type || "application/octet-stream" };
}
function extFor(mime) {
  const mm = (mime || "").split(";")[0].trim().toLowerCase();
  const map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav", "video/mp4": "mp4" };
  if (map[mm]) return map[mm];
  if (mm.startsWith("image/")) return "jpg";
  if (mm.startsWith("audio/")) return "ogg";
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
      { inline_data: { mime_type: mime || "image/jpeg", data: base64 } }
    ] }]
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json();
  const t = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
  return t || null;
}
async function processMedia(m, convId) {
  try {
    if (m.type === "image" && m.image && m.image.id) {
      const md = await downloadWaMedia(m.image.id);
      const meta = {};
      // 1) sobe o arquivo p/ Storage -> a tela do Canggu mostra/expande a imagem (independe da IA)
      try {
        meta.image_url = await uploadToStorage("image", convId, m.id, md.bytes, md.mime);
        meta.image_mimetype = md.mime;
      } catch (e) {
        console.log("img upload err", String(e));
      }
      // 2) Gemini descreve p/ a Ana entender
      const desc = await describeImage(md.base64, md.mime);
      if (desc) meta.ai_description = desc;
      const caption = (m.image.caption || "").trim();
      const text = desc ? (caption ? caption + "\n" : "") + "[Foto enviada pelo cliente] " + desc : caption || "[Foto recebida]";
      return { text, meta };
    }
    if (m.type === "audio" && m.audio && m.audio.id) {
      const md = await downloadWaMedia(m.audio.id);
      const meta = {};
      // 1) sobe o audio p/ Storage -> a tela do Canggu mostra o player (independe da IA)
      try {
        meta.audio_url = await uploadToStorage("audio", convId, m.id, md.bytes, md.mime);
        meta.audio_mimetype = md.mime;
      } catch (e) {
        console.log("audio upload err", String(e));
      }
      // 2) Groq transcreve p/ a Ana ouvir
      const txt = await transcribeAudio(md.base64, md.mime);
      meta.transcribed = !!(txt && txt.trim());
      const text = txt && txt.trim() ? txt.trim() : "[Audio recebido]";
      return { text, meta };
    }
  } catch (e) {
    console.log("media err", String(e));
  }
  return null;
}
function parseInbound(m) {
  let text = "";
  let pickedSource = "";
  if (m.type === "text") {
    text = m.text && m.text.body || "";
  } else if (m.type === "interactive") {
    const ir = m.interactive || {};
    const rep = ir.list_reply || ir.button_reply || {};
    const rid = rep.id || "";
    const rtitle = rep.title || "";
    if (rid.indexOf("src_") === 0) {
      pickedSource = rid.slice(4);
      text = "[Cliente selecionou canal: " + rtitle + "]";
    } else text = rtitle ? "[" + rtitle + "]" : "[interactive]";
  } else {
    text = "[" + m.type + "]";
  }
  return {
    text,
    pickedSource
  };
}
async function handleValue(value) {
  const msgs = value && value.messages || [];
  const contacts = value && value.contacts || [];
  const name = contacts[0] && contacts[0].profile && contacts[0].profile.name || "";
  const touched = new Map();
  for (const m of msgs){
    const from = m.from;
    if (!from) continue;
    const { text, pickedSource } = parseInbound(m);
    const customerId = await getOrCreateCustomer(from, name);
    const convId = await getOrCreateConversation(customerId);
    let finalText = text;
    let mediaMeta = {};
    if (m.type === "image" || m.type === "audio") {
      const r = await processMedia(m, convId);
      if (r) {
        if (r.text && r.text.trim()) finalText = r.text;
        mediaMeta = r.meta || {};
      }
    }
    await saveMessage(convId, "customer", finalText, {
      message_type: m.type,
      whatsapp_message_id: m.id,
      metadata: Object.keys(mediaMeta).length ? mediaMeta : undefined
    });
    if (pickedSource) await updateCustomerSource(customerId, pickedSource);
    touched.set(convId, {
      from,
      lastMsgId: m.id,
      customerId
    });
  }
  await Promise.all([
    ...touched.entries()
  ].map(async ([convId, info])=>{
    await sleep(DEBOUNCE_MS);
    const latestId = await getLatestCustomerMsgId(convId);
    if (latestId && latestId !== info.lastMsgId) return; // chegou msg mais nova -> ela responde a rajada
    const assignee = await getConversationAssignee(convId);
    if (assignee && assignee !== "agent") return; // humano assumiu -> Ana fica quieta
    const src = await getCustomerSource(info.customerId);
    const known = !!src && src !== "whatsapp";
    const pickerSent = await wasPickerSent(convId);
    if (!known && !pickerSent) {
      await sendChannelPicker(info.from);
      await saveMessage(convId, "agent", PICKER_MARK, {
        message_type: "interactive"
      });
      return;
    }
    const sys = await getSystemPrompt();
    if (info.lastMsgId) await sendTyping(info.lastMsgId);
    const hist = await getRecentMessages(convId);
    const t0 = Date.now();
    let ctx = await buildGrounding(latestUserText(hist));
    const originNote = known ? "## Cliente\nOrigem do cliente: " + src + ". NAO pergunte por onde nos encontrou (ja sabemos). Para link de compra, prefira o do canal " + src + "." : pickerSent ? "## Cliente\nO menu de canais ja foi enviado ao cliente. NAO pergunte a origem em texto; apenas ajude. Se precisar mandar link, use o do site." : "";
    if (originNote) ctx = ctx ? ctx + "\n\n" + originNote : "=== CONTEXTO DE ATENDIMENTO ===\n" + originNote;
    ctx = ctx ? ctx + "\n\n" + ESCALATION_NOTE : "=== CONTEXTO DE ATENDIMENTO ===\n" + ESCALATION_NOTE;
    const gen = await anaReply(sys, hist, ctx);
    let reply = gen.text;
    const response_time_ms = Date.now() - t0;
    const tokens_in = gen.tokens_in || 0;
    const tokens_out = gen.tokens_out || 0;
    const tokens_cache_read = gen.cache_read || 0;
    const tokens_cache_write = gen.cache_write || 0;
    const tokens_used = (tokens_in + tokens_out) || null;
    if (reply && reply.trim()) {
      const esc = await escalateIfFlagged(reply, convId, "whatsapp", latestUserText(hist));
      reply = esc.reply;
      await sendWhatsApp(info.from, reply, info.lastMsgId);
      await saveMessage(convId, "agent", reply, { response_time_ms, tokens_used, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write });
    }
  }));
}
// Escalonamento: a Ana sinaliza com [[ESCALAR: motivo]] quando o caso precisa de humano.
const ESCALATION_NOTE = "## Escalonamento\nSe o cliente PEDIR explicitamente falar com um humano/atendente/pessoa, OU for uma reclamacao seria (produto quebrado/com defeito/faltando/errado, pedido de reembolso/estorno, pedido que nao chegou, cliente claramente irritado, ou mencao a Procon/processo/advogado), comece sua resposta EXATAMENTE com o marcador [[ESCALAR: motivo curto]] e depois escreva UMA frase curta avisando que vai transferir para um atendente humano. Caso contrario, responda normalmente, SEM marcador.";
async function escalateIfFlagged(reply, convId, channel, preview) {
  const m = reply.match(/^\s*\[\[\s*ESCALAR\s*:?\s*([^\]]*)\]\]\s*/i);
  if (!m) return { escalated: false, reply };
  const reason = (m[1] || "").trim() || "Cliente precisa de atendimento humano";
  const clean = reply.slice(m[0].length).trim() || "Vou te transferir para um atendente humano, ja ja alguem te responde por aqui 🙏";
  try {
    await fetch((Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/escalate-notify?key=" + encodeURIComponent(Deno.env.get("IG_VERIFY_TOKEN") || ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: convId, reason, channel, preview: (preview || "").slice(0, 180) })
    });
  } catch (e) { console.log("escalate call err", String(e)); }
  return { escalated: true, reply: clean };
}
Deno.serve(async (req)=>{
  if (req.method === "GET") {
    const u = new URL(req.url);
    if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === Deno.env.get("WA_VERIFY_TOKEN")) {
      return new Response(u.searchParams.get("hub.challenge") || "", {
        status: 200
      });
    }
    return new Response("Forbidden", {
      status: 403
    });
  }
  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch (_e) {}
    const changes = [];
    const entries = body && body.entry || [];
    for (const e of entries)for (const ch of e.changes || [])changes.push(ch);
    globalThis.EdgeRuntime?.waitUntil((async ()=>{
      for (const ch of changes){
        if (ch.field === "messages" && ch.value && ch.value.messages) {
          try {
            await handleValue(ch.value);
          } catch (e) {
            console.log("handle err", String(e));
          }
        }
      }
    })());
    return new Response("EVENT_RECEIVED", {
      status: 200
    });
  }
  return new Response("ok", {
    status: 200
  });
});
