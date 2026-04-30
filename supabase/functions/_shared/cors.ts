// CORS headers for Supabase Edge Functions
// Required for browser-based requests from the dashboard

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

/** Handle CORS preflight (OPTIONS) request. Returns Response or null. */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

/** Create a JSON response with CORS headers */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

/** Create an error JSON response with CORS headers */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status)
}
