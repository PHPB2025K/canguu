import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'

const OPENAI_URL = 'https://api.openai.com/v1/embeddings'
const MODEL = 'text-embedding-3-small'

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) throw new Error('OPENAI_API_KEY not set')

    const { data: corrections, error } = await supabase
      .from('response_corrections')
      .select('*')
      .eq('status', 'pending')
      .is('embedding', null)

    if (error) throw new Error(error.message)
    if (!corrections || corrections.length === 0) {
      return jsonResponse({ success: true, processed: 0, message: 'No pending corrections' })
    }

    let processed = 0
    const errors: string[] = []

    for (const corr of corrections) {
      try {
        const text = `Pergunta do cliente: ${corr.original_question}\nResposta correta: ${corr.recommended_response}`

        const res = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, input: text }),
        })
        if (!res.ok) throw new Error(`OpenAI ${res.status}`)
        const data = await res.json()
        const embedding = data.data[0].embedding

        const { error: updateError } = await supabase
          .from('response_corrections')
          .update({
            embedding: JSON.stringify(embedding),
            status: 'processed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', corr.id)

        if (updateError) throw new Error(updateError.message)
        processed++
        console.log(`Processed correction ${corr.id}`)
        await new Promise(r => setTimeout(r, 100))
      } catch (err) {
        errors.push(`${corr.id}: ${String(err)}`)
      }
    }

    return jsonResponse({ success: true, processed, total: corrections.length, errors })
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) })
  }
})
