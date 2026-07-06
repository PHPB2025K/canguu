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

// ── COBERTURA TOTAL (03/07/2026) — "continuar de onde parou" ──
// A selecao NAO usa mais janela de ~26h: pega itens SEM carimbo (feedback /
// learning_reviewed nulos) do mais antigo pro mais novo, a partir do FLOOR.
// O carimbo por item e o cursor — nada expira sem ser analisado. Quando o
// orcamento de tempo da invocacao acaba e sobra fila, a funcao DISPARA A SI
// MESMA (?chain=n) ate drenar, com teto MAX_CHAIN pra nunca virar bola de neve.
const BACKLOG_FLOOR = '2026-07-03T00:00:00.000Z' // inicio do regime; nao reprocessa historico antigo
const ML_FETCH = 40    // candidatos buscados por invocacao (processa o que couber no tempo)
const CHAT_FETCH = 40
const TIME_BUDGET_MS = 95_000 // teto de processamento por invocacao (wall-clock edge ~150s)
const MAX_CHAIN = 8    // teto de auto-reinvocacoes por dia (~9 invocacoes ≈ 120+ itens)

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
// WhatsApp e Instagram sao tipos de atendimento DIFERENTES (quem chama num nao
// chama no outro): aprendizado de chat fica no canal onde aconteceu. Alargar
// para os dois e decisao de curadoria humana (ScopeEditor no painel).
function mapScope(escopo: unknown, originChannel: string): string[] {
  const oc = String(originChannel || '').toLowerCase()
  const chatOrigin = oc === 'whatsapp' || oc === 'instagram'
  switch (String(escopo || '').toLowerCase()) {
    case 'todos': return ['all']
    case 'so_marketplace': return ['mercado_livre']
    case 'so_conversa': return chatOrigin ? [oc] : ['whatsapp', 'instagram']
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
    const chain = Math.max(0, Number(url.searchParams.get('chain')) || 0)
    const sum = { evaluated: 0, good: 0, bad: 0, auto_applied: 0, queued: 0, deduped: 0, rejected: 0, leftover: 0, chain, chained: false, errors: [] as string[] }

    async function runJudge(rubrica: string, userMsg: string) {
      const resp = await callAnthropic({ model: cfg.model, systemPrompt: rubrica, messages: [{ role: 'user', content: userMsg }], maxTokens: 600, temperature: 0 })
      return parseJudge(extractText(resp))
    }

    // ══ MODO BACKFILL — revalida a BASE EXISTENTE de correcoes contra a cartilha ══
    // GET ?mode=backfill&dry=1        -> so lista violadores (nenhuma escrita)
    // GET ?mode=backfill&batch=8     -> reescreve ate N violadores nesta invocacao
    // Politica: reescrita preserva a informacao; origem chat com violacao so de
    // formato tende a virar escopo so_conversa (texto mantido). Toda reescrita
    // passa pelo MESMO gate; falhou 2x -> se estava ativa (processed), sai de uso
    // (volta pra auto_review). Antes/depois vai no retorno pra auditoria.
    if (url.searchParams.get('mode') === 'backfill') {
      const dry = url.searchParams.get('dry') === '1'
      const batch = Math.min(Number(url.searchParams.get('batch')) || 8, 15)
      // Anti-starvation: ids que ja falharam 2x em invocacoes anteriores chegam
      // via ?skip=id1,id2 e sao pulados — senao insanaveis no topo da fila
      // consumiriam o batch pra sempre e o driver nunca chegaria a remaining=0.
      const skip = new Set((url.searchParams.get('skip') || '').split(',').map((s) => s.trim()).filter(Boolean))
      const bf = {
        scanned: 0, clean: 0, fixed: 0, rescoped: 0, demoted: 0, remaining: 0, skipped: 0,
        giveup_ids: [] as string[],
        changes: [] as any[], dry_violators: [] as any[], errors: [] as string[],
      }
      const { data: rows } = await supabase.from('response_corrections')
        .select('id, original_question, recommended_response, status, origin_channel, scope, corrected_by')
        .in('status', ['processed', 'auto_review', 'pending'])
        .order('created_at', { ascending: true })

      const BACKFILL_SYS = `Voce revisa a BASE DE APRENDIZADOS do atendimento da Ana (Budamix). Cada aprendizado e um par pergunta->resposta usado como MODELO em respostas futuras. Tarefa: deixar a resposta em conformidade com as regras PRESERVANDO a informacao e a intencao. Remova nomes proprios de clientes (o aprendizado e um modelo generico).

${REGRAS_CORRECAO_ML}

${REGRAS_CORRECAO_CHAT}
${CATALOGO}

ESCOLHA DO ESCOPO:
- Pergunta que veio de CHAT (WhatsApp/Instagram) cuja resposta e adequada so pra chat (emoji, tom pessoal, comprimento) -> escopo "so_conversa" e pode MANTER o texto/emoji se ja obedecer as regras de chat.
- Pergunta que veio de MARKETPLACE -> escopo "so_marketplace" com a resposta na regua de marketplace (sem emoji, max 350 caracteres, sem "estamos a disposicao").
- So use "todos" se o MESMO texto obedecer a regua de marketplace.
REGRA ESPECIAL: se a resposta orienta abrir reclamacao/disputa/devolucao, troque pela orientacao canonica: acolher em UMA frase e orientar acompanhar pela aba de MENSAGENS DO PEDIDO no proprio Mercado Livre ("Minhas Compras" -> o pedido). NUNCA mencione reclamacao/disputa.
Responda SOMENTE JSON valido: {"resposta_correta":"...","escopo":"todos"|"so_marketplace"|"so_conversa"}`

      async function backfillRewrite(r: any, curScope: string[], violations: string[]): Promise<{ rec: string; scope: string[] } | null> {
        const baseMsg = `ORIGEM: ${r.origin_channel || 'desconhecida'}\nESCOPO ATUAL: ${curScope.join(',')}\nPERGUNTA: """${r.original_question}"""\nRESPOSTA ATUAL (viola: ${violations.join('; ')}): """${r.recommended_response}"""`
        let lastViol: string[] = []
        for (let attempt = 0; attempt < 2; attempt++) {
          const userMsg = attempt === 0 ? baseMsg : `${baseMsg}\n\nSUA TENTATIVA ANTERIOR AINDA VIOLAVA: ${lastViol.join('; ')}. Corrija obedecendo TODAS as regras.`
          const resp = await callAnthropic({ model: cfg.model, systemPrompt: BACKFILL_SYS, messages: [{ role: 'user', content: userMsg }], maxTokens: 700, temperature: 0 })
          const j = parseJudge(extractText(resp))
          const rec = (j?.resposta_correta || '').trim()
          if (!rec) continue
          const scope = mapScope(j?.escopo, r.origin_channel || 'mercado_livre')
          const v = correctionViolations(rec, scope)
          if (v.length === 0) return { rec, scope }
          lastViol = v
        }
        return null
      }

      let rewrites = 0
      for (const r of rows ?? []) {
        bf.scanned++
        if (skip.has(String(r.id))) { bf.skipped++; continue }
        const curScope = (r.scope && (r.scope as string[]).length ? (r.scope as string[]) : ['all'])
        const viol = correctionViolations(r.recommended_response || '', curScope)
        if (viol.length === 0) { bf.clean++; continue }
        if (dry) { bf.dry_violators.push({ id: r.id, status: r.status, scope: curScope, violations: viol, texto: String(r.recommended_response || '').slice(0, 120) }); continue }
        if (rewrites >= batch || Date.now() - started > 100_000) { bf.remaining++; continue }
        rewrites++
        try {
          const fixed = await backfillRewrite(r, curScope, viol)
          if (fixed) {
            const recEmb = await generateEmbedding(`${r.original_question}\n${fixed.rec}`)
            const { error } = await supabase.from('response_corrections').update({
              recommended_response: fixed.rec, scope: fixed.scope, embedding: JSON.stringify(recEmb),
            } as any).eq('id', r.id)
            if (error) { bf.errors.push(`${r.id}: ${error.message}`); continue }
            const soEscopo = fixed.rec === String(r.recommended_response || '').trim()
            if (soEscopo) bf.rescoped++; else bf.fixed++
            bf.changes.push({ id: r.id, status: r.status, violava: viol, antes: r.recommended_response, depois: fixed.rec, escopo_antes: curScope, escopo_depois: fixed.scope })
          } else {
            // Nao passou no gate 2x: sai de uso se estava ativa e entra na lista
            // de desistidos (driver repassa via ?skip= nas proximas invocacoes).
            if (r.status === 'processed') {
              const { error } = await supabase.from('response_corrections').update({ status: 'auto_review' } as any).eq('id', r.id)
              if (!error) bf.demoted++
            }
            bf.giveup_ids.push(String(r.id))
            bf.errors.push(`${r.id}: reescrita nao passou no gate 2x (${viol.join('; ')}) — ${r.status === 'processed' ? 'DESATIVADA (auto_review)' : 'mantida na fila'}`)
          }
        } catch (e) { bf.errors.push(`${r.id}: ${String(e)}`) }
      }

      const elapsedBf = Date.now() - started
      if (!dry) {
        await supabase.from('learning_runs').insert({
          channel: 'backfill', window_hours: 0, evaluated: bf.scanned, good: bf.clean,
          bad: bf.fixed + bf.rescoped + bf.demoted, auto_applied: 0, queued: bf.remaining,
          deduped: 0, errors: bf.errors, duration_ms: elapsedBf,
        } as any).then(() => {}, () => {})
      }
      return jsonResponse({ success: true, mode: 'backfill', dry, ...bf, duration_ms: elapsedBf })
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
    // Sem janela: itens sem carimbo (feedback null) desde o FLOOR, mais antigos
    // primeiro. O que nao couber no tempo fica pro proximo elo da cadeia.
    const { data: mlRows } = await supabase.from('marketplace_questions')
      .select('id, platform_item_id, product_name, question_text, answer_text')
      .eq('platform', 'mercado_livre').in('answered_by', ['ai_agent', 'ai']).eq('status', 'answered')
      .is('feedback', null)
      .or(`answered_at.gte.${BACKLOG_FLOOR},external_created_at.gte.${BACKLOG_FLOOR},created_at.gte.${BACKLOG_FLOOR}`)
      .order('created_at', { ascending: true })
      .limit(ML_FETCH)
    for (const q of mlRows ?? []) {
      if (Date.now() - started > TIME_BUDGET_MS) { sum.leftover++; continue }
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
    // EXCECAO UNICA (aprovada Pedro 03/07): mensagens de TEMPLATE automatico da
    // Meta (menu de canais do primeiro contato) sao texto fixo de sistema, nao
    // decisao de atendimento — o juiz NAO avalia. Marcador robusto: sao as
    // unicas mensagens 'agent' com message_type='interactive'. O or() abaixo
    // preserva as normais (message_type NULL) — um .neq puro descartaria NULL.
    const { data: agentMsgs } = await supabase.from('messages')
      .select('id, conversation_id, content, created_at, metadata, conversations!inner(channel)')
      .eq('sender', 'agent').gte('created_at', BACKLOG_FLOOR)
      .filter('metadata->>learning_reviewed', 'is', null)
      .or('message_type.is.null,message_type.neq.interactive')
      .order('created_at', { ascending: true }).limit(CHAT_FETCH)
    for (const m of agentMsgs ?? []) {
      if (Date.now() - started > TIME_BUDGET_MS) { sum.leftover++; continue }
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

    // ── CADEIA: sobrou fila (tempo estourou ou fetch veio cheio)? Dispara a
    // proxima invocacao ANTES de responder. Cada elo e um request independente
    // (se este isolate morrer no teto de wall-clock, o proximo segue sozinho).
    const maybeMore = sum.leftover > 0 ||
      (mlRows?.length ?? 0) === ML_FETCH || (agentMsgs?.length ?? 0) === CHAT_FETCH
    if (maybeMore && chain < MAX_CHAIN) {
      try {
        const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/daily-learning-review?chain=${chain + 1}`
        const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const next = fetch(selfUrl, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key } }).then(() => {}, () => {})
        const er = (globalThis as any).EdgeRuntime
        if (er?.waitUntil) er.waitUntil(next)
        else await new Promise((r) => setTimeout(r, 1500)) // garante o request no ar antes do isolate encerrar
        sum.chained = true
      } catch (e) { sum.errors.push(`chain: ${String(e)}`) }
    } else if (maybeMore && chain >= MAX_CHAIN) {
      sum.errors.push(`chain: teto MAX_CHAIN=${MAX_CHAIN} atingido com fila restante — sobra fica pro cron seguinte (nada expira)`)
    }

    const elapsed = Date.now() - started
    await supabase.from('learning_runs').insert({
      channel: 'multi', window_hours: 0, evaluated: sum.evaluated, good: sum.good, bad: sum.bad,
      auto_applied: sum.auto_applied, queued: sum.queued, deduped: sum.deduped, errors: sum.errors, duration_ms: elapsed,
    } as any).then(() => {}, () => {})

    return jsonResponse({ success: true, ...sum, duration_ms: elapsed })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) }, 500)
  }
})
