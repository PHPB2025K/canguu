// escalate-notify
// ─────────────────────────────────────────────────────────────────────────────
// Escalonamento CHANNEL-AGNOSTIC. Chamado pelos webhooks (WhatsApp/Instagram/ML)
// quando detectam que o caso precisa de humano. Faz:
//   1. Idempotência (se a conversa já está escalada/com humano → não duplica)
//   2. Cria registro em `escalations`
//   3. Marca a conversa (status=escalated, assigned_to=human_agent) → a "guarda de
//      handoff" dos webhooks faz a Ana parar de responder automaticamente.
//   4. Alerta no Telegram (Kobe Hub, tópico Atendimento da Ana = 15411)
// Tokens lidos de integration_tokens (telegram_bot). Protegido por ?key=IG_VERIFY_TOKEN.
// Deploy --no-verify-jwt.
// ─────────────────────────────────────────────────────────────────────────────
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const KEY = Deno.env.get("IG_VERIFY_TOKEN");
const TG_CHAT = "-1003730816228"; // Kobe Hub
const TG_THREAD = 15411;          // tópico "Atendimento (Ana)"
const LEGAL = ["procon", "advogado", "processo", "justiça", "justica", "reclame", "consumidor", "juizado"];

function db(path, init = {}) {
  const h = { "Content-Type": "application/json", "apikey": SR, "Authorization": "Bearer " + SR };
  if (init.headers) Object.assign(h, init.headers);
  return fetch(SU + "/rest/v1/" + path, { ...init, headers: h });
}
async function getToken(provider) {
  try {
    const r = await db("integration_tokens?provider=eq." + provider + "&select=access_token&limit=1");
    if (r.ok) { const j = await r.json(); if (j[0] && j[0].access_token) return j[0].access_token; }
  } catch (_e) {}
  return null;
}
function escHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
async function tg(text) {
  const bot = await getToken("telegram_bot");
  if (!bot) { console.log("escalate: sem telegram_bot token"); return false; }
  try {
    const r = await fetch("https://api.telegram.org/bot" + bot + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TG_CHAT, message_thread_id: TG_THREAD, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    const j = await r.json();
    if (!j.ok) console.log("escalate tg err", JSON.stringify(j).slice(0, 160));
    return !!j.ok;
  } catch (e) { console.log("escalate tg exc", String(e)); return false; }
}
function urgencyOf(reason, given) {
  if (given) return given;
  const r = (reason || "").toLowerCase();
  if (LEGAL.some((k) => r.includes(k))) return "urgente";
  if (/(quebrad|defeit|danific|irritad|revoltad|p[eé]ssimo|horr[ií]vel|reembolso|estornar?|n[aã]o chegou|errado)/.test(r)) return "urgente";
  return "normal";
}
function json(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (!KEY || u.searchParams.get("key") !== KEY) return json({ ok: false, error: "forbidden" }, 403);
  let b = {};
  try { b = await req.json(); } catch (_e) {}
  const convId = b.conversation_id;
  const reason = (b.reason || "Necessita atendimento humano").slice(0, 500);
  const channel = b.channel || "?";
  if (!convId) return json({ ok: false, error: "missing conversation_id" }, 400);

  try {
    const r = await db("conversations?id=eq." + convId + "&select=status,assigned_to,customer_id");
    const rows = await r.json();
    const conv = Array.isArray(rows) ? rows[0] : null;
    if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);
    // idempotência: já com humano → não duplica
    if (conv.status === "escalated" || (conv.assigned_to && conv.assigned_to !== "agent")) {
      return json({ ok: true, already: true }, 200);
    }
    const urgency = urgencyOf(reason, b.urgency);
    // registro
    await db("escalations", {
      method: "POST", headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ conversation_id: convId, reason, urgency, status: "pending" })
    });
    // marca conversa pra humano (Ana para de responder via guarda de handoff)
    await db("conversations?id=eq." + convId, {
      method: "PATCH", headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ status: "escalated", assigned_to: "human_agent" })
    });
    // nome do cliente p/ o alerta
    let cliente = b.customer_name || "";
    if (!cliente && conv.customer_id) {
      try {
        const cr = await db("customers?id=eq." + conv.customer_id + "&select=name,phone");
        const cj = await cr.json(); if (cj[0]) cliente = cj[0].name || cj[0].phone || "";
      } catch (_e) {}
    }
    const chMap = { whatsapp: "WhatsApp", instagram: "Instagram DM", instagram_comment: "Instagram (comentário)", mercado_livre: "Mercado Livre" };
    const uLabel = urgency === "urgente" ? "🔴 URGENTE\n" : urgency === "alta" ? "🟠 Alta\n" : "";
    const msg = "🚨 <b>Escalonamento — " + escHtml(chMap[channel] || channel) + "</b>\n"
      + uLabel
      + (cliente ? "Cliente: <b>" + escHtml(cliente) + "</b>\n" : "")
      + "Motivo: " + escHtml(reason) + "\n"
      + (b.preview ? "Última: <i>" + escHtml(String(b.preview).slice(0, 180)) + "</i>\n" : "")
      + "\n👉 Assuma pelo painel Canggu (Escalonamentos).";
    const notified = await tg(msg);
    console.log("escalate ok conv=" + convId + " ch=" + channel + " urg=" + urgency + " tg=" + notified);
    return json({ ok: true, escalated: true, urgency, notified }, 200);
  } catch (e) {
    console.log("escalate exc", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
