// daily-learning-review — Aprendizado contínuo da Ana (roda 1x/dia via cron).
//
// Avalia as respostas recentes da Ana nos 3 canais e captura aprendizado:
//   - Marketplace (perguntas publicas do ML)  -> RUBRICA_ML
//   - WhatsApp / Instagram (chat)              -> RUBRICA_CHAT
// Para cada resposta: um JUIZ LLM avalia (Padrao Ouro + verdade do catalogo),
// marca o veredito, e para as inadequadas gera a correcao + faz DEDUP e grava
// em response_corrections (base consultada sob demanda pelos 3 canais => prompt enxuto).
//
// GOVERNANCA: por padrao as correcoes vao para FILA DE REVISAO (status 'auto_review'),
// NAO entram ativas sozinhas. Ligue auto-aplicacao com agent_config.learning_auto_apply='true'.
//
// CARTILHA UNICA (03/07/2026): as regras de escrita da correcao vem de
// _shared/marketplace-rules.ts — as MESMAS regras do prompt de geracao e do
// validador. Toda correcao passa pelo GATE (validateCorrectionText + detectores
// de chat) ANTES do insert; se violar, o juiz ganha UMA re-tentativa com o
// motivo; persistindo a violacao, a correcao e DESCARTADA e logada em errors.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase-client.ts'
import { getConfig } from '../_shared/config.ts'
import { callAnthropic, extractText } from '../_shared/anthropic.ts'
import { generateEmbedding } from '../_shared/embeddings.ts'
import {
  REGRAS_CORRECAO_ML,
  REGRAS_CORRECAO_CHAT,
  validateCorrectionText,
} from '../_shared/marketplace-rules.ts'
import {
  detectBusinessHoursLimit,
  detectComplaintOverpromise,
} from '../_shared/response-validator.ts'

const DEDUP_SIM = 0.93
const DEFAULT_AUTO_APPLY = 0.85
const ML_LIMIT = 8     // por rodada (cabe no limite de 150s do edge)
const CHAT_LIMIT = 6

const CATALOGO = `
VERDADE DO CATALOGO (use para julgar precisao):
- Potes de vidro hermetico BOROSSILICATO (Redondo; Retangular 640/1050/1520ml; Quadrado 320/520/800ml; kits Fit): micro-ondas SIM sem tampa; freezer SIM; lava-loucas SIM (potes; tampas a mao); forno: so o Quadrado 520ml (sem tampa), demais NAO; air fryer NAO (vedacao de silicone + choque termico).
- Porcelana (Caneca Tulipa 250ml, Canelada 250ml, Xicara 170ml, Caneca Reta 200ml): micro-ondas SIM; lava-loucas SIM.
- Canequinha 100ml com suporte: as canequinhas sao de PORCELANA (NAO aluminio); suporte de madeira (pano seco).
- Kits coloridos: cores SORTIDAS conforme estoque; nao da pra escolher cor; alternativa = peca avulsa por nome.
- Dimensoes/peso individuais geralmente NAO existem no cadastro -> dar aproximado com ressalva, NUNCA inventar.`

const COMUM = `Quando reprovar, escreva resposta_correta com a info certa (oferecendo alternativa Budamix por NOME quando faltar a variacao) e uma licao curta generalizavel (o tipo de pergunta + a regra).
${CATALOGO}`

const RUBRICA_ML = `Voce e auditor do atendimento da "Ana" (Budamix) em MARKETPLACE (perguntas publicas). Avalie a RESPOSTA contra o Padrao Ouro. REPROVE (inadequada) se houver qualquer um:
- Frase proibida: "nao consta/confirmado/detalhada no cadastro", "vamos/vou verificar internamente", "vou conferir e te retorno / retorno em breve", "vamos atualizar o anuncio", "nossa equipe tecnica", "pedimos desculpas pela divergencia".
- Mencionar reclamacao/disputa/mediacao, ou orientar a abrir qualquer uma delas — PROIBIDO ABSOLUTO em marketplace.
- Mencionar devolucao/reembolso/30 dias SEM o cliente pedir.
- Pedir contato externo (WhatsApp/telefone/email/"entre em contato") — PROIBIDO em marketplace.
- Inventar dado (medida/peso/material/capacidade/composicao) ou descrever PRODUTO ERRADO.
- Omitir info que EXISTE no catalogo.
- Reclamacao com ferimento/dano: responder com template e nao acolher/escalar.
- Resposta generica que IGNORA um problema de pedido relatado (produto errado/faltando/nao chegou).
${COMUM}

${REGRAS_CORRECAO_ML}`

