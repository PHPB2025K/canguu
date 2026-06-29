// instagram-ad-comments-poll
// ─────────────────────────────────────────────────────────────────────────────
// Cobre comentários em ANÚNCIOS do Instagram (inclusive dark posts / criativos que
// NÃO existem no feed). A Meta não manda webhook pra esses, então fazemos polling:
//   1. Marketing API (token de Ads) → lista anúncios ATIVOS → effective_instagram_media_id de cada.
//   2. graph.instagram.com/{media}/comments (token da Ana) → comentários.
//   3. Comentário novo → encaminha um evento sintético pro instagram-webhook,
//      que aplica a MESMA lógica (filtro de intenção, dedup, resposta pública + DM).
//
// Tokens lidos de public.integration_tokens: provider='meta_ads' (Ads) e 'instagram' (Ana).
// Roda via pg_cron. Protegido por ?key=IG_VERIFY_TOKEN. Deploy --no-verify-jwt.
// ─────────────────────────────────────────────────────────────────────────────
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const KEY = Deno.env.get("IG_VERIFY_TOKEN");
const AD_ACCOUNT = Deno.env.get("META_AD_ACCOUNT_ID") || "1140258596603533"; // Budamix
const GRAPH_IG = "https://graph.instagram.com";
const GRAPH_FB = "https://graph.facebook.com/v21.0";
const WEBHOOK_URL = SU + "/functions/v1/instagram-webhook";

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
async function alreadyHandled(commentId) {
  try {
    const r = await db("messages?whatsapp_message_id=eq." + encodeURIComponent("cmt:" + commentId) + "&select=id&limit=1");
    if (r.ok) { const j = await r.json(); return j.length > 0; }
  } catch (_e) {}
  return false;
}
function json(o, s) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (!KEY || u.searchParams.get("key") !== KEY) return json({ ok: false, error: "forbidden" }, 403);

  const adsTok = await getToken("meta_ads");
  const igTok = await getToken("instagram");
  if (!adsTok) return json({ ok: false, error: "no_ads_token: gravar em integration_tokens provider=meta_ads" }, 400);
  if (!igTok) return json({ ok: false, error: "no_ig_token" }, 400);

  // 1) anúncios ativos -> media ids
  let ads;
  try {
    const r = await fetch(GRAPH_FB + "/act_" + AD_ACCOUNT + "/ads?fields=name,effective_status,creative{effective_instagram_media_id}&limit=400&access_token=" + adsTok);
    ads = await r.json();
    if (ads.error) return json({ ok: false, stage: "list_ads", error: ads.error }, 502);
  } catch (e) { return json({ ok: false, stage: "list_ads", error: String(e) }, 500); }

  const mediaIds = new Set();
  for (const ad of (ads.data || [])) {
    if (ad.effective_status !== "ACTIVE") continue;
    const mid = ad.creative && ad.creative.effective_instagram_media_id;
    if (mid) mediaIds.add(mid);
  }

  // 2) comentários de cada mídia -> encaminha os novos pro webhook
  let forwarded = 0, checked = 0, skipped = 0;
  for (const mid of mediaIds) {
    checked++;
    let comments;
    try {
      const r = await fetch(GRAPH_IG + "/" + mid + "/comments?fields=id,text,username,timestamp,from&limit=50&access_token=" + igTok);
      comments = await r.json();
    } catch (_e) { continue; }
    for (const c of (comments.data || [])) {
      if (!c.id || !c.text) continue;
      if (await alreadyHandled(c.id)) { skipped++; continue; }
      const from = c.from || { username: c.username };
      const payload = { object: "instagram", entry: [{ changes: [{ field: "comments", value: { id: c.id, from: from, text: c.text, media: { id: mid, media_product_type: "AD" } } }] }] };
      try {
        await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        forwarded++;
      } catch (_e) {}
    }
  }
  console.log("ad-comments-poll: ads=" + (ads.data || []).length + " media=" + checked + " forwarded=" + forwarded + " skipped=" + skipped);
  return json({ ok: true, ads_total: (ads.data || []).length, media_checked: checked, forwarded, skipped }, 200);
});
