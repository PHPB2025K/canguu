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
// ─── v38 (30/09/2026, auditoria de 30 dias da Ana) ──────────────────────────────
// Modelo: a Ana segue agent_config.model (pedido do Pedro em 30/09: claude-opus-5-5,
// esforco high). Claude 4.7+ recusa temperature e pensa antes de responder; o
// raciocinio conta no max_tokens. Se o principal falhar, 1 tentativa na reserva.
const MODELO_PADRAO = "claude-sonnet-4-6";
const MODELO_RESERVA = "claude-sonnet-4-6";
const MODELOS_COM_RACIOCINIO = /claude-(opus-4-[7-9]|opus-[5-9]|sonnet-[5-9]|fable)/i;
// "unsupported" = o WhatsApp entregou a mensagem sem conteudo legivel. A Ana ficava
// muda e 3 clientes novos ficaram sem resposta em set/2026. Agora ela pede o texto,
// no maximo 1 vez a cada 12 h por conversa (anti-loop com robos).
const RESPOSTA_SEM_FORMATO = "Oi! Aqui é a Ana, da Budamix." + CHUNK_SEP + "Sua mensagem chegou num formato que eu não consigo abrir por aqui. Pode me escrever em texto o que você precisa?";
const JANELA_AVISO_FORMATO_MS = 12 * 3600 * 1000;
// Pedido do SITE: a Ana usa a MESMA consulta publica da pagina "Rastrear pedido" do
// budamix.com.br (numero do pedido + e-mail da compra). Nenhum acesso novo ao banco do site.
const SITE_API = Deno.env.get("SITE_SUPABASE_URL") || "https://ioujfkrqvporfbvdqyus.supabase.co";
const SITE_ANON = Deno.env.get("SITE_ANON_KEY") || "";
const STATUS_SITE = {
  pending_payment: "aguardando pagamento",
  paid: "pago, em preparação",
  processing: "em separação",
  shipped: "enviado",
  delivered: "entregue",
  cancelled: "cancelado",
  refunded: "reembolsado"
};
const NOME_CANAL = {
  site: "Site Budamix",
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  amazon: "Amazon"
};
const REGRAS_CANAL = "## REGRAS DESTE CANAL (WhatsApp) — valem mais que qualquer instrucao anterior\n" +
  "- Tudo o que voce escrever chega direto no cliente. NAO existe nota interna, metadata ou campo escondido: nunca escreva \"nota interna\", resumo para a equipe ou observacao entre parenteses. Para chamar a equipe use SOMENTE o marcador [[ESCALAR: motivo]] no inicio.\n" +
  "- Voce nao consegue verificar nada depois nem voltar a falar sozinha mais tarde. PROIBIDO prometer retorno: \"vou verificar e ja te retorno\", \"ja te retorno\", \"so um momento\", \"aguarde\", \"assim que eu souber te aviso\". Responda agora com o que voce tem. Se faltar algo que so a equipe resolve, escale com [[ESCALAR: motivo]] e diga que a equipe responde por aqui mesmo.\n" +
  "- Links: envie SOMENTE link que aparece escrito no contexto acima e que seja do produto certo. Nunca monte, adivinhe ou complete um link. Sem link no contexto, diga o nome do produto e onde encontrar (site ou loja do canal).\n" +
  "- Estoque: produto marcado SEM ESTOQUE nao pode ser oferecido nem ter link enviado: diga que esta indisponivel agora e ofereca uma alternativa que tenha estoque.\n" +
  "- Pos-venda de compra feita em marketplace segue o bloco \"Quando escalar\" acima; as fichas de trilha falam de VENDA NOVA.\n" +
  "- Responda a mensagem atual do cliente sem repetir o que voce ja disse antes.";
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
  // Devolve o id da linha: a mensagem do cliente com midia e gravada ANTES da leitura
  // (Gemini/Groq) e completada depois com patchMessage.
  try {
    const r = await db("messages", {
      method: "POST",
      headers: {
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender,
        content,
        ...extra
      })
    });
    const j = await r.json().catch(()=>null);
    if (!r.ok) {
      console.log("saveMessage http " + r.status, JSON.stringify(j).slice(0, 200));
      return null;
    }
    return Array.isArray(j) && j[0] ? j[0].id : null;
  } catch (e) {
    console.log("saveMessage exc", String(e));
    return null;
  }
}
async function patchMessage(id, patch) {
  if (!id) return;
  try {
    await db("messages?id=eq." + id, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  } catch (e) {
    console.log("patchMessage exc", String(e));
  }
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
// Deduplicacao: a Meta as vezes reentrega o mesmo evento (set/2026: 1 caso abriu 2
// conversas e 2 respostas para a mesma mensagem).
async function jaGravada(waMsgId) {
  if (!waMsgId) return false;
  try {
    const r = await db("messages?whatsapp_message_id=eq." + encodeURIComponent(waMsgId) + "&select=id&limit=1");
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_e) {
    return false;
  }
}
// Ultima mensagem do cliente de QUALQUER tipo (menos reacao): usada pelo aviso de formato.
// A Meta pode reentregar o MESMO evento em paralelo: as duas copias passam pela
// checagem de cima ao mesmo tempo. Depois de gravar, so segue a copia mais antiga;
// a outra apaga a propria linha e sai.
async function copiaRepetida(waMsgId, rowId) {
  if (!waMsgId || !rowId) return false;
  try {
    const r = await db("messages?whatsapp_message_id=eq." + encodeURIComponent(waMsgId) + "&select=id&order=created_at.asc,id.asc");
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length > 1 && rows[0].id !== rowId) {
      await db("messages?id=eq." + rowId, {
        method: "DELETE"
      });
      return true;
    }
  } catch (_e) {}
  return false;
}
async function getLatestCustomerAnyId(conversationId) {
  const r = await db("messages?conversation_id=eq." + conversationId + "&sender=eq.customer&message_type=neq.reaction&order=created_at.desc&limit=1&select=whatsapp_message_id");
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].whatsapp_message_id ?? null : null;
}
async function anaFalouDesde(conversationId, ms) {
  try {
    const r = await db("messages?conversation_id=eq." + conversationId + "&sender=eq.agent&created_at=gte." + new Date(Date.now() - ms).toISOString() + "&select=id&limit=1");
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (_e) {
    return true; // na duvida, fica quieta (anti-loop)
  }
}
let MODELO_CACHE = {
  v: "",
  t: 0
};
async function getAgentModel() {
  if (MODELO_CACHE.v && Date.now() - MODELO_CACHE.t < 60000) return MODELO_CACHE.v;
  let v = "";
  try {
    const r = await db("agent_config?config_key=eq.model&select=config_value");
    const rows = await r.json();
    v = Array.isArray(rows) && rows[0]?.config_value ? String(rows[0].config_value).trim() : "";
  } catch (_e) {}
  MODELO_CACHE = {
    v: v.startsWith("claude") ? v : MODELO_PADRAO,
    t: Date.now()
  };
  return MODELO_CACHE.v;
}
// ─── Travas de saida (deterministicas, rodam depois da IA) ──────────────────────
// 1) Nota interna: o manual antigo mandava "incluir internamente um resumo" e isso
//    chegou ao cliente ("--- Nota interna: pedido #C55255B1 — canal site").
function limparNotasInternas(t) {
  let s = String(t || "");
  s = s.replace(/\n?[ \t]*-{2,}[ \t]*\*?[ \t]*\(?[ \t]*nota\s+interna[\s\S]*$/i, "");
  s = s.replace(/>?[ \t]*\*?[ \t]*\(\s*nota\s+interna[^)]*\)[ \t]*\*?/gi, "");
  s = s.replace(/\*?[ \t]*nota\s+interna\s*[:\-–][^\n\\]*/gi, "");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}
// 2) Promessa de retorno: a Ana nao volta a falar sozinha. Se ela prometer, a conversa
//    vai para a equipe, para a promessa ser cumprida por alguem.
const PROMESSA_RE = /(j[aá]|logo|em breve)\s+te\s+(retorno|respondo|aviso|chamo)|te\s+(retorno|respondo|aviso)\s+(j[aá]|logo|em breve|assim que)|vou\s+(verificar|confirmar|checar|consultar|conferir)\s+(isso\s+|aqui\s+)?e\s+(j[aá]\s+)?te\b|assim que (eu )?(tiver|souber|conseguir|verificar)|aguarde\s+(s[oó]\s+)?(um|uns)\s+(instante|momento|minuto|pouquinho)|s[oó]\s+um\s+(instante|momento|minutinho)/i;
function detectarPromessa(t) {
  const m = String(t || "").match(PROMESSA_RE);
  return m ? m[0] : null;
}
// 3) Links: so sai link que existe no catalogo (ou no contexto desta resposta).
//    Em set/2026 a Ana mandou link de canequinha como se fosse de pote e inventou
//    um link do site que nao abria.
function normUrl(u) {
  return String(u || "").trim().replace(/[.,;:!?*_)\]]+$/, "").replace(/\/+$/, "").toLowerCase();
}
let LINKS_CACHE = {
  set: null,
  t: 0
};
async function linksDoCatalogo() {
  if (LINKS_CACHE.set && Date.now() - LINKS_CACHE.t < 600000) return LINKS_CACHE.set;
  const set = new Set();
  try {
    const r = await db("products?is_active=eq.true&select=site_link,marketplace_links");
    const rows = await r.json();
    if (Array.isArray(rows)) {
      for (const p of rows){
        if (p.site_link) set.add(normUrl(p.site_link));
        const ml = jsonObj(p.marketplace_links);
        if (ml) for (const v of Object.values(ml))if (v && !/seller\./i.test(String(v))) set.add(normUrl(v));
      }
    }
  } catch (_e) {}
  LINKS_CACHE = {
    set,
    t: Date.now()
  };
  return set;
}
const RAIZ_LOJA = {
  "budamix.com.br": "https://budamix.com.br",
  "www.budamix.com.br": "https://budamix.com.br",
  "klapporcelana.com.br": "https://klapporcelana.com.br",
  "www.klapporcelana.com.br": "https://klapporcelana.com.br"
};
async function protegerLinks(reply, ctx) {
  // O separador de baloes (\\) costuma vir colado no fim do link: ele nao faz parte da URL.
  const URL_RE = /https?:\/\/[^\s<>"'\\]+/g;
  const achados = String(reply || "").match(URL_RE);
  if (!achados) return reply;
  const ok = new Set(await linksDoCatalogo());
  for (const u of String(ctx || "").match(/https?:\/\/[^\s<>"'|\\]+/g) || [])ok.add(normUrl(u));
  const digitosCtx = String(ctx || "").replace(/\D/g, "");
  return String(reply).replace(URL_RE, (bruto)=>{
    const url = bruto.replace(/[.,;:!?*_)\]]+$/, "");
    const resto = bruto.slice(url.length);
    const n = normUrl(url);
    if (ok.has(n)) return bruto;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch (_e) {}
    if (RAIZ_LOJA[host] && n === normUrl(RAIZ_LOJA[host])) return bruto;
    if (host === "wa.me" || host.endsWith("whatsapp.com")) {
      const d = url.replace(/\D/g, "").slice(-11);
      if (d.length >= 10 && digitosCtx.includes(d)) return bruto;
    }
    console.log("link fora do catalogo bloqueado:", url);
    if (RAIZ_LOJA[host]) return RAIZ_LOJA[host] + resto;
    if (host.includes("shopee")) return "(é só buscar Budamix na Shopee)" + resto;
    if (host.includes("mercadoli") || host.includes("mercadolibre")) return "(é só buscar Budamix no Mercado Livre)" + resto;
    if (host.includes("amazon")) return "(é só buscar Budamix na Amazon)" + resto;
    return resto;
  });
}
// ─── Pedidos: o canal sai do FORMATO do codigo (disjunto entre as 4 plataformas) ──
//   site    #379A1BE5            8 hex (prefixo do id do pedido no site)
//   ml      2000016645926064     16 digitos
//   shopee  260528JKV25P22       6 digitos + 8 alfanumericos
//   amazon  701-0027529-4365846  3-7-7
const PADROES_PEDIDO = [
  {
    canal: "amazon",
    re: /\b\d{3}-\d{7}-\d{7}\b/g
  },
  {
    canal: "shopee",
    re: /\b\d{6}[A-Z0-9]{8}\b/gi
  },
  {
    canal: "mercado_livre",
    re: /\b\d{16}\b/g
  },
  {
    canal: "site",
    re: /#?\b[0-9A-F]{8}\b/gi
  }
];
function detectarPedidos(texto) {
  if (!texto || String(texto).length < 8) return [];
  let work = String(texto);
  const out = [];
  const vistos = new Set();
  for (const { canal, re } of PADROES_PEDIDO){
    for (const m of work.match(re) || []){
      // 8 hex sozinho e facil de acertar por acaso (CEP, valor). Sem '#', so vale
      // quando mistura letra e numero, como o numero de pedido do site.
      if (canal === "site" && !m.startsWith("#") && !(/[0-9]/.test(m) && /[A-F]/i.test(m))) continue;
      const codigo = m.replace(/^#/, "").toUpperCase();
      if (vistos.has(codigo)) continue;
      vistos.add(codigo);
      out.push({
        codigo,
        canal
      });
      work = work.replace(m, " ".repeat(m.length));
    }
  }
  return out.slice(0, 2);
}
function dataBr(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
async function consultarPedidoSite(codigo, email) {
  if (!SITE_ANON) return {
    erro: "consulta do site nao configurada"
  };
  const ctrl = new AbortController();
  const tm = setTimeout(()=>ctrl.abort(), 12000);
  try {
    const r = await fetch(SITE_API + "/functions/v1/get-order-by-token", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: SITE_ANON,
        Authorization: "Bearer " + SITE_ANON
      },
      body: JSON.stringify({
        orderId: codigo,
        email
      })
    });
    const j = await r.json().catch(()=>({}));
    if (r.status === 404) return {
      naoEncontrado: true
    };
    if (!r.ok || j.error) return {
      erro: String(j.error || "http " + r.status)
    };
    return {
      pedido: j
    };
  } catch (e) {
    return {
      erro: String(e).slice(0, 120)
    };
  } finally{
    clearTimeout(tm);
  }
}
function ultimoEvento(eventos) {
  if (!Array.isArray(eventos) || !eventos.length) return null;
  let melhor = eventos[0];
  let tMelhor = Date.parse(melhor && melhor.date || "") || 0;
  for (const e of eventos){
    const t = Date.parse(e && e.date || "") || 0;
    if (t > tMelhor) {
      melhor = e;
      tMelhor = t;
    }
  }
  return melhor;
}
async function blocoPedido(hist) {
  const doCliente = (hist || []).filter((m)=>m.sender === "customer" && m.content).slice(-12).reverse();
  let refs = [];
  for (const m of doCliente){
    refs = detectarPedidos(m.content);
    if (refs.length) break;
  }
  if (!refs.length) return "";
  let email = "";
  for (const m of doCliente){
    const e = String(m.content).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (e) {
      email = e[0].toLowerCase();
      break;
    }
  }
  const linhas = [];
  for (const ref of refs){
    if (ref.canal !== "site") {
      linhas.push("- Codigo " + ref.codigo + ": pedido do " + NOME_CANAL[ref.canal] + " (identificado pelo formato do codigo). O assunto e desse canal: oriente pelo app dele.");
      continue;
    }
    if (!email) {
      linhas.push("- Codigo #" + ref.codigo + ": pedido do SITE Budamix. Para consultar a situacao voce precisa do E-MAIL usado na compra: peca o e-mail ao cliente (uma vez so), sem prometer retorno.");
      continue;
    }
    const res = await consultarPedidoSite(ref.codigo, email);
    if (res.pedido) {
      const p = res.pedido;
      const itens = Array.isArray(p.items) ? p.items.map((i)=>(i.quantity || 1) + "x " + i.product_name).join("; ") : "";
      const ev = ultimoEvento(p.tracking_events);
      linhas.push([
        "- Pedido #" + ref.codigo + " (SITE Budamix) — consultado AGORA no sistema do site",
        "  Situacao no site: " + (STATUS_SITE[p.status] || p.status),
        "  Feito em: " + (dataBr(p.created_at) || "?") + (itens ? " · Itens: " + itens : ""),
        p.tracking_code ? "  Codigo de rastreio: " + p.tracking_code : "  Rastreio: ainda sem codigo (nao postado)",
        p.tracking_status ? "  Situacao na transportadora: " + (p.tracking_status === "delivered" ? "ENTREGUE" : p.tracking_status) : "",
        ev ? "  Ultimo evento do rastreio: " + (dataBr(ev.date) || "") + " " + ev.description : "",
        p.refund_label ? "  Reembolso: " + p.refund_label : "",
        "  Acompanhar online: https://budamix.com.br/rastrear (numero do pedido + e-mail da compra)"
      ].filter(Boolean).join("\n"));
    } else if (res.naoEncontrado) {
      linhas.push("- Codigo #" + ref.codigo + " com o e-mail informado: NAO localizei no site. Peca para o cliente conferir o numero do pedido e o e-mail da compra. Nao invente situacao.");
    } else {
      linhas.push("- Codigo #" + ref.codigo + ": pedido do SITE, mas a consulta falhou agora (" + res.erro + "). Nao invente situacao e nao prometa retorno: se o cliente precisar da situacao, escale com [[ESCALAR: consulta de pedido do site falhou]].");
    }
  }
  return "## Pedido em Questao\n" + linhas.join("\n") + "\n\nREGRAS DESTE BLOCO: o canal acima vem do FORMATO do codigo e vence o historico. Use SO estes dados; nunca invente status, data ou rastreio. NUNCA repita endereco nem dados pessoais. Pedido do site com situacao/rastreio aqui: responda voce mesma, na hora. Escale apenas se o cliente pedir cancelamento, reembolso ou troca, relatar defeito, disser que nao recebeu um pedido que consta como ENTREGUE, ou se estiver enviado ha mais de 10 dias sem entrega.";
}
// Cumprimento puro ("oi", "boa tarde"): o menu de canais basta. Com assunto, a Ana responde.
const CUMPRIMENTOS = new Set([
  "oi", "oii", "oiii", "oie", "ola", "opa", "e", "ai", "eai", "eae", "bom", "boa", "dia", "tarde", "noite",
  "tudo", "bem", "td", "blz", "beleza", "como", "vai", "voce", "vc", "ana", "budamix", "hello", "hi", "alo", "ok"
]);
function soCumprimento(texto) {
  const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").trim();
  if (!t) return true;
  const palavras = t.split(/\s+/).filter(Boolean);
  return palavras.length <= 6 && palavras.every((p)=>CUMPRIMENTOS.has(p));
}
function semMenu(hist) {
  return (hist || []).filter((x)=>!(x.sender === "agent" && String(x.content || "").startsWith(PICKER_BODY)));
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
  const st = String(p.stock_status || "");
  const est = st === "out_of_stock" ? "SEM ESTOQUE agora (nao oferecer nem mandar link)" : st === "low_stock" ? "estoque baixo" : st === "in_stock" ? "em estoque" : st;
  if (est) lines.push("  Estoque: " + est);
  if (p.differentials) lines.push("  Diferenciais: " + String(p.differentials).replace(/\s+/g, " ").slice(0, 200));
  if (p.usage_suggestions) lines.push("  Uso: " + String(p.usage_suggestions).replace(/\s+/g, " ").slice(0, 160));
  if (p.site_link) lines.push("  Link site: " + p.site_link);
  const links = jsonObj(p.marketplace_links);
  if (links) {
    const lp = Object.entries(links).filter(([_, v])=>v && !/seller\./i.test(String(v))).map(([k, v])=>k + ": " + v);
    if (lp.length) lines.push("  Links marketplace: " + lp.join(" | "));
  }
  return lines.join("\n");
}
async function getPolicies() {
  try {
    const r = await db("policies?is_active=eq.true&select=title,category,marketplace,summary,content&order=priority.desc&limit=6");
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return "";
    // Atacado vai com o texto inteiro: e ali que esta o contato do Marcus. So com o
    // resumo, a Ana dizia "passo o WhatsApp do Marcus" sem ter o numero.
    return rows.map((p)=>"- [" + (p.category || "geral") + (p.marketplace ? "/" + p.marketplace : "") + "] " + p.title + (p.summary ? ": " + p.summary : "") + (p.category === "atacado" && p.content ? "\n" + String(p.content).trim() : "")).join("\n");
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
  return "=== CONTEXTO DE ATENDIMENTO (dados REAIS da Budamix) ===\nUse SOMENTE as informacoes abaixo para falar de produtos, precos, estoque, links, prazos e politicas. Se a info NAO estiver aqui, diga com honestidade que nao tem esse dado agora (sem prometer retorno) — NUNCA invente produto, preco, estoque ou link.\n\n" + sections.join("\n\n");
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
  const vazio = {
    text: "",
    tokens_in: 0,
    tokens_out: 0,
    cache_read: 0,
    cache_write: 0,
    model: ""
  };
  if (!merged.length) return vazio;
  if (contextBlock && contextBlock.trim()) {
    for(let i = merged.length - 1; i >= 0; i--){
      if (merged[i].role === "user") {
        merged[i].content = contextBlock.trim() + "\n\n---\n# Mensagem atual do cliente:\n" + merged[i].content;
        break;
      }
    }
  }
  const principal = await getAgentModel();
  const fila = [
    principal,
    ...[
      MODELO_RESERVA
    ].filter((m)=>m !== principal)
  ];
  for (const modelo of fila){
    const body = {
      model: modelo,
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
    };
    if (MODELOS_COM_RACIOCINIO.test(modelo)) {
      body.max_tokens = 8000;
      body.output_config = {
        effort: "high"
      };
    }
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY"),
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const j = await res.json().catch(()=>({}));
      if (!res.ok || j.error) {
        console.log("anthropic err " + modelo + " http " + res.status, JSON.stringify(j.error || j).slice(0, 300));
        continue;
      }
      // Modelos que pensam devolvem primeiro o bloco de raciocinio: o texto e o bloco "text".
      const bloco = Array.isArray(j.content) ? j.content.find((c)=>c && c.type === "text" && c.text) : null;
      const text = bloco ? bloco.text : "";
      if (!text.trim()) {
        console.log("anthropic sem texto " + modelo, String(j.stop_reason || ""));
        continue;
      }
      if (modelo !== principal) console.log("modelo de reserva usado: " + principal + " -> " + modelo);
      const u = j.usage || {};
      return {
        text,
        tokens_in: u.input_tokens || 0,
        tokens_out: u.output_tokens || 0,
        cache_read: u.cache_read_input_tokens || 0,
        cache_write: u.cache_creation_input_tokens || 0,
        model: modelo
      };
    } catch (e) {
      console.log("anthropic exc " + modelo, String(e));
    }
  }
  return vazio;
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
function extFor(mime, nomeArquivo) {
  // Documento: vale a extensao do nome original (nota.pdf, planilha.xlsx)
  const doNome = /\.([a-z0-9]{1,5})$/i.exec(String(nomeArquivo || "").trim());
  if (doNome) return doNome[1].toLowerCase();
  const mm = (mime || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/3gpp": "3gp",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/xml": "xml",
    "application/xml": "xml",
    "application/json": "json",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "application/vnd.rar": "rar",
    "application/x-rar-compressed": "rar"
  };
  if (map[mm]) return map[mm];
  if (mm.startsWith("image/")) return "jpg";
  if (mm.startsWith("audio/")) return "ogg";
  if (mm.startsWith("video/")) return "mp4";
  return "bin";
}
// Tipo que o navegador executaria (pagina, script, svg) e guardado como arquivo comum: so baixa, nao abre.
const TIPOS_QUE_EXECUTAM = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/javascript|application\/(x-)?javascript|application\/ecmascript)$/i;
async function uploadToStorage(kind, convId, msgId, bytes, mime, nomeArquivo) {
  const safeId = String(msgId).replace(/[^A-Za-z0-9_-]/g, "_");
  const path = kind + "/" + convId + "/" + safeId + "." + extFor(mime, nomeArquivo);
  let ct = (mime || "").split(";")[0].trim() || "application/octet-stream";
  if (TIPOS_QUE_EXECUTAM.test(ct)) ct = "application/octet-stream";
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
// ─── ARQUIVOS p/ a tela do Canggu (01/10/2026): documento, figurinha, localizacao, contato ───
// A Ana continua sem abrir PDF; o arquivo fica guardado para a EQUIPE ver no painel
// (antes so foto, audio e video ficavam; PDF e figurinha se perdiam).
const LIMITE_ARQUIVO = 25 * 1024 * 1024; // limite do bucket chat-attachments
async function baixarArquivoWa(mediaId) {
  const info = await fetch(GRAPH + "/" + mediaId, {
    headers: {
      Authorization: "Bearer " + WA_TOKEN
    }
  }).then((r)=>r.json());
  if (!info || !info.url) throw new Error("media url indisponivel");
  const mime = info.mime_type || null;
  const declarado = Number(info.file_size) || 0;
  // Grande demais: nem baixa (o arquivo inteiro iria para a memoria da funcao)
  if (declarado > LIMITE_ARQUIVO) return {
    bytes: null,
    size: declarado,
    mime
  };
  const res = await fetch(info.url, {
    headers: {
      Authorization: "Bearer " + WA_TOKEN
    }
  });
  if (!res.ok) throw new Error("download " + res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > LIMITE_ARQUIVO) return {
    bytes: null,
    size: bytes.length,
    mime
  };
  return {
    bytes,
    size: bytes.length,
    mime
  };
}
function nomeLimpo(nome) {
  const n = String(nome || "").replace(/[\\/\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return n ? n.slice(0, 120) : null;
}
// Documento e figurinha: baixa da Meta e guarda no Storage. Devolve o metadata da mensagem.
async function guardarArquivo(m, convId) {
  const tipo = m.type;
  const obj = m[tipo] || {};
  const meta = {};
  if (tipo === "document") {
    const nome = nomeLimpo(obj.filename);
    if (nome) meta.document_filename = nome;
    if (obj.mime_type) meta.document_mimetype = obj.mime_type;
    if (obj.caption && String(obj.caption).trim()) meta.caption = String(obj.caption).trim();
  } else {
    if (obj.mime_type) meta.sticker_mimetype = obj.mime_type;
    if (obj.animated) meta.sticker_animated = true;
  }
  if (!obj.id) return meta;
  try {
    const arq = await baixarArquivoWa(obj.id);
    const mime = arq.mime || obj.mime_type || "application/octet-stream";
    if (tipo === "document" && arq.size) meta.document_size = arq.size;
    if (!arq.bytes) {
      meta.upload_error = "arquivo maior que 25 MB";
      return meta;
    }
    const url = await uploadToStorage(tipo, convId, m.id, arq.bytes, mime, obj.filename);
    if (tipo === "document") {
      meta.document_url = url;
      meta.document_mimetype = mime;
    } else {
      meta.sticker_url = url;
      meta.sticker_mimetype = mime;
    }
  } catch (e) {
    console.log(tipo + " upload err", String(e));
    meta.upload_error = String(e).slice(0, 160);
  }
  return meta;
}
// Localizacao, contato, reacao e "unsupported": o que a Meta manda vai para metadata (a tela mostra).
function metaSemArquivo(m) {
  if (m.type === "location" && m.location) {
    const l = m.location;
    return {
      location: {
        latitude: l.latitude,
        longitude: l.longitude,
        name: l.name || null,
        address: l.address || null,
        url: l.url || null
      }
    };
  }
  if (m.type === "contacts" && Array.isArray(m.contacts)) {
    return {
      contacts: m.contacts.slice(0, 10).map((c)=>({
          name: c.name && (c.name.formatted_name || [
            c.name.first_name,
            c.name.last_name
          ].filter(Boolean).join(" ")) || "Contato",
          org: c.org && c.org.company || null,
          phones: (c.phones || []).map((p)=>p.phone || p.wa_id).filter(Boolean),
          emails: (c.emails || []).map((e)=>e.email).filter(Boolean)
        }))
    };
  }
  if (m.type === "reaction" && m.reaction) {
    return {
      reaction: {
        emoji: m.reaction.emoji || "",
        message_id: m.reaction.message_id || null
      }
    };
  }
  if (m.type === "unsupported") {
    const meta = {};
    if (Array.isArray(m.errors) && m.errors.length) meta.wa_errors = m.errors.slice(0, 3);
    if (m.unsupported) meta.unsupported = m.unsupported;
    return meta;
  }
  return {};
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
  } else if (m.type === "reaction") {
    // Reacao nao pede resposta; antes ia para o historico como "formato que voce nao consegue ler"
    const emoji = m.reaction && m.reaction.emoji;
    text = emoji ? "[reaction: " + emoji + "]" : "[reaction removida]";
  } else if (m.type === "button") {
    // Toque em botao de modelo de mensagem (campanha): o texto do botao e a resposta
    text = m.button && m.button.text ? "[" + m.button.text + "]" : "[button]";
  } else {
    const AVISO = {
      video: AVISO_VIDEO,
      document: "[O cliente enviou um DOCUMENTO/PDF. Voce NAO consegue abrir. Peca o numero do pedido ou uma foto.]",
      sticker: "[O cliente enviou uma figurinha. Nao ha conteudo — apenas siga a conversa, sem inventar assunto.]",
      location: "[O cliente enviou uma LOCALIZACAO" + (m.location && (m.location.name || m.location.address) ? ": " + [
        m.location.name,
        m.location.address
      ].filter(Boolean).join(", ") : "") + ". Se for sobre entrega, peca o CEP em texto.]",
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
  const PREVIA_MIDIA = {
    image: "[Foto recebida]",
    audio: "[Audio recebido]",
    video: "[Video recebido]"
  };
  const FALHA_MIDIA = {
    image: "[Foto recebida, mas nao foi possivel ver desta vez. Peca para o cliente descrever ou reenviar.]",
    audio: "[Audio recebido, mas nao foi possivel ouvir desta vez. Peca para o cliente escrever.]",
    video: AVISO_VIDEO
  };
  for (const m of msgs){
    const from = m.from;
    if (!from) continue;
    if (await jaGravada(m.id)) {
      console.log("dedup: mensagem ja gravada", m.id);
      continue;
    }
    const { text, pickedSource } = parseInbound(m);
    const customerId = await getOrCreateCustomer(from, name);
    const convId = await getOrCreateConversation(customerId);
    const temMidia = m.type === "image" || m.type === "audio" || m.type === "video";
    // Grava ANTES de ler a midia (Gemini/Groq levam 5-20 s). Sem isso a mensagem
    // anterior do cliente era respondida sozinha e a Ana respondia de novo depois:
    // 18% das respostas de set/2026 sairam em dobro.
    const legenda = temMidia && m[m.type] && m[m.type].caption ? String(m[m.type].caption).trim() : "";
    const temArquivo = m.type === "document" || m.type === "sticker";
    const metaFixa = metaSemArquivo(m);
    const rowId = await saveMessage(convId, "customer", temMidia ? (legenda ? legenda + "\n" : "") + PREVIA_MIDIA[m.type] : text, {
      message_type: m.type,
      whatsapp_message_id: m.id,
      ...Object.keys(metaFixa).length ? {
        metadata: metaFixa
      } : {}
    });
    if (await copiaRepetida(m.id, rowId)) {
      console.log("dedup: copia simultanea descartada", m.id);
      continue;
    }
    if (temMidia) {
      const r = await processMedia(m, convId);
      const patch = {};
      if (r && r.text && r.text.trim()) patch.content = r.text;
      else patch.content = (legenda ? legenda + "\n" : "") + FALHA_MIDIA[m.type];
      if (r && r.meta && Object.keys(r.meta).length) patch.metadata = r.meta;
      await patchMessage(rowId, patch);
    }
    if (temArquivo) {
      const metaArq = await guardarArquivo(m, convId);
      if (Object.keys(metaArq).length) await patchMessage(rowId, {
        metadata: {
          ...metaFixa,
          ...metaArq
        }
      });
    }
    if (pickedSource) await updateCustomerSource(customerId, pickedSource);
    // TRAVA 1: atendimento automatico de empresa — grava e nao responde.
    if (NUMEROS_SERVICO.has(String(from))) {
      console.log("anti-loop: numero de servico, grava e nao responde", from);
      continue;
    }
    // TRAVA 2: reacao (emoji numa mensagem) nao pede resposta — grava e segue quieta.
    if (m.type === "reaction") {
      console.log("reacao: grava e nao responde", from);
      continue;
    }
    // "unsupported" entra no turno com a marca soFormato: se a rajada for so isso,
    // a Ana pede o texto (1x a cada 12 h), em vez de ficar muda.
    const prev = touched.get(convId);
    const soFormato = TIPOS_SEM_CONTEUDO.has(m.type) && (!prev || prev.soFormato);
    touched.set(convId, {
      from,
      lastMsgId: m.id,
      customerId,
      soFormato
    });
  }
  await Promise.all([
    ...touched.entries()
  ].map(async ([convId, info])=>{
    await sleep(DEBOUNCE_MS);
    if (info.soFormato) {
      const ultima = await getLatestCustomerAnyId(convId);
      if (ultima && ultima !== info.lastMsgId) return;
      const dono = await getConversationAssignee(convId);
      if (dono && dono !== "agent") return;
      if (await anaFalouDesde(convId, JANELA_AVISO_FORMATO_MS)) {
        console.log("formato sem conteudo: a Ana ja falou nas ultimas 12 h, fica quieta", convId);
        return;
      }
      await sendWhatsApp(info.from, RESPOSTA_SEM_FORMATO, info.lastMsgId);
      await saveMessage(convId, "agent", RESPOSTA_SEM_FORMATO, {
        message_type: "text"
      });
      return;
    }
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
    let pickerSent = await wasPickerSent(convId);
    if (!known && !pickerSent) {
      const textoAtual = latestUserText(semMenu(await getRecentMessages(convId)));
      await sendChannelPicker(info.from);
      await saveMessage(convId, "agent", PICKER_MARK, {
        message_type: "interactive"
      });
      pickerSent = true;
      // So cumprimento: o menu basta. Se o cliente ja trouxe o assunto (pergunta, foto,
      // reclamacao), a Ana responde logo, sem esperar o clique no menu.
      if (soCumprimento(textoAtual)) return;
    }
    const sys = await getSystemPrompt();
    if (info.lastMsgId) await sendTyping(info.lastMsgId);
    const hist = await getRecentMessages(convId);
    const consulta = latestUserText(semMenu(hist));
    const t0 = Date.now();
    let ctx = await buildGrounding(consulta);
    const pedido = await blocoPedido(hist);
    if (pedido) ctx = ctx ? ctx + "\n\n" + pedido : "=== CONTEXTO DE ATENDIMENTO ===\n" + pedido;
    const originNote = known ? "## Cliente\nOrigem do cliente: " + src + ". NAO pergunte por onde nos encontrou (ja sabemos). Para link de compra, prefira o do canal " + src + "." : pickerSent ? "## Cliente\nO menu de canais ja foi enviado ao cliente. NAO pergunte a origem em texto; apenas ajude. Se precisar mandar link, use o do site." : "";
    if (originNote) ctx = ctx ? ctx + "\n\n" + originNote : "=== CONTEXTO DE ATENDIMENTO ===\n" + originNote;
    ctx = (ctx ? ctx + "\n\n" : "=== CONTEXTO DE ATENDIMENTO ===\n") + ESCALATION_NOTE + "\n\n" + REGRAS_CANAL;
    const gen = await anaReply(sys, hist, ctx);
    let reply = gen.text;
    const response_time_ms = Date.now() - t0;
    const tokens_in = gen.tokens_in || 0;
    const tokens_out = gen.tokens_out || 0;
    const tokens_cache_read = gen.cache_read || 0;
    const tokens_cache_write = gen.cache_write || 0;
    const tokens_used = tokens_in + tokens_out || null;
    if (!reply || !reply.trim()) {
      console.log("Ana sem resposta: a IA falhou no modelo principal e na reserva", convId);
      return;
    }
    // A rajada continuou enquanto a Ana pensava: descarta esta resposta. O turno da
    // mensagem mais nova responde tudo de uma vez (fim das respostas em dobro).
    const latestDepois = await getLatestCustomerMsgId(convId);
    if (latestDepois && latestDepois !== info.lastMsgId) {
      console.log("resposta descartada: chegou mensagem nova durante a geracao", convId);
      return;
    }
    const donoDepois = await getConversationAssignee(convId);
    if (donoDepois && donoDepois !== "agent") return;
    reply = limparNotasInternas(reply);
    reply = await protegerLinks(reply, ctx);
    const promessa = detectarPromessa(reply);
    if (promessa && !/\[\[\s*ESCALAR/i.test(reply)) {
      console.log("promessa de retorno detectada, conversa vai para a equipe:", promessa);
      reply = "[[ESCALAR: a Ana prometeu retorno ao cliente (\"" + promessa + "\") e alguem precisa responder]] " + reply;
    }
    const esc = await escalateIfFlagged(reply, convId, "whatsapp", consulta);
    reply = enforceRareEmojiPolicy(esc.reply, consulta);
    if (!reply || !reply.trim()) return;
    await sendWhatsApp(info.from, reply, info.lastMsgId);
    await saveMessage(convId, "agent", reply, {
      response_time_ms,
      tokens_used,
      tokens_in,
      tokens_out,
      tokens_cache_read,
      tokens_cache_write,
      metadata: {
        model: gen.model,
        escalated: esc.escalated || undefined
      }
    });
  }));
}
const ESCALATION_NOTE = "## Quando escalar (humano) vs resolver sozinha\nESCALE SOMENTE se: o cliente pedir explicitamente falar com humano/atendente DEPOIS de voce ja ter tentado ajudar; mencao a Procon/processo/advogado/disputa formal; cliente muito irritado/ofensivo; pagamento duplicado ou dinheiro que so a equipe pode mover; a compra foi no SITE Budamix e o cliente quer cancelamento, reembolso ou troca, relata defeito, ou diz que nao recebeu um pedido que consta como entregue (situacao e rastreio de pedido do site voce mesma responde pelo bloco 'Pedido em Questao'; sem ele, peca o numero do pedido e o e-mail da compra); ou voce ja orientou o passo a passo e o cliente nao conseguiu / o problema persiste.\nNAO ESCALE de primeira: produto quebrado/com defeito/errado/faltando ou pedido que nao chegou em compra de MARKETPLACE. Nesses casos VOCE resolve guiando o cliente no AUTOATENDIMENTO do canal da compra: acolha em uma frase, pergunte onde comprou (se nao souber), peca nº do pedido e foto quando ajudar, e oriente passo a passo a abrir a solicitacao NO PROPRIO app/site onde comprou — Mercado Livre: Minhas compras > toca no pedido > 'Devolver ou reclamar'; Shopee: Minhas compras > toca no pedido > 'Pedido de Devolucao/Reembolso'; Amazon: Meus pedidos > toca no pedido > 'Devolver ou substituir itens'. Explique que a plataforma exige que a solicitacao seja aberta pelo proprio cliente, que e rapido e seguro, e que voce acompanha e tira duvidas em cada passo.\nFORMATO quando escalar: comece a resposta EXATAMENTE com o marcador [[ESCALAR: motivo curto]] e depois UMA frase curta dizendo que a equipe vai responder por aqui mesmo, sem prometer prazo. O marcador e INTERNO: NUNCA pode aparecer no meio ou no fim do texto.";
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
    // SONDA DE SAUDE (30/09): gera a resposta pelo MESMO caminho da Ana (contexto,
    // pedido, modelo e travas de saida), sem enviar e sem gravar nada.
    // Uso: GET ?probe=1&key=<IG_VERIFY_TOKEN>[&q=mensagem do cliente]
    if (u.searchParams.get("probe") === "1") {
      const chave = Deno.env.get("IG_VERIFY_TOKEN") || "";
      if (!chave || u.searchParams.get("key") !== chave) return new Response("Forbidden", {
        status: 403
      });
      const pergunta = (u.searchParams.get("q") || "Oi! O pote de vidro pode ir no micro-ondas?").slice(0, 600);
      const hist = [
        {
          sender: "customer",
          content: pergunta
        }
      ];
      const t0 = Date.now();
      let ctx = await buildGrounding(pergunta);
      const pedido = await blocoPedido(hist);
      if (pedido) ctx = ctx ? ctx + "\n\n" + pedido : "=== CONTEXTO DE ATENDIMENTO ===\n" + pedido;
      ctx = (ctx ? ctx + "\n\n" : "=== CONTEXTO DE ATENDIMENTO ===\n") + ESCALATION_NOTE + "\n\n" + REGRAS_CANAL;
      const gen = await anaReply(await getSystemPrompt(), hist, ctx);
      let r = limparNotasInternas(gen.text || "");
      r = await protegerLinks(r, ctx);
      const promessa = detectarPromessa(r);
      const escalaria = /\[\[\s*ESCALAR/i.test(r) || !!promessa;
      r = enforceRareEmojiPolicy(r.replace(/\s*\[\[[^\]]*\]\]\s*/gi, " ").trim(), pergunta);
      return new Response(JSON.stringify({
        ok: !!gen.text,
        modelo: gen.model,
        ms: Date.now() - t0,
        tokens_in: gen.tokens_in,
        tokens_out: gen.tokens_out,
        cache_read: gen.cache_read,
        pedido_consultado: !!pedido,
        escalaria,
        promessa,
        resposta: r
      }), {
        status: gen.text ? 200 : 502,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
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
