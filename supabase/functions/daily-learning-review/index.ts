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
// JUIZ v26 (01/10/2026, pedido do Pedro: "ensinar o juiz a ler a conversa inteira" e
// "rodar em Opus 5.5 high"):
//   - chat: o juiz recebe a CONVERSA (ate 16 mensagens antes da resposta, com hora e
//     autor), a origem do cliente, a reacao seguinte do cliente e o MANUAL da Ana.
//     Antes via so a ultima mensagem do cliente: 70% das licoes saiam erradas
//     (perguntavam o que o cliente ja tinha dito).
//   - marketplace: recebe a FICHA do produto vinculado ao anuncio.
//   - modelo FIXO claude-opus-5-5, esforco high, sem temperature (Claude 4.7+ recusa);
//     reserva claude-opus-4-6. Em 01/10 as 06h a rodada inteira falhou por temperature.
//   - licao so quando reutilizavel: sem nome, pedido, e-mail ou telefone do cliente, e
//     so quando a mensagem do cliente faz sentido sozinha (nada de "ok", "Caneca", foto).
//   - ?dry=1&limit=N julga sem gravar nada e devolve o que gravaria.
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
- Canecas so em KIT: kit colorido (6 cores sortidas) ou kit de COR UNICA (as 6 na mesma cor) nas linhas Canelada 250ml, Tulipa Lisa 250ml e Reta Lisa 200ml; cores amarela, azul, branca, preta, rosa e verde (vermelho nao existe na porcelana). SEMPRE da para escolher a cor pelo kit de cor unica.
- Canequinhas 100ml com suporte de madeira: ALUMINIO esmaltado (metal), NAO porcelana. NAO vao ao micro-ondas. Lavar a mao; suporte so com pano seco.
- VENDA AVULSA NAO EXISTE: nem tampa, nem caneca, canequinha ou quebra-cabeca avulso. Reprove resposta que mande comprar "avulso".
- Jogos da memoria e quebra-cabecas em MDF: kits de composicao fixa; nao da para escolher os desenhos.
- Medidas: use a FICHA DO PRODUTO quando vier no item; sem ficha, aproximado com ressalva; NUNCA inventar.`

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

const RUBRICA_CHAT = `Voce e auditor do atendimento da "Ana" (Budamix) em CHAT (WhatsApp/Instagram, suporte ao cliente). Avalie a RESPOSTA da Ana dada a ultima mensagem do cliente, no contexto da conversa. Links do site sao permitidos. Emojis devem ser raros: normalmente zero; no maximo 1 somente se o cliente usou emoji e a mensagem for claramente celebrativa. REPROVE uso decorativo em saudacao, confirmacao, explicacao, coleta de dados, reclamacao ou escalonamento. REPROVE (inadequada) se houver qualquer um:
- Frase proibida / burocratica: "nao consta no cadastro", "vamos/vou verificar internamente", "vou conferir e te retorno", "horario de atendimento/comercial", "responderemos assim que possivel".
- Inventar dado de produto, preco ou prazo; ou afirmar estoque/atributo que nao sabe.
- Reclamacao/problema: nao demonstrar empatia primeiro, OU prometer troca/reembolso/prazo/coleta (so a equipe humana promete — a Ana coleta dados e escala). Ferimento/dano: tem que acolher + escalar.
- Cliente pediu humano e a Ana tentou reter em vez de escalar.
- Tom robotico/telemarketing ("prezado", "informo que", "estou a disposicao") ou frio com cliente frustrado.
- Empurrar venda sem o cliente pedir, ou ignorar a pergunta.
- Pedir de novo algo que o cliente JA informou na conversa (canal da compra, numero do pedido, foto) ou responder como se nao tivesse lido o que veio antes.
- Prometer retorno que a Ana nao tem como cumprir ("vou verificar e ja te retorno", "so um momento") ou escrever nota interna para o cliente.

JULGUE NO CONTEXTO: voce recebe a CONVERSA ate a resposta. Uma resposta curta pode estar certa porque o contexto ja estava claro; uma pergunta pode estar errada porque o cliente ja tinha respondido.
POLITICA DE POS-VENDA (decisao do Pedro, nao reprove por segui-la): compra em MARKETPLACE (Mercado Livre, Shopee, Amazon) com produto quebrado/errado/faltando -> a Ana acolhe e orienta o AUTOATENDIMENTO no app da compra; isso e o CERTO. Compra no SITE -> pedir numero do pedido + e-mail da compra, consultar e escalar se precisar. Ferimento -> acolher e escalar.
LICAO REUTILIZAVEL: resposta_correta vira MODELO para outros clientes. Proibido nome, numero de pedido, e-mail, telefone ou detalhe so deste caso. Se a falha so faz sentido neste caso, use "generalizavel": false (sem licao).
${COMUM}

