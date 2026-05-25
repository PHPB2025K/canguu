// Intent Classifier — Uses Claude Haiku for fast, cheap classification
// Returns structured JSON with intention, sentiment, escalation info

import { callAnthropic, extractText, getTokensUsed } from './anthropic.ts'
import type { ClassificationResult, ClassifierIntention, ClassifierSentiment } from './types.ts'

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001'
const CLASSIFIER_MAX_TOKENS = 300

const CLASSIFIER_SYSTEM_PROMPT = `Você é um classificador de intenção de atendimento ao cliente da Budamix, marca brasileira de utilidades domésticas.

Analise a mensagem do cliente e o contexto da conversa. Retorne SOMENTE um objeto JSON com estes campos:

{
  "intention": "pre_sale|post_sale|complaint|faq|greeting|farewell|product_inquiry|order_status|human_request|other",
  "subcategory": "descrição breve do tópico específico EM PORTUGUÊS BRASILEIRO",
  "needs_product_lookup": true/false,
  "needs_order_lookup": true/false,
  "sentiment": "positive|negative|neutral",
  "should_escalate": true/false,
  "escalation_reason": "motivo em PORTUGUÊS BRASILEIRO, ou null se should_escalate=false",
  "confidence": 0.0 a 1.0
}

═══════════════════════════════════════════════════════════════
REGRA CRÍTICA DE IDIOMA (inviolável)
═══════════════════════════════════════════════════════════════
Os campos "subcategory" e "escalation_reason" DEVEM SEMPRE estar em
português brasileiro. Nunca em inglês, nem mesmo parcialmente.
Esses textos vão direto pro painel de operadores humanos da Budamix
em PT-BR; texto em inglês confunde e quebra a UX.

Os valores enum de "intention" e "sentiment" PERMANECEM em inglês
(são chaves de código usadas no branching downstream — não traduzir).

✅ CORRETO:
  "escalation_reason": "Cliente recebeu produto quebrado e tem dificuldade técnica pra enviar fotos pelo chat. Necessário atendimento humano."
  "subcategory": "reclamação de produto quebrado"

❌ ERRADO (NUNCA gerar assim):
  "escalation_reason": "Customer has a legitimate complaint about a broken product..."
  "subcategory": "broken product complaint"

═══════════════════════════════════════════════════════════════
Regras de classificação (intention)
═══════════════════════════════════════════════════════════════
- "greeting": cliente está só cumprimentando
- "farewell": cliente está se despedindo ou agradecendo
- "pre_sale": perguntas antes de comprar (preço, disponibilidade, características)
- "product_inquiry": pergunta sobre detalhes de um produto específico
- "post_sale": perguntas após a compra (rastreamento, entrega, uso)
- "order_status": pergunta especificamente sobre status do pedido/entrega
- "complaint": cliente expressando insatisfação, reportando problemas
- "faq": pergunta geral sobre políticas, pagamento, envio
- "human_request": cliente pedindo explicitamente pra falar com pessoa/humano
- "other": não se encaixa em nenhuma categoria

═══════════════════════════════════════════════════════════════
Gatilhos de escalonamento (should_escalate = true)
═══════════════════════════════════════════════════════════════
- Cliente menciona ação legal, "Procon", "advogado", "processo", "jurídico"
- Cliente pede explicitamente atendente humano
- Cliente está muito irritado ou usa linguagem ofensiva
- Problema envolve risco de segurança ou dano físico
- Cliente tem reclamação grave com produto quebrado/defeituoso E já forneceu (ou tentou fornecer) os dados necessários
- Cliente reporta dificuldade técnica de envio (mídia não carrega, mensagens duplicadas) APÓS reclamação iniciada

Retorne SOMENTE JSON válido, sem explicação, sem markdown.`

/**
 * Classify a customer message using Claude Haiku.
 * Returns the classification result and tokens used.
 */
export async function classifyIntent(
  messageContent: string,
  conversationHistory: Array<{ role: string; content: string }>,
  customerName: string | null,
): Promise<{ classification: ClassificationResult; tokensUsed: number }> {
  // Build conversation summary for classifier (last 5 messages for brevity)
  const recentHistory = conversationHistory.slice(-5)
  const historyText = recentHistory.length > 0
    ? recentHistory
        .map(m => `[${m.role === 'customer' ? 'CLIENTE' : 'BUDA'}]: ${m.content}`)
        .join('\n')
    : '(nova conversa)'

  const userMessage = `Cliente: ${customerName ?? 'Desconhecido'}

Histórico recente:
${historyText}

Mensagem atual do cliente:
${messageContent}`

  const response = await callAnthropic({
    model: CLASSIFIER_MODEL,
    systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: CLASSIFIER_MAX_TOKENS,
    temperature: 0.1,
  })

  const tokensUsed = getTokensUsed(response)
  const text = extractText(response)
  const classification = parseClassification(text)

  return { classification, tokensUsed }
}

/**
 * Parse the classifier JSON response.
 * Handles cases where the model adds markdown code blocks or extra text.
 */
function parseClassification(text: string): ClassificationResult {
  // Try direct parse first
  try {
    return validateClassification(JSON.parse(text))
  } catch {
    // Try extracting JSON from text
  }

  // Try to extract JSON from ```json ... ``` or { ... }
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return validateClassification(JSON.parse(jsonMatch[0]))
    } catch {
      // Fall through to default
    }
  }

  // Fallback: return safe defaults
  return {
    intention: 'other',
    subcategory: 'unclassified',
    needs_product_lookup: false,
    needs_order_lookup: false,
    sentiment: 'neutral',
    should_escalate: false,
    escalation_reason: null,
    confidence: 0,
  }
}

const VALID_INTENTIONS: ClassifierIntention[] = [
  'pre_sale', 'post_sale', 'complaint', 'faq', 'greeting', 'farewell',
  'product_inquiry', 'order_status', 'human_request', 'other',
]

const VALID_SENTIMENTS: ClassifierSentiment[] = ['positive', 'negative', 'neutral']

function validateClassification(raw: Record<string, unknown>): ClassificationResult {
  return {
    intention: VALID_INTENTIONS.includes(raw.intention as ClassifierIntention)
      ? (raw.intention as ClassifierIntention)
      : 'other',
    subcategory: typeof raw.subcategory === 'string' ? raw.subcategory : '',
    needs_product_lookup: Boolean(raw.needs_product_lookup),
    needs_order_lookup: Boolean(raw.needs_order_lookup),
    sentiment: VALID_SENTIMENTS.includes(raw.sentiment as ClassifierSentiment)
      ? (raw.sentiment as ClassifierSentiment)
      : 'neutral',
    should_escalate: Boolean(raw.should_escalate),
    escalation_reason: typeof raw.escalation_reason === 'string' ? raw.escalation_reason : null,
    confidence: typeof raw.confidence === 'number'
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.5,
  }
}
