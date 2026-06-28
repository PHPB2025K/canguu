// instagram-token-refresh
// ─────────────────────────────────────────────────────────────────────────────
// Renova o Instagram user access token (long-lived, ~60 dias) do fluxo IG-Login e
// grava em public.integration_tokens (provider='instagram'). O instagram-webhook lê
// o token dessa tabela (com fallback p/ o env IG_PAGE_TOKEN no 1o boot).
//
// Chamado pelo pg_cron a cada 3 dias (net.http_post). Protegido por ?key=IG_VERIFY_TOKEN.
// Deploy SEM JWT (verify_jwt=false em config.toml + NO_JWT_FUNCTIONS) — o pg_net chama
// sem JWT Supabase; a proteção é o ?key. NUNCA retorna o token no corpo da resposta.
// ─────────────────────────────────────────────────────────────────────────────
const GRAPH = "https://graph.instagram.com";
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ENV_TOKEN = Deno.env.get("IG_PAGE_TOKEN");
const KEY = Deno.env.get("IG_VERIFY_TOKEN");

function db(path, init = {}) {
  const h = { "Content-Type": "application/json", "apikey": SR, "Authorization": "Bearer " + SR };
  if (init.headers) Object.assign(h, init.headers);
  return fetch(SU + "/rest/v1/" + path, { ...init, headers: h });
}

async function currentToken() {
  try {
    const r = await db("integration_tokens?provider=eq.instagram&select=access_token&limit=1");
    if (r.ok) {
      const j = await r.json();
      if (j[0] && j[0].access_token) return j[0].access_token;
    }
  } catch (_e) {}
  return ENV_TOKEN; // fallback: ainda não populou a tabela
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (!KEY || u.searchParams.get("key") !== KEY) return json({ ok: false, error: "forbidden" }, 403);

  const tok = await currentToken();
  if (!tok) return json({ ok: false, error: "no_token_available" }, 500);

  try {
    const r = await fetch(GRAPH + "/refresh_access_token?grant_type=ig_refresh_token&access_token=" + encodeURIComponent(tok));
    const j = await r.json();
    if (!r.ok || !j.access_token) {
      console.log("ig refresh fail", r.status, JSON.stringify(j).slice(0, 200));
      return json({ ok: false, status: r.status, error: j.error || "no_access_token" }, 502);
    }
    const expiresIn = j.expires_in || 5184000; // ~60d default
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const up = await db("integration_tokens?on_conflict=provider", {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ provider: "instagram", access_token: j.access_token, expires_at: expiresAt, refreshed_at: new Date().toISOString() })
    });
    if (!up.ok) {
      console.log("ig refresh upsert http", up.status, (await up.text()).slice(0, 160));
      return json({ ok: false, error: "db_upsert_failed" }, 500);
    }
    console.log("ig token refreshed OK, expires_at=" + expiresAt);
    return json({ ok: true, expires_in: expiresIn, expires_at: expiresAt }, 200);
  } catch (e) {
    console.log("ig refresh exc", String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});