const RUBRICA_CHAT = `Voce e auditor do atendimento da "Ana" (Budamix) em CHAT (WhatsApp/Instagram, suporte ao cliente). Avalie a RESPOSTA da Ana dada a ultima mensagem do cliente, no contexto da conversa. No chat emojis (com moderacao) e links do site sao permitidos (diferente do marketplace). REPROVE (inadequada) se houver qualquer um:
- Frase proibida / burocratica: "nao consta no cadastro", "vamos/vou verificar internamente", "vou conferir e te retorno", "horario de atendimento/comercial", "responderemos assim que possivel".
- Inventar dado de produto, preco ou prazo; ou afirmar estoque/atributo que nao sabe.
- Reclamacao/problema: nao demonstrar empatia primeiro, OU prometer troca/reembolso/prazo/coleta (so a equipe humana promete — a Ana coleta dados e escala). Ferimento/dano: tem que acolher + escalar.
- Cliente pediu humano e a Ana tentou reter em vez de escalar.
- Tom robotico/telemarketing ("prezado", "informo que", "estou a disposicao") ou frio com cliente frustrado.
- Empurrar venda sem o cliente pedir, ou ignorar a pergunta.
${COMUM}

${REGRAS_CORRECAO_CHAT}`

const SCHEMA_HINT = `Responda SOMENTE um JSON valido:
{"veredito":"adequada"|"inadequada","confianca":0.0-1.0,"motivo":"...","resposta_correta":"...","licao":"...","escopo":"todos"|"so_marketplace"|"so_conversa"|"so_este_canal","categoria":"<tema curto: entrega|troca|compatibilidade|material|cor|pagamento|tom|outro>"}
Se adequada: resposta_correta/licao podem ser "".
escopo: "todos" = vale em qualquer canal (politica, prazo de entrega, fato de produto); "so_marketplace" = so faz sentido em anuncio publico; "so_conversa" = so em chat (WhatsApp/Instagram Direct); "so_este_canal" = especifico do canal avaliado.
ATENCAO: escopo "todos" exige resposta_correta que sirva TAMBEM em marketplace (sem emoji, max 350 caracteres). Se a correcao precisa de emoji/tom de chat, use "so_conversa".`

// escopo sugerido pelo juiz -> array de canais ({all} eh canonico para "todos")
function mapScope(escopo: unknown, originChannel: string): string[] {
  switch (String(escopo || '').toLowerCase()) {
    case 'todos': return ['all']
    case 'so_marketplace': return ['mercado_livre']
    case 'so_conversa': return ['whatsapp', 'instagram']
    case 'so_este_canal': return [originChannel]
    default: return ['all']
  }
}

