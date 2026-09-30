import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { enforceRareEmojiPolicy } from "../_shared/chat-style.ts";
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
const PICKER_BODY = "Oi! Eu sou a Ana, da Budamix. Pra te atender certinho, me conta: por onde voce nos encontrou?";
const PICKER_MARK = PICKER_BODY + " [menu de canais enviado: Site, Mercado Livre, Shopee, Amazon, Outro]";
// Numeros de ATENDIMENTO AUTOMATICO de empresas. A Ana grava a mensagem mas NUNCA responde.
// Sem isso, robo conversa com robo ate a Meta banir a conta (incidentes 18/07 e 20/08/2026).
const NUMEROS_SERVICO = new Set([
  "5511999910621" // atendimento Claro — operadora do proprio chip da Ana
]);
// Tipos que nao carregam conteudo nenhum: grava para o historico, mas nao aciona a Ana.
const TIPOS_SEM_CONTEUDO = new Set([
  "unsupported",
  "reaction"
]);
// Disjuntor anti-loop: teto de respostas da Ana por conversa por hora.
// Pico HUMANO real medido no banco: 22/h (Andre Juliane 07/08). O loop da Claro bateu 65/h.
const TETO_RESPOSTAS_HORA = 25;
// Rede de seguranca: so vale quando o Gemini nao conseguiu assistir (video
// grande demais, chave fora do ar). O caminho normal e a Ana VER o video.
const AVISO_VIDEO = "[O cliente enviou um VIDEO que nao foi possivel ler desta vez. Peca uma FOTO do problema ou que ele descreva em texto.]";
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
  // Conversa ÚNICA por cliente/canal (como o histórico do próprio WhatsApp):
  // reusa SEMPRE a mais recente, independente do status. Escalada/assumida por
  // humano -> reusa como está (a guarda de handoff mantém a Ana quieta).
  // Resolvida/fechada com a Ana -> REABRE a mesma conversa (status volta a active).
  const r = await db("conversations?customer_id=eq." + customerId + "&channel=eq.whatsapp&order=started_at.desc&limit=1&select=id,status,assigned_to");
  const rows = await r.json();
  if (Array.isArray(rows) && rows.length) {
    const conv = rows[0];
    if ((conv.assigned_to || "agent") === "agent" && conv.status !== "active") {
      await db("conversations?id=eq." + conv.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: "active"
        })
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
  // Ignora reaction/unsupported: eles sao gravados mas nao contam como "mensagem nova",
  // senao uma figurinha depois da pergunta faria a Ana engolir a pergunta.
  const r = await db("messages?conversation_id=eq." + conversationId + "&sender=eq.customer&message_type=not.in.(unsupported,reaction)&order=created_at.desc&limit=1&select=whatsapp_message_id");
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
  // Tira os fosseis sinteticos: eles envenenavam a busca no catalogo.
  return parts.filter((t)=>!/^\[Cliente selecionou canal:/.test(String(t || ""))).join(" ").replace(/\[(unsupported|reaction|video|sticker|document|location|contacts|interactive)[^\]]*\]/gi, " ").replace(/\s{2,}/g, " ").trim();
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
  // A API da Anthropic recusa historico que termina em 'assistant'
  // ("does not support assistant message prefill") — e a recusa era MUDA:
  // nada era enviado e nada era gravado. Acontecia em rajada e em loop.
  while(merged.length && merged[merged.length - 1].role !== "user")merged.pop();
  if (!merged.length) return {
    text: "",
    tokens_in: 0,
    tokens_out: 0,
    cache_read: 0,
    cache_write: 0
  };
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
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: {
            type: "ephemeral"
          }
        }
      ],
      messages: merged
    })
  });
  const j = await res.json();
  if (j.error) {
    console.log("anthropic err", JSON.stringify(j.error));
    return {
      text: "",
      tokens_in: 0,
      tokens_out: 0,
      cache_read: 0,
      cache_write: 0
    };
  }
  const text = j.content && j.content[0] && j.content[0].text ? j.content[0].text : "";
  const tokens_in = j.usage ? j.usage.input_tokens || 0 : 0;
  const tokens_out = j.usage ? j.usage.output_tokens || 0 : 0;
  const cache_read = j.usage ? j.usage.cache_read_input_tokens || 0 : 0;
  const cache_write = j.usage ? j.usage.cache_creation_input_tokens || 0 : 0;
  return {
    text,
    tokens_in,
    tokens_out,
    cache_read,
    cache_write
  };
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
    headers: {
      Authorization: "Bearer " + WA_TOKEN
    }
  }).then((r)=>r.json());
  if (!meta || !meta.url) throw new Error("media url indisponivel");
  const res = await fetch(meta.url, {
    headers: {
      Authorization: "Bearer " + WA_TOKEN
    }
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for(let i = 0; i < buf.length; i += 0x8000)bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return {
    base64: btoa(bin),
    bytes: buf,
    mime: meta.mime_type || "application/octet-stream"
  };
}
function extFor(mime) {
  const mm = (mime || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "video/mp4": "mp4"
  };
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
    headers: {
      Authorization: "Bearer " + SR,
      apikey: SR,
      "Content-Type": ct,
      "x-upsert": "true",
      "Cache-Control": "3600"
    },
    body: bytes
  });
  if (!r.ok) throw new Error("storage " + r.status + " " + (await r.text()).slice(0, 140));
  return SU + "/storage/v1/object/public/chat-attachments/" + path;
}
async function transcribeAudio(base64, mime) {
  if (!GROQ_KEY) return null;
  const bytes = Uint8Array.from(atob(base64), (c)=>c.charCodeAt(0));
  const fd = new FormData();
  fd.append("file", new Blob([
    bytes
  ], {
    type: mime || "audio/ogg"
  }), "audio.ogg");
  fd.append("model", "whisper-large-v3");
  fd.append("language", "pt");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + GROQ_KEY
    },
    body: fd
  });
  const j = await r.json();
  return j && j.text ? j.text : null;
}
// 🔴 O NOME DO MODELO ENVELHECE, e por isso aqui e uma CADEIA e nao um nome fixo.
// Em 19/08/2026 o gemini-2.5-flash passou a devolver 404 "no longer available to
// new users" para chave NOVA — mas esta chave e antiga e continua tendo acesso.
// Medido em 25/08 com um video real: o 2.5 respondeu na hora, o 3.6 devolveu
// "high demand" (erro transitorio, nao permanente).
// Ordem: o que funciona HOJE primeiro, para nao pagar ida e volta perdida em
// toda foto; o sucessor logo atras, para o dia em que o Google desligar o 2.5.
const GEMINI_MODELOS = [
  "gemini-2.5-flash",
  "gemini-3.6-flash"
];
let GEMINI_MODELO_BOM = null; // memoriza o que respondeu, p/ nao gastar 2 chamadas sempre
async function geminiGerar(parts) {
  if (!GEMINI_KEY) return null;
  const fila = GEMINI_MODELO_BOM ? [
    GEMINI_MODELO_BOM,
    ...GEMINI_MODELOS.filter((m)=>m !== GEMINI_MODELO_BOM)
  ] : GEMINI_MODELOS;
  for (const modelo of fila){
    try {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/" + modelo + ":generateContent?key=" + GEMINI_KEY;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts
            }
          ]
        })
      });
      const j = await r.json();
      const t = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
      if (t) {
        GEMINI_MODELO_BOM = modelo;
        return t;
      }
      console.log("gemini " + modelo + " sem texto", JSON.stringify(j.error || j).slice(0, 200));
    } catch (e) {
      console.log("gemini exc " + modelo, String(e));
    }
  }
  return null;
}
async function describeImage(base64, mime) {
  return await geminiGerar([
    {
      text: "Descreva objetivamente esta imagem enviada por um cliente da Budamix (utilidades domesticas), focando no que importa para o atendimento: produto/objeto mostrado, cor, defeito ou dano, texto/etiqueta visivel, comprovante de pagamento. Seja conciso (1-3 frases), em portugues."
    },
    {
      inline_data: {
        mime_type: mime || "image/jpeg",
        data: base64
      }
    }
  ]);
}
// Video vai inline, igual a imagem. O WhatsApp limita o arquivo a 16 MB, mas o
// base64 infla ~33% e o teto de requisicao do Gemini e 20 MB — dai o corte em
// 12 MB de arquivo bruto. Acima disso a Ana assume que nao viu, em vez de
// estourar a chamada em silencio.
const VIDEO_MAX_BYTES = 12 * 1024 * 1024;
async function describeVideo(base64, mime, bytesLen) {
  if (bytesLen > VIDEO_MAX_BYTES) {
    console.log("video grande demais para inline", bytesLen);
    return null;
  }
  return await geminiGerar([
    {
      text: "Um cliente da Budamix (utilidades domesticas: potes de vidro, canecas, porcelana) enviou este video no atendimento. Descreva objetivamente o que da para ver, focando no que importa para resolver o caso: qual produto aparece, cor, se ha defeito, trinca, quebra, vazamento ou peca faltando, o que a pessoa demonstra ou aponta, e qualquer etiqueta, nota ou embalagem visivel. Se o video mostrar a abertura de uma encomenda, diga o estado em que a mercadoria chegou. Seja concreto e conciso (2-4 frases), em portugues, sem especular alem do que aparece."
    },
    {
      inline_data: {
        mime_type: mime || "video/mp4",
        data: base64
      }
    }
  ]);
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
      return {
        text,
        meta
      };
    }
    if (m.type === "video" && m.video && m.video.id) {
      const md = await downloadWaMedia(m.video.id);
      const meta = {};
      // 1) sobe o arquivo -> a tela do Canggu ganha o player (independe da IA)
      try {
        meta.video_url = await uploadToStorage("video", convId, m.id, md.bytes, md.mime);
        meta.video_mimetype = md.mime;
      } catch (e) {
        console.log("video upload err", String(e));
      }
      // 2) Gemini ASSISTE p/ a Ana entender
      const desc = await describeVideo(md.base64, md.mime, md.bytes.length);
      if (desc) meta.ai_description = desc;
      const caption = (m.video.caption || "").trim();
      const text = desc ? (caption ? caption + "\n" : "") + "[Video enviado pelo cliente] " + desc : (caption ? caption + "\n" : "") + AVISO_VIDEO;
      return {
        text,
        meta
      };
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
      return {
        text,
        meta
      };
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
    const AVISO = {
      video: AVISO_VIDEO,
      document: "[O cliente enviou um DOCUMENTO/PDF. Voce NAO consegue abrir. Peca o numero do pedido ou uma foto.]",
      sticker: "[O cliente enviou uma figurinha. Nao ha conteudo — apenas siga a conversa, sem inventar assunto.]",
      location: "[O cliente enviou uma LOCALIZACAO. Se for sobre entrega, peca o CEP em texto.]",
      contacts: "[O cliente enviou um CONTATO. Se precisar falar com outra pessoa, peca o telefone em texto.]"
    };
    text = AVISO[m.type] || "[" + m.type + " — formato que voce nao consegue ler. Peca para o cliente escrever em texto.]";
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
    if (m.type === "image" || m.type === "audio" || m.type === "video") {
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
    // TRAVA 1: atendimento automatico de empresa — grava e nao responde.
    if (NUMEROS_SERVICO.has(String(from))) {
      console.log("anti-loop: numero de servico, grava e nao responde", from);
      continue;
    }
    // TRAVA 2: placeholder sem conteudo — grava e nao responde.
    if (TIPOS_SEM_CONTEUDO.has(m.type)) {
      console.log("anti-loop: tipo sem conteudo, grava e nao responde", m.type, from);
      continue;
    }
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
    // TRAVA 3: disjuntor anti-loop. Se a Ana ja respondeu demais nesta conversa na ultima
    // hora, ela para e chama humano. Teto acima do pico humano real medido (22/h).
    try {
      const rh = await db("messages?conversation_id=eq." + convId + "&sender=eq.agent&created_at=gte." + new Date(Date.now() - 3600000).toISOString() + "&select=id");
      const naUltimaHora = await rh.json();
      if (Array.isArray(naUltimaHora) && naUltimaHora.length >= TETO_RESPOSTAS_HORA) {
        console.log("anti-loop: disjuntor disparou com " + naUltimaHora.length + " respostas/hora", convId);
        await db("conversations?id=eq." + convId, {
          method: "PATCH",
          body: JSON.stringify({
            assigned_to: "pending_human",
            status: "escalated"
          })
        });
        await fetch((Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/escalate-notify?key=" + encodeURIComponent(Deno.env.get("IG_VERIFY_TOKEN") || ""), {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            conversation_id: convId,
            reason: "disjuntor anti-loop: " + naUltimaHora.length + " respostas em 1 hora",
            channel: "whatsapp",
            preview: "Conversa pausada automaticamente. Devolver para a Ana = assigned_to voltar para agent."
          })
        }).catch((e)=>console.log("escalate-notify err", String(e)));
        return;
      }
    } catch (e) {
      console.log("disjuntor exc (segue normal)", String(e));
    }
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
    const tokens_used = tokens_in + tokens_out || null;
    if (reply && reply.trim()) {
      const esc = await escalateIfFlagged(reply, convId, "whatsapp", latestUserText(hist));
      reply = enforceRareEmojiPolicy(esc.reply, latestUserText(hist));
      await sendWhatsApp(info.from, reply, info.lastMsgId);
      await saveMessage(convId, "agent", reply, {
        response_time_ms,
        tokens_used,
        tokens_in,
        tokens_out,
        tokens_cache_read,
        tokens_cache_write
      });
    }
  }));
}
// Escalonamento: a Ana sinaliza com [[ESCALAR: motivo]] quando o caso precisa de humano.
const ESCALATION_NOTE = "## Quando escalar (humano) vs resolver sozinha\nESCALE SOMENTE se: o cliente pedir explicitamente falar com humano/atendente DEPOIS de voce ja ter tentado ajudar; mencao a Procon/processo/advogado/disputa formal; cliente muito irritado/ofensivo; pagamento duplicado ou dinheiro que so a equipe pode mover; a compra foi no SITE Budamix (a equipe resolve direto — colete nº do pedido e foto antes de escalar); ou voce ja orientou o passo a passo e o cliente nao conseguiu / o problema persiste.\nNAO ESCALE de primeira: produto quebrado/com defeito/errado/faltando ou pedido que nao chegou em compra de MARKETPLACE. Nesses casos VOCE resolve guiando o cliente no AUTOATENDIMENTO do canal da compra: acolha em uma frase, pergunte onde comprou (se nao souber), peca nº do pedido e foto quando ajudar, e oriente passo a passo a abrir a solicitacao NO PROPRIO app/site onde comprou — Mercado Livre: Minhas compras > toca no pedido > 'Devolver ou reclamar'; Shopee: Minhas compras > toca no pedido > 'Pedido de Devolucao/Reembolso'; Amazon: Meus pedidos > toca no pedido > 'Devolver ou substituir itens'. Explique que a plataforma exige que a solicitacao seja aberta pelo proprio cliente, que e rapido e seguro, e que voce acompanha e tira duvidas em cada passo.\nFORMATO quando escalar: comece a resposta EXATAMENTE com o marcador [[ESCALAR: motivo curto]] e depois UMA frase curta avisando que vai transferir. O marcador e INTERNO: NUNCA pode aparecer no meio ou no fim do texto.";
async function escalateIfFlagged(reply, convId, channel, preview) {
  // O marcador e instrucao interna: detecta em QUALQUER posicao (a IA as vezes
  // erra e poe no fim) e remove todo [[...]] antes do envio — nunca vaza pro cliente.
  const m = reply.match(/\[\[\s*ESCALAR\s*:?\s*([^\]]*)\]\]/i);
  const stripped = reply.replace(/\s*\[\[[^\]]*\]\]\s*/gi, " ").replace(/ {2,}/g, " ").trim();
  if (!m) return {
    escalated: false,
    reply: stripped
  };
  const reason = (m[1] || "").trim() || "Cliente precisa de atendimento humano";
  const clean = stripped || "Vou te transferir para um atendente humano, ja ja alguem te responde por aqui.";
  try {
    await fetch((Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/escalate-notify?key=" + encodeURIComponent(Deno.env.get("IG_VERIFY_TOKEN") || ""), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        conversation_id: convId,
        reason,
        channel,
        preview: (preview || "").slice(0, 180)
      })
    });
  } catch (e) {
    console.log("escalate call err", String(e));
  }
  return {
    escalated: true,
    reply: clean
  };
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
