// daily-learning-review — Aprendizado contínuo da Ana (roda 1x/dia via cron).
//
// Fluxo:
//   1. Pega respostas da Ana das ultimas ~26h que ainda NAO foram avaliadas
//      (marketplace_questions; canais de chat entram na Fase 2b).
//   2. Para cada uma, um JUIZ LLM avalia contra o Padrao Ouro + verdade do catalogo.
//   3. Marca feedback (good/bad) na pergunta.
//   4. Para as inadequadas: gera a correcao + licao, faz DEDUP contra a base
//      existente, e grava em response_corrections.
//        - confianca >= AUTO_APPLY  -> status 'processed' (ativa na hora, com embedding)
//        - confianca menor          -> status 'auto_review' (fila de revisao, NAO usada)
//   5. Registra o resumo da rodada em learning_runs.
//
// A base (response_corrections) ja eh consultada sob demanda pelos 3 canais
// (ML, WhatsApp, Instagram), entao o prompt continua enxuto.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { getConfig } from '../_shared/config.ts'
import { callAnthropic, extractText } from '../_shared/anthropic.ts'
import { generateEmbedding } from '../_shared/embeddings.ts'

const DEDUP_SIM = 0.93        // se ja existe correcao tao parecida, nao duplica
const DEFAULT_AUTO_APPLY = 0.85 // confianca minima para ativar (quando auto-apply estiver ligado)
const BATCH_LIMIT = 12       // max por rodada (cabe no limite de 150s do edge; drena backlog ao longo dos dias)

const CATALOGO = `
VERDADE DO CATALOGO (use para julgar precisao):
- Potes de vidro hermetico BOROSSILICATO (Redondo; Retangular 640/1050/1520ml; Quadrado 320/520/800ml; kits Fit): micro-ondas SIM sem tampa; freezer SIM; lava-loucas SIM (potes; tampas a mao); forno: so o Quadrado 520ml (sem tampa), demais NAO; air fryer NAO (vedacao de silicone + choque termico).
- Porcelana (Caneca Tulipa 250ml, Canelada 250ml, Xicara 170ml, Caneca Reta 200ml): micro-ondas SIM; lava-loucas SIM.
- Canequinha 100ml com suporte: as canequinhas sao de PORCELANA (NAO aluminio); suporte de madeira (pano seco).
- Kits coloridos: cores SORTIDAS conforme estoque; nao da pra escolher cor; alternativa = peca avulsa por nome.
- Dimensoes/peso individuais geralmente NAO existem no cadastro -> dar aproximado com ressalva, NUNCA inventar numero.
`

const RUBRICA = `Voce e um auditor do atendimento da "Ana" (marca Budamix) em marketplaces. Avalie a RESPOSTA dela a uma pergunta publica contra o Padrao Ouro.
REPROVE (inadequada) se houver qualquer um:
- Frase proibida: "nao consta/confirmado/detalhada no cadastro", "vamos/vou verificar internamente", "vou conferir e te retorno / retorno em breve", "vamos atualizar o anuncio", "nossa equipe tecnica", "pedimos desculpas pela divergencia".
- Mencionar devolucao/reembolso/30 dias SEM o cliente pedir.
- Pedir contato externo (WhatsApp/telefone/email/"entre em contato").
- Inventar dado (medida/peso/material/capacidade/composicao) ou descrever PRODUTO ERRADO.
- Omitir info que EXISTE no catalogo (ex.: dizer que nao sabe se vai ao freezer quando vai).
- Reclamacao com ferimento/dano: responder com template e nao acolher/escalar.
${CATALOGO}
Quando reprovar, escreva a resposta_correta no Padrao Ouro (calorosa, direta, com a info certa, oferecendo alternativa por nome quando faltar variacao) e uma licao curta generalizavel (o "tipo" de pergunta e a regra).`

const SCHEMA_HINT = `Responda SOMENTE um JSON valido (sem texto fora dele):
{"veredito":"adequada"|"inadequada","confianca":0.0-1.0,"motivo":"...","resposta_correta":"...","licao":"..."}
Se adequada: resposta_correta e licao podem ser "".`

function parseJudge(raw: string): any | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch { return null }
}

serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors
  const started = Date.now()
  try {
    const cfg = await getConfig()
    // GOVERNANCA: por padrao as correcoes vao para fila de revisao (auto_review),
    // NAO entram ativas sozinhas. Para ligar auto-aplicacao de alta confianca:
    //   agent_config.learning_auto_apply = 'true'   (opcional: learning_auto_apply_confidence)
    const { data: flags } = await supabase.from('agent_config')
      .select('config_key, config_value')
      .in('config_key', ['learning_auto_apply', 'learning_auto_apply_confidence'])
    const fmap = new Map((flags ?? []).map((r: any) => [r.config_key, r.config_value]))
    const autoApplyEnabled = (fmap.get('learning_auto_apply') ?? 'false') === 'true'
    const autoApply = parseFloat(fmap.get('learning_auto_apply_confidence') ?? '') || DEFAULT_AUTO_APPLY

    // Janela: ultimas 26h (cobre folga do agendamento) — opcional ?hours=N para reprocessar
    const url = new URL(req.url)
    const hours = Math.min(Number(url.searchParams.get('hours')) || 26, 24 * 30)
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()

    const { data: rows, error } = await supabase
      .from('marketplace_questions')
      .select('id, platform, platform_item_id, product_name, question_text, answer_text, answered_at, external_created_at, created_at')
      .eq('platform', 'mercado_livre')
      .in('answered_by', ['ai_agent', 'ai'])
      .eq('status', 'answered')
      .is('feedback', null)
      .or(`answered_at.gte.${since},external_created_at.gte.${since},created_at.gte.${since}`)
      .limit(BATCH_LIMIT)
    if (error) throw new Error(`fetch: ${error.message}`)

    const summary = { evaluated: 0, good: 0, bad: 0, auto_applied: 0, queued: 0, deduped: 0, errors: [] as string[] }

    for (const q of rows ?? []) {
      try {
        const userMsg = `ANUNCIO/PRODUTO: ${q.product_name ?? q.platform_item_id}\nPERGUNTA DO COMPRADOR: """${q.question_text}"""\nRESPOSTA DA ANA: """${q.answer_text}"""\n\n${SCHEMA_HINT}`
        const resp = await callAnthropic({
          model: cfg.model, systemPrompt: RUBRICA,
          messages: [{ role: 'user', content: userMsg }],
          maxTokens: 600, temperature: 0,
        })
        const j = parseJudge(extractText(resp))
        if (!j || !j.veredito) { summary.errors.push(`${q.id}: juiz sem JSON`); continue }
        summary.evaluated++

        const isBad = String(j.veredito).toLowerCase().startsWith('inadequad')
        const fb = isBad ? 'bad' : 'good'
        await supabase.from('marketplace_questions')
          .update({ feedback: fb, feedback_at: new Date().toISOString() })
          .eq('id', q.id)
        if (!isBad) { summary.good++; continue }
        summary.bad++

        const recommended = (j.resposta_correta || '').trim()
        if (!recommended) { summary.errors.push(`${q.id}: bad sem resposta_correta`); continue }

        // DEDUP: ja existe correcao parecida (mesma pergunta-tipo)?
        const qEmb = await generateEmbedding(q.question_text)
        const { data: dup } = await supabase.rpc('search_corrections', {
          query_embedding: JSON.stringify(qEmb), match_threshold: DEDUP_SIM, match_count: 1,
        })
        if (dup && dup.length > 0) { summary.deduped++; continue }

        const conf = Number(j.confianca) || 0
        const willApply = autoApplyEnabled && conf >= autoApply
        const status = willApply ? 'processed' : 'auto_review'
        // Embedding sempre gerado: aprovar uma correcao da fila = so virar status 'processed'.
        const recEmb = await generateEmbedding(`${q.question_text}\n${recommended}`)

        const { error: insErr } = await supabase.from('response_corrections').insert({
          question_id: q.id, product_sku: q.platform_item_id,
          original_question: q.question_text, ai_response: q.answer_text,
          recommended_response: recommended,
          corrected_by: 'daily_learning_ia',
          status,
          embedding: JSON.stringify(recEmb),
        } as any)
        if (insErr) { summary.errors.push(`${q.id}: insert ${insErr.message}`); continue }
        if (willApply) summary.auto_applied++; else summary.queued++
      } catch (e) {
        summary.errors.push(`${q.id}: ${String(e)}`)
      }
    }

    const elapsed = Date.now() - started
    await supabase.from('learning_runs').insert({
      channel: 'mercado_livre', window_hours: hours,
      evaluated: summary.evaluated, good: summary.good, bad: summary.bad,
      auto_applied: summary.auto_applied, queued: summary.queued, deduped: summary.deduped,
      errors: summary.errors, duration_ms: elapsed,
    } as any).then(() => {}, () => {})

    return jsonResponse({ success: true, ...summary, duration_ms: elapsed })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) }, 500)
  }
})