function parseJudge(raw: string): any | null {
  try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

// GATE da correcao: mesma cartilha da geracao. Escopo que alcanca marketplace
// ('all'/'mercado_livre') recebe a regua completa; escopo que alcanca chat
// recebe os detectores de chat (horario comercial + overpromise).
function correctionViolations(rec: string, scope: string[]): string[] {
  const v = [...validateCorrectionText(rec, scope).violations]
  const s = scope.map((x) => String(x).toLowerCase())
  const reachesChat = s.includes('all') || s.includes('whatsapp') || s.includes('instagram')
  if (reachesChat) {
    v.push(...detectBusinessHoursLimit(rec).map((r) => `frase proibida (horario): ${r}`))
    v.push(...detectComplaintOverpromise(rec).map((r) => `promessa indevida: ${r}`))
  }
  return v
}

serve(async (req) => {
  const cors = handleCors(req); if (cors) return cors
  const started = Date.now()
  try {
    const cfg = await getConfig()
    const { data: flags } = await supabase.from('agent_config')
      .select('config_key, config_value')
      .in('config_key', ['learning_auto_apply', 'learning_auto_apply_confidence'])
    const fmap = new Map((flags ?? []).map((r: any) => [r.config_key, r.config_value]))
    const autoApplyEnabled = (fmap.get('learning_auto_apply') ?? 'false') === 'true'
    const autoApply = parseFloat(fmap.get('learning_auto_apply_confidence') ?? '') || DEFAULT_AUTO_APPLY

    const url = new URL(req.url)
    const hours = Math.min(Number(url.searchParams.get('hours')) || 26, 24 * 60)
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    const sum = { evaluated: 0, good: 0, bad: 0, auto_applied: 0, queued: 0, deduped: 0, rejected: 0, errors: [] as string[] }

    async function runJudge(rubrica: string, userMsg: string) {
      const resp = await callAnthropic({ model: cfg.model, systemPrompt: rubrica, messages: [{ role: 'user', content: userMsg }], maxTokens: 600, temperature: 0 })
      return parseJudge(extractText(resp))
    }

    // Julga e, se reprovou com correcao, valida a correcao contra a cartilha.
    // Violou -> UMA re-tentativa devolvendo os motivos ao juiz. Persistiu ->
    // devolve rejected (o chamador marca feedback mas NAO grava a correcao).
    async function judgeAndGate(rubrica: string, userMsg: string, originChannel: string, itemLabel: string): Promise<
      { j: any; rec: string; scope: string[]; rejected: string[] | null } | null
    > {
      const j = await runJudge(rubrica, userMsg)
      if (!j?.veredito) return null
      const bad = String(j.veredito).toLowerCase().startsWith('inadequad')
      let rec = bad ? (j.resposta_correta || '').trim() : ''
      let scope = mapScope(j.escopo, originChannel)
      if (!bad || !rec) return { j, rec, scope, rejected: null }

      let violations = correctionViolations(rec, scope)
      if (violations.length === 0) return { j, rec, scope, rejected: null }

      // Guarda de orcamento: a re-tentativa dobra as chamadas LLM no pior caso.
      // Perto do teto de wall-clock do edge (150s), descarta direto sem re-tentar
      // (o item volta na proxima rodada se o feedback nao foi gravado).
      if (Date.now() - started > 100_000) {
        sum.rejected++
        sum.errors.push(`rejected_validation ${itemLabel}: ${violations.join('; ')} (sem re-tentativa: orcamento de tempo)`)
        return { j, rec: '', scope, rejected: violations }
      }

      const retryMsg = `${userMsg}\n\nSUA resposta_correta ANTERIOR FOI REPROVADA pelo validador automatico. Violacoes: ${violations.join('; ')}.\nReescreva o MESMO JSON corrigindo a resposta_correta para obedecer TODAS as regras de escrita da rubrica (sem termos proibidos, dentro do limite de caracteres, sem emoji se o escopo alcancar marketplace). Mantenha veredito/motivo/licao coerentes.`
      const j2 = await runJudge(rubrica, retryMsg)
      const rec2 = (j2?.resposta_correta || '').trim()
      if (rec2) {
        const scope2 = mapScope(j2.escopo, originChannel)
        const v2 = correctionViolations(rec2, scope2)
        if (v2.length === 0) return { j: { ...j2, veredito: 'inadequada' }, rec: rec2, scope: scope2, rejected: null }
        violations = v2
      }
      sum.rejected++
      sum.errors.push(`rejected_validation ${itemLabel}: ${violations.join('; ')}`)
      return { j, rec: '', scope, rejected: violations }
    }

    async function record(question: string, aiResp: string | null, sku: string | null, recommended: string, conf: number, originChannel: string, scope: string[], category: string | null) {
      const qEmb = await generateEmbedding(question)
      const { data: dup } = await supabase.rpc('search_corrections', { query_embedding: JSON.stringify(qEmb), match_threshold: DEDUP_SIM, match_count: 1 })
      if (dup && dup.length > 0) { sum.deduped++; return }
      const willApply = autoApplyEnabled && conf >= autoApply
      const recEmb = await generateEmbedding(`${question}\n${recommended}`)
      const { error } = await supabase.from('response_corrections').insert({
        product_sku: sku, original_question: question, ai_response: aiResp,
        recommended_response: recommended, corrected_by: 'daily_learning_ia',
        status: willApply ? 'processed' : 'auto_review', embedding: JSON.stringify(recEmb),
        origin_channel: originChannel, scope, category: category || null,
      } as any)
      if (error) { sum.errors.push(`rec: ${error.message}`); return }
      if (willApply) sum.auto_applied++; else sum.queued++
    }

    // ── 1) MARKETPLACE (perguntas publicas) ──
    const { data: mlRows } = await supabase.from('marketplace_questions')
      .select('id, platform_item_id, product_name, question_text, answer_text')
      .eq('platform', 'mercado_livre').in('answered_by', ['ai_agent', 'ai']).eq('status', 'answered')
      .is('feedback', null)
      .or(`answered_at.gte.${since},external_created_at.gte.${since},created_at.gte.${since}`)
      .limit(ML_LIMIT)
    for (const q of mlRows ?? []) {
      try {
        const res = await judgeAndGate(RUBRICA_ML, `ANUNCIO/PRODUTO: ${q.product_name ?? q.platform_item_id}\nPERGUNTA: """${q.question_text}"""\nRESPOSTA DA ANA: """${q.answer_text}"""\n\n${SCHEMA_HINT}`, 'mercado_livre', String(q.id))
        if (!res) { sum.errors.push(`${q.id}: juiz sem JSON`); continue }
        const { j, rec, scope } = res
        sum.evaluated++
        const bad = String(j.veredito).toLowerCase().startsWith('inadequad')
        await supabase.from('marketplace_questions').update({ feedback: bad ? 'bad' : 'good', feedback_at: new Date().toISOString() }).eq('id', q.id)
        if (!bad) { sum.good++; continue }
        sum.bad++
        if (rec) await record(q.question_text, q.answer_text, q.platform_item_id, rec, Number(j.confianca) || 0, 'mercado_livre', scope, j.categoria)
      } catch (e) { sum.errors.push(`${q.id}: ${String(e)}`) }
    }

    // ── 2) CHAT (WhatsApp/Instagram) — mensagens 'agent' ainda nao revisadas ──
    const { data: agentMsgs } = await supabase.from('messages')
      .select('id, conversation_id, content, created_at, metadata, conversations!inner(channel)')
      .eq('sender', 'agent').gte('created_at', since)
      .filter('metadata->>learning_reviewed', 'is', null)
      .order('created_at', { ascending: false }).limit(CHAT_LIMIT)
    for (const m of agentMsgs ?? []) {
      try {
        // contexto: ultima mensagem do cliente antes desta resposta
        const { data: prev } = await supabase.from('messages')
          .select('content').eq('conversation_id', m.conversation_id).eq('sender', 'customer')
          .lt('created_at', m.created_at).order('created_at', { ascending: false }).limit(1)
        const clientMsg = prev?.[0]?.content
        if (!clientMsg) { // sem pergunta de cliente clara -> marca revisado e pula
          await supabase.from('messages').update({ metadata: { ...(m.metadata || {}), learning_reviewed: { verdict: 'skip_no_context', at: new Date().toISOString() } } } as any).eq('id', m.id)
          continue
        }
        const canal = (m as any).conversations?.channel ?? 'whatsapp'
        const res = await judgeAndGate(RUBRICA_CHAT, `CANAL: ${canal}\nMENSAGEM DO CLIENTE: """${clientMsg}"""\nRESPOSTA DA ANA: """${m.content}"""\n\n${SCHEMA_HINT}`, canal, `msg ${m.id}`)
        if (!res) { sum.errors.push(`msg ${m.id}: juiz sem JSON`); continue }
        const { j, rec, scope } = res
        sum.evaluated++
        const bad = String(j.veredito).toLowerCase().startsWith('inadequad')
        await supabase.from('messages').update({ metadata: { ...(m.metadata || {}), learning_reviewed: { verdict: bad ? 'bad' : 'good', canal, at: new Date().toISOString() } } } as any).eq('id', m.id)
        if (!bad) { sum.good++; continue }
        sum.bad++
        if (rec) await record(clientMsg, m.content, null, rec, Number(j.confianca) || 0, canal, scope, j.categoria)
      } catch (e) { sum.errors.push(`msg ${m.id}: ${String(e)}`) }
    }

    const elapsed = Date.now() - started
    await supabase.from('learning_runs').insert({
      channel: 'multi', window_hours: hours, evaluated: sum.evaluated, good: sum.good, bad: sum.bad,
      auto_applied: sum.auto_applied, queued: sum.queued, deduped: sum.deduped, errors: sum.errors, duration_ms: elapsed,
    } as any).then(() => {}, () => {})

    return jsonResponse({ success: true, ...sum, duration_ms: elapsed })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) }, 500)
  }
})