${REGRAS_CORRECAO_CHAT}`

const SCHEMA_HINT = `Responda SOMENTE um JSON valido:
{"veredito":"adequada"|"inadequada","confianca":0.0-1.0,"motivo":"...","resposta_correta":"...","licao":"...","generalizavel":true|false,"escopo":"todos"|"so_marketplace"|"so_conversa"|"so_este_canal","categoria":"<tema curto: entrega|troca|compatibilidade|material|cor|pagamento|tom|outro>"}
generalizavel: true SO se a resposta_correta serve, sem mudar nada, para OUTRO cliente que mande a mesma mensagem.
Se adequada: resposta_correta/licao podem ser "".
escopo: "todos" = vale em qualquer canal (politica, prazo de entrega, fato de produto); "so_marketplace" = so faz sentido em anuncio publico; "so_conversa" = so em chat (WhatsApp/Instagram Direct); "so_este_canal" = especifico do canal avaliado.
ATENCAO: resposta_correta e aprendizado reutilizavel e deve ficar SEM emoji em qualquer escopo. Escopo "todos" exige texto que sirva TAMBEM em marketplace (max 350 caracteres).`

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

// ── Modelo do juiz: FIXO no Opus 5.5 com esforco high (pedido do Pedro, 01/10/2026) ──
const JUIZ_MODELO = 'claude-opus-5-5'
const JUIZ_ESFORCO = 'high'
const JUIZ_RESERVA = 'claude-opus-4-6'
async function chamarJuiz(system: string, userMsg: string): Promise<{ texto: string; modelo: string }> {
  for (const modelo of [JUIZ_MODELO, JUIZ_RESERVA]) {
    const body: Record<string, unknown> = {
      model: modelo,
      max_tokens: 1200,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }],
    }
    if (/claude-(opus-4-[7-9]|opus-[5-9]|sonnet-[5-9]|fable)/i.test(modelo)) {
      body.max_tokens = 12000 // raciocinio + JSON cabem no teto
      body.output_config = { effort: JUIZ_ESFORCO }
    } else {
      body.temperature = 0
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '', 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || (j as any).error) { console.log('juiz err ' + modelo, JSON.stringify((j as any).error || j).slice(0, 240)); continue }
      const bloco = Array.isArray((j as any).content) ? (j as any).content.find((c: any) => c?.type === 'text' && c.text) : null
      if (bloco?.text) return { texto: bloco.text, modelo }
    } catch (e) { console.log('juiz exc ' + modelo, String(e)) }
  }
  return { texto: '', modelo: '' }
}

let MANUAL_CACHE: string | null = null
async function manualDaAna(): Promise<string> {
  if (MANUAL_CACHE !== null) return MANUAL_CACHE
  const { data } = await supabase.from('agent_config').select('config_value').eq('config_key', 'system_prompt').limit(1)
  MANUAL_CACHE = String(data?.[0]?.config_value ?? '')
  return MANUAL_CACHE
}

// Licao e MODELO para outros clientes: nada de dado deste caso.
function dadosDoCaso(t: string, nomeCliente: string | null): string[] {
  const v: string[] = []
  if (/[\w.+-]+@[\w-]+\.\w{2,}/.test(t)) v.push('e-mail de cliente')
  if (/\(?\b\d{2}\)?\s?9\d{4}-?\d{4}\b/.test(t)) v.push('telefone de cliente')
  if (/#?\b[0-9A-F]{8}\b/i.test(t) && /[0-9]/.test(t.match(/#?\b[0-9A-F]{8}\b/i)?.[0] || '') && /[A-F]/i.test(t.match(/#?\b[0-9A-F]{8}\b/i)?.[0] || '')) v.push('numero de pedido do site')
  if (/\b\d{16}\b|\b\d{6}[A-Z0-9]{8}\b|\b\d{3}-\d{7}-\d{7}\b/i.test(t)) v.push('numero de pedido de marketplace')
  const primeiro = String(nomeCliente || '').trim().split(/\s+/)[0] || ''
  if (primeiro.length >= 3 && /^[\p{L}]+$/u.test(primeiro) && new RegExp('\\b' + primeiro + '\\b', 'i').test(t)) v.push('nome do cliente')
  return v
}
// A licao e encontrada pela MENSAGEM DO CLIENTE. Mensagem que so faz sentido no
// contexto ("ok", "Caneca", "[Foto recebida]", clique no menu) traria a licao para
// conversas que nao tem nada a ver.
function perguntaAutoexplicativa(t: string): boolean {
  const limpo = String(t || '')
    .replace(/\[Cliente selecionou canal:[^\]]*\]/gi, ' ')
    .replace(/\[(?:unsupported|reaction|interactive|Foto recebida|Audio recebido|Video recebido)[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ').trim()
  if (limpo.length < 15) return false
  return limpo.split(' ').length >= 3
}
function horaBr(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
async function contextoConversa(convId: string, ateIso: string, msgId: string): Promise<{ texto: string; nome: string | null; origem: string | null; reacao: string | null }> {
  const { data: antes } = await supabase.from('messages')
    .select('id, sender, content, created_at').eq('conversation_id', convId)
    .lte('created_at', ateIso).order('created_at', { ascending: false }).limit(17)
  const linhas = (antes ?? []).filter((x: any) => x.id !== msgId).reverse().slice(-16).map((x: any) => {
    const quem = x.sender === 'customer' ? 'CLIENTE' : x.sender === 'agent' ? 'ANA' : 'EQUIPE'
    return `[${horaBr(x.created_at)}] ${quem}: ${String(x.content || '').replace(/\s+/g, ' ').slice(0, 600)}`
  })
  const { data: depois } = await supabase.from('messages')
    .select('content').eq('conversation_id', convId).eq('sender', 'customer')
    .gt('created_at', ateIso).order('created_at', { ascending: true }).limit(1)
  const { data: conv } = await supabase.from('conversations').select('customer_id').eq('id', convId).limit(1)
  let nome: string | null = null, origem: string | null = null
  if (conv?.[0]?.customer_id) {
    const { data: cu } = await supabase.from('customers').select('name, source').eq('id', conv[0].customer_id).limit(1)
    nome = cu?.[0]?.name ?? null
    origem = cu?.[0]?.source ?? null
  }
  return { texto: linhas.join('\n'), nome, origem, reacao: depois?.[0]?.content ? String(depois[0].content).slice(0, 300) : null }
}
async function fichaProduto(itemId: string | null): Promise<string> {
  if (!itemId) return ''
  let pid: string | null = null
  const { data: l } = await supabase.from('product_listings').select('product_id').eq('platform_item_id', itemId).limit(1)
  pid = l?.[0]?.product_id ?? null
  if (!pid) {
    const { data: m } = await supabase.from('marketplace_product_mapping').select('product_id').eq('external_item_id', itemId).limit(1)
    pid = m?.[0]?.product_id ?? null
  }
  if (!pid) return ''
  const { data: p } = await supabase.from('products').select('name, sku, material, dimensions, short_description, stock_status').eq('id', pid).limit(1)
  const x: any = p?.[0]
  if (!x) return ''
  const dim = typeof x.dimensions === 'object' && x.dimensions ? (x.dimensions.raw ?? JSON.stringify(x.dimensions)) : (x.dimensions ?? '')
  return `FICHA DO PRODUTO VINCULADO (verdade): ${x.name} (SKU ${x.sku}) | material: ${x.material ?? '?'} | medidas: ${dim || '?'} | estoque: ${x.stock_status ?? '?'} | ${String(x.short_description ?? '').replace(/\s+/g, ' ').slice(0, 300)}`
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

    const dry = url.searchParams.get('dry') === '1'
    const detalhes: any[] = []
    let modeloUsado = ''
    async function runJudge(rubrica: string, userMsg: string) {
      const r = await chamarJuiz(rubrica, userMsg)
      if (r.modelo && !modeloUsado) modeloUsado = r.modelo
      if (r.modelo && r.modelo !== JUIZ_MODELO) sum.errors.push(`aviso: juiz no modelo de reserva (${r.modelo})`)
      return r.texto ? parseJudge(r.texto) : null
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
- Pergunta que veio de CHAT (WhatsApp/Instagram) cuja resposta e adequada so pra chat (tom pessoal, comprimento) -> escopo "so_conversa", sempre SEM emoji porque o aprendizado sera reutilizado.
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

    async function record(question: string, aiResp: string | null, sku: string | null, recommended: string, conf: number, originChannel: string, scope: string[], category: string | null, nomeCliente: string | null = null) {
      const dados = dadosDoCaso(recommended, nomeCliente)
      if (dados.length) { sum.rejected++; sum.errors.push(`licao com dado do caso descartada (${dados.join(', ')})`); return }
      if (dry) { detalhes.push({ gravaria: true, pergunta: question.slice(0, 200), resposta_correta: recommended, escopo: scope }); return }
      const qEmb = await generateEmbedding(question)
      const { data: dup } = await supabase.rpc('search_corrections', { query_embedding: JSON.stringify(qEmb), match_threshold: DEDUP_SIM, match_count: 1 })
      if (dup && dup.length > 0) { sum.deduped++; return }
      const willApply = autoApplyEnabled && conf >= autoApply
      const recEmb = await generateEmbedding(`${question}\n${recommended}`)
      const { error } = await supabase.from('response_corrections').insert({
        product_sku: sku, original_question: question, ai_response: aiResp,
        recommended_response: recommended, corrected_by: `daily_learning_ia (${modeloUsado || JUIZ_MODELO} ${JUIZ_ESFORCO})`,
        status: willApply ? 'processed' : 'auto_review', embedding: JSON.stringify(recEmb),
        origin_channel: originChannel, scope, category: category || null,
      } as any)
      if (error) { sum.errors.push(`rec: ${error.message}`); return }
      if (willApply) sum.auto_applied++; else sum.queued++
    }

    // ── 1) MARKETPLACE (perguntas publicas) ──
    // Sem janela: itens sem carimbo (feedback null) desde o FLOOR, mais antigos
    // primeiro. O que nao couber no tempo fica pro proximo elo da cadeia.
    const limiteDry = Math.min(Number(url.searchParams.get('limit')) || 3, 10)
    let mlQuery: any = supabase.from('marketplace_questions')
      .select('id, platform_item_id, product_name, question_text, answer_text')
      .eq('platform', 'mercado_livre').in('answered_by', ['ai_agent', 'ai']).eq('status', 'answered')
      .or(`answered_at.gte.${BACKLOG_FLOOR},external_created_at.gte.${BACKLOG_FLOOR},created_at.gte.${BACKLOG_FLOOR}`)
    mlQuery = dry ? mlQuery.order('created_at', { ascending: false }).limit(limiteDry) : mlQuery.is('feedback', null).order('created_at', { ascending: true }).limit(ML_FETCH)
    const { data: mlRows } = await mlQuery
    for (const q of mlRows ?? []) {
      if (Date.now() - started > TIME_BUDGET_MS) { sum.leftover++; continue }
      try {
        const ficha = await fichaProduto(q.platform_item_id)
        const res = await judgeAndGate(RUBRICA_ML, `ANUNCIO/PRODUTO: ${q.product_name ?? q.platform_item_id}\n${ficha || 'FICHA DO PRODUTO: nenhuma vinculada (julgue pelo titulo e pela verdade do catalogo)'}\nPERGUNTA: """${q.question_text}"""\nRESPOSTA DA ANA: """${q.answer_text}"""\n\n${SCHEMA_HINT}`, 'mercado_livre', String(q.id))
        if (!res) { sum.errors.push(`${q.id}: juiz sem JSON`); continue }
        const { j, rec, scope } = res
        sum.evaluated++
        const bad = String(j.veredito).toLowerCase().startsWith('inadequad')
        if (dry) detalhes.push({ tipo: 'ml', id: q.id, pergunta: String(q.question_text).slice(0, 200), veredito: j.veredito, motivo: j.motivo, generalizavel: j.generalizavel })
        else await supabase.from('marketplace_questions').update({ feedback: bad ? 'bad' : 'good', feedback_at: new Date().toISOString() }).eq('id', q.id)
        if (!bad) { sum.good++; continue }
        sum.bad++
        if (rec && j.generalizavel !== false && perguntaAutoexplicativa(q.question_text)) await record(q.question_text, q.answer_text, q.platform_item_id, rec, Number(j.confianca) || 0, 'mercado_livre', scope, j.categoria)
      } catch (e) { sum.errors.push(`${q.id}: ${String(e)}`) }
    }

    // ── 2) CHAT (WhatsApp/Instagram) — mensagens 'agent' ainda nao revisadas ──
    // EXCECAO UNICA (aprovada Pedro 03/07): mensagens de TEMPLATE automatico da
    // Meta (menu de canais do primeiro contato) sao texto fixo de sistema, nao
    // decisao de atendimento — o juiz NAO avalia. Marcador robusto: sao as
    // unicas mensagens 'agent' com message_type='interactive'. O or() abaixo
    // preserva as normais (message_type NULL) — um .neq puro descartaria NULL.
    let chatQuery: any = supabase.from('messages')
      .select('id, conversation_id, content, created_at, metadata, conversations!inner(channel)')
      .eq('sender', 'agent').gte('created_at', BACKLOG_FLOOR)
      .or('message_type.is.null,message_type.neq.interactive')
    chatQuery = dry ? chatQuery.order('created_at', { ascending: false }).limit(limiteDry) : chatQuery.filter('metadata->>learning_reviewed', 'is', null).order('created_at', { ascending: true }).limit(CHAT_FETCH)
    const { data: agentMsgs } = await chatQuery
    for (const m of agentMsgs ?? []) {
      if (Date.now() - started > TIME_BUDGET_MS) { sum.leftover++; continue }
      try {
        // contexto: ultima mensagem do cliente antes desta resposta (chave da licao)
        const { data: prev } = await supabase.from('messages')
          .select('content').eq('conversation_id', m.conversation_id).eq('sender', 'customer')
          .lt('created_at', m.created_at).order('created_at', { ascending: false }).limit(1)
        const clientMsg = prev?.[0]?.content
        if (!clientMsg) { // sem pergunta de cliente clara -> marca revisado e pula
          if (!dry) await supabase.from('messages').update({ metadata: { ...(m.metadata || {}), learning_reviewed: { verdict: 'skip_no_context', at: new Date().toISOString() } } } as any).eq('id', m.id)
          continue
        }
        const canal = (m as any).conversations?.channel ?? 'whatsapp'
        // A CONVERSA inteira ate a resposta: o juiz antigo via so a ultima mensagem.
        const ctx = await contextoConversa(m.conversation_id, m.created_at, m.id)
        const manual = await manualDaAna()
        const sistemaChat = RUBRICA_CHAT + (manual ? `\n\n=== MANUAL DA ANA (referencia: e o que ela recebe como instrucao; use para julgar se a resposta seguiu as regras e os fatos) ===\n${manual}` : '')
        const res = await judgeAndGate(sistemaChat, `CANAL: ${canal}\nORIGEM DO CLIENTE (primeiro contato): ${ctx.origem || 'desconhecida'}\n\nCONVERSA ATE A RESPOSTA (mais antiga primeiro):\n${ctx.texto}\n\nRESPOSTA DA ANA SOB AVALIACAO: """${m.content}"""\n\nREACAO DO CLIENTE DEPOIS: ${ctx.reacao ? '"""' + ctx.reacao + '"""' : '(nenhuma ainda)'}\n\nA licao (se houver) sera achada pela mensagem do cliente: """${clientMsg}"""\n\n${SCHEMA_HINT}`, canal, `msg ${m.id}`)
        if (!res) { sum.errors.push(`msg ${m.id}: juiz sem JSON`); continue }
        const { j, rec, scope } = res
        sum.evaluated++
        const bad = String(j.veredito).toLowerCase().startsWith('inadequad')
        if (dry) detalhes.push({ tipo: 'chat', id: m.id, canal, cliente: String(clientMsg).slice(0, 160), ana: String(m.content).slice(0, 200), veredito: j.veredito, motivo: j.motivo, generalizavel: j.generalizavel })
        else await supabase.from('messages').update({ metadata: { ...(m.metadata || {}), learning_reviewed: { verdict: bad ? 'bad' : 'good', canal, model: modeloUsado || JUIZ_MODELO, at: new Date().toISOString() } } } as any).eq('id', m.id)
        if (!bad) { sum.good++; continue }
        sum.bad++
        if (rec && j.generalizavel !== false && perguntaAutoexplicativa(clientMsg)) await record(clientMsg, m.content, null, rec, Number(j.confianca) || 0, canal, scope, j.categoria, ctx.nome)
      } catch (e) { sum.errors.push(`msg ${m.id}: ${String(e)}`) }
    }

    // ── CADEIA: sobrou fila (tempo estourou ou fetch veio cheio)? Dispara a
    // proxima invocacao ANTES de responder. Cada elo e um request independente
    // (se este isolate morrer no teto de wall-clock, o proximo segue sozinho).
    if (dry) return jsonResponse({ success: true, dry: true, modelo: modeloUsado || JUIZ_MODELO, esforco: JUIZ_ESFORCO, ...sum, detalhes, duration_ms: Date.now() - started })
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
    if (modeloUsado) sum.errors.push(`info: juiz rodou em ${modeloUsado} (${JUIZ_ESFORCO})`)
    await supabase.from('learning_runs').insert({
      channel: 'multi', window_hours: 0, evaluated: sum.evaluated, good: sum.good, bad: sum.bad,
      auto_applied: sum.auto_applied, queued: sum.queued, deduped: sum.deduped, errors: sum.errors, duration_ms: elapsed,
    } as any).then(() => {}, () => {})

    return jsonResponse({ success: true, ...sum, duration_ms: elapsed })
  } catch (e) {
    return jsonResponse({ success: false, error: String(e) }, 500)
  }
})
