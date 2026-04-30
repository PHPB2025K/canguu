// Intent Classifier — Uses Claude Haiku for fast, cheap classification
// Returns structured JSON with intention, sentiment, escalation info

import { callAnthropic, extractText, getTokensUsed } from './anthropic.ts'
import type { ClassificationResult, ClassifierIntention, ClassifierSentiment } from './types.ts'

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001'
const CLASSIFIER_MAX_TOKENS = 300

const CLASSIFIER_SYSTEM_PROMPT = `You are a customer service intent classifier for Budamix, a Brazilian kitchen/bar utensils brand.

Analyze the customer message and conversation context, then return ONLY a JSON object with these fields:

{
  "intention": "pre_sale|post_sale|complaint|faq|greeting|farewell|product_inquiry|order_status|human_request|other",
  "subcategory": "brief description of specific topic",
  "needs_product_lookup": true/false,
  "needs_order_lookup": true/false,
  "sentiment": "positive|negative|neutral",
  "should_escalate": true/false,
  "escalation_reason": "reason string or null",
  "confidence": 0.0 to 1.0
}

Classification rules:
- "greeting": customer is just saying hi/hello
- "farewell": customer is saying bye/thanks
- "pre_sale": questions before buying (price, availability, features)
- "product_inquiry": asking about specific product details
- "post_sale": questions after purchase (tracking, delivery, usage)
- "order_status": specifically asking about order/delivery status
- "complaint": expressing dissatisfaction, reporting problems
- "faq": general questions about policies, payment, shipping
- "human_request": explicitly asking to talk to a person/human
- "other": doesn't fit any category

Escalation triggers (should_escalate = true):
- Customer mentions legal action, "Procon", "advogado", "processo"
- Customer explicitly requests a human agent
- Customer is extremely angry or uses offensive language
- Issue involves safety concerns or physical harm

Return ONLY valid JSON, no explanation.`

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
