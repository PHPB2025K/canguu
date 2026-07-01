import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Atualiza agent_config.usd_brl_rate com a cotacao USD/BRL do dia.
// Usado pelo card de Custo do Analytics (rollup le esse cambio). Chamado por pg_cron diario (jobid fx-rate-update).
// Protegido por ?key= (IG_VERIFY_TOKEN, reusado). Sem JWT Supabase (cron chama direto).
const SU = Deno.env.get("SUPABASE_URL");
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const KEY = Deno.env.get("IG_VERIFY_TOKEN") || "";

async function fetchRate(): Promise<number | null> {
  // 1) exchangerate-api (sem key)
  try {
    const r = await fetch("https://api.exchangerate-api.com/v4/latest/USD", { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    const j = await r.json();
    const v = j && j.rates && j.rates.BRL;
    if (isFinite(Number(v))) return Number(v);
  } catch (_e) {}
  // 2) AwesomeAPI (fallback; pode dar 429 sem key)
  try {
    const r = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL", { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    const j = await r.json();
    const v = j && j.USDBRL && j.USDBRL.bid;
    if (isFinite(parseFloat(v))) return parseFloat(v);
  } catch (_e) {}
  return null;
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (KEY && u.searchParams.get("key") !== KEY) return new Response("Forbidden", { status: 403 });
  try {
    const rate = await fetchRate();
    if (rate === null || !isFinite(rate) || rate < 3 || rate > 10) {
      console.log("fx indisponivel/fora do range", rate);
      return new Response(JSON.stringify({ ok: false, reason: "rate_unavailable_or_out_of_range", rate }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    const val = rate.toFixed(4);
    const up = await fetch(SU + "/rest/v1/agent_config?config_key=eq.usd_brl_rate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "apikey": SR, "Authorization": "Bearer " + SR, "Prefer": "return=minimal" },
      body: JSON.stringify({ config_value: val }),
    });
    return new Response(JSON.stringify({ ok: up.ok, usd_brl_rate: val, patch_status: up.status }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log("fx exc", String(e));
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
