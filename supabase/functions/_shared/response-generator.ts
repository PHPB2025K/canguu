// Response Generator — Uses Claude Sonnet to generate customer-facing responses
// Takes the full context bundle and classification to produce a natural response

import { callAnthropic, extractText, getTokensUsed } from './anthropic.ts'
import type { ContextBundle, ClassificationResult } from './types.ts'

/**
 * Generate an AI response using the full context bundle.
 * Uses the model configured in agent_config (default: claude-sonnet-4-20250514).
 */
export async function generateResponse(
  context: ContextBundle,
  classification: ClassificationResult,
  model: string,
  maxTokens: number,
  temperature: number,
): Promise<{ text: string; tokensUsed: number }> {
  const userMessage = buildUserMessage(context, classification)

  const response = await callAnthropic({
    model,
    systemPrompt: context.systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens,
    temperature,
  })

  return {
    text: extractText(response),
    tokensUsed: getTokensUsed(response),
  }
}

/**
 * Extract the first name from a full name string.
 */
function getFirstName(fullName: string | null): string | null {
  if (!fullName) return null
  return fullName.trim().split(/\s+/)[0] || null
}

/**
 * Check if a name appears in the last N agent messages.
 */
function checkNameUsageInHistory(
  history: ContextBundle['conversationHistory'],
  firstName: string | null,
): { usedInLast: boolean; usedIn2ndLast: boolean } {
  if (!firstName) return { usedInLast: false, usedIn2ndLast: false }

  const agentMessages = history.filter(m => m.role === 'agent')
  const lastTwo = agentMessages.slice(-2)
  const nameRegex = new RegExp(firstName, 'i')

  return {
    usedInLast: lastTwo.length >= 1 && nameRegex.test(lastTwo[lastTwo.length - 1].content),
    usedIn2ndLast: lastTwo.length >= 2 && nameRegex.test(lastTwo[lastTwo.length - 2].content),
  }
}

/**
 * Build the structured user message with all context sections.
 * This is the "mega prompt" that gives Claude everything it needs.
 */
function buildUserMessage(
  context: ContextBundle,
  classification: ClassificationResult,
): string {
  const sections: string[] = []

  const firstName = getFirstName(context.customer.name)
  const nameUsage = checkNameUsageInHistory(context.conversationHistory, firstName)

  // ─── Name usage guidance ──────────────────────────────────────
  const shouldUseName = firstName && !nameUsage.usedInLast && !nameUsage.usedIn2ndLast
  sections.push(`## Uso do Nome nesta Resposta
- Nome do cliente: ${firstName ?? 'Não informado'}
- Usado na msg anterior da Ana: ${nameUsage.usedInLast ? 'sim' : 'não'}
- Usado há 2 msgs da Ana: ${nameUsage.usedIn2ndLast ? 'sim' : 'não'}
- Recomendação: ${shouldUseName ? 'usar o nome nesta resposta' : 'NÃO usar o nome nesta resposta'}`)

  // ─── Customer info ──────────────────────────────────────────
  const customerLines = [
    `- Nome: ${context.customer.name ?? 'Não informado'}`,
    `- Telefone: ${context.customer.phone}`,
    `- Origem: ${context.customer.source ?? 'whatsapp'}`,
    `- Total de conversas: ${context.customer.totalConversations}`,
  ]
  if (context.customer.tags?.length) {
    customerLines.push(`- Tags: ${context.customer.tags.join(', ')}`)
  }
  if (context.customer.notes) {
    customerLines.push(`- Notas: ${context.customer.notes}`)
  }
  sections.push(`## Cliente\n${customerLines.join('\n')}`)

  // ─── Classification ─────────────────────────────────────────
  sections.push(`## Classificação da Mensagem
- Intenção: ${classification.intention}
- Subcategoria: ${classification.subcategory}
- Sentimento: ${classification.sentiment}
- Confiança: ${(classification.confidence * 100).toFixed(0)}%`)

  // ─── Conversation history ───────────────────────────────────
  if (context.conversationHistory.length > 0) {
    const historyLines = context.conversationHistory.map(m => {
      const label = m.role === 'customer' ? '[CLIENTE]' : '[ANA]'
      return `${label}: ${m.content}`
    })
    sections.push(`## Histórico da Conversa\n${historyLines.join('\n')}`)
  }

  // ─── Operator-verified corrections (highest priority reference) ─
  if (context.relevantCorrections && context.relevantCorrections.length > 0) {
    const lines = context.relevantCorrections.map(c =>
      `- Pergunta similar: "${c.originalQuestion}"\n  Resposta correta: "${c.recommendedResponse}"`
    )
    sections.push(`## CORREÇÕES APRENDIDAS (use como referência prioritária)\n${lines.join('\n')}\n\nSe a pergunta do cliente for semanticamente similar a alguma acima, baseie sua resposta na Resposta correta — ela foi validada pelo operador.`)
  }

  // ─── Products ───────────────────────────────────────────────
  // NEW: Use enriched product context from base_products pipeline when available
  if (context.enrichedProductContext) {
    sections.push(`## Produtos Relevantes (referência — usar SOMENTE se o cliente perguntou)\n${context.enrichedProductContext}`)
  } else if (context.relevantProducts.length > 0) {
    if (context.productSource === 'catalog') {
      // Catalog fallback: simple list of all active products
      const catalogLines = context.relevantProducts.map(p => {
        const price = p.priceSite ? `R$ ${p.priceSite.toFixed(2)}` : 'consultar'
        const stock = p.stockQuantity > 0 ? '' : ' (INDISPONÍVEL)'
        return `• ${p.name} — ${price}${stock}`
      })
      sections.push(`## Catálogo Budamix (referência — NÃO apresente espontaneamente)\n${catalogLines.join('\n')}\n\nSe o cliente perguntar sobre produtos, use SOMENTE os listados acima como referência. NUNCA apresente produtos espontaneamente — mencione-os APENAS em resposta direta a uma pergunta do cliente sobre produto, preço, disponibilidade ou catálogo.`)
    } else {
      // Semantic search: detailed product blocks
      const productBlocks = context.relevantProducts.map(p => {
        const lines = [`- *${p.name}* (SKU: ${p.sku})`]
        if (p.priceSite) lines.push(`  Preço site: R$ ${p.priceSite.toFixed(2)}`)
        if (p.priceMarketplace) {
          const prices = Object.entries(p.priceMarketplace)
            .map(([k, v]) => `${k}: R$ ${(v as number).toFixed(2)}`)
            .join(', ')
          lines.push(`  Preço marketplaces: ${prices}`)
        }
        lines.push(`  Estoque: ${p.stockStatus} (${p.stockQuantity} un.)`)
        if (p.material) lines.push(`  Material: ${p.material}`)
        if (p.shortDescription) lines.push(`  ${p.shortDescription}`)
        if (p.differentials) lines.push(`  Diferenciais: ${p.differentials}`)
        if (p.usageSuggestions) lines.push(`  Sugestões de uso: ${p.usageSuggestions}`)
        if (p.siteLink) lines.push(`  Link site: ${p.siteLink}`)
        if (p.marketplaceLinks) {
          const links = Object.entries(p.marketplaceLinks)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
          lines.push(`  Links marketplaces: ${links}`)
        }
        return lines.join('\n')
      })
      sections.push(`## Produtos Relevantes (referência — usar SOMENTE se o cliente perguntou)\n${productBlocks.join('\n\n')}`)
    }
  }

  // ─── Policies ───────────────────────────────────────────────
  if (context.relevantPolicies.length > 0) {
    const policyBlocks = context.relevantPolicies.map(p => {
      const header = `- *${p.title}* [${p.category}${p.marketplace ? ` — ${p.marketplace}` : ''}]`
      const summary = p.summary ? `\n  Resumo: ${p.summary}` : ''
      return `${header}${summary}\n  ${p.content}`
    })
    sections.push(`## Políticas Relevantes\n${policyBlocks.join('\n\n')}`)
  }

  // ─── FAQs ───────────────────────────────────────────────────
  if (context.relevantFAQs.length > 0) {
    const faqBlocks = context.relevantFAQs.map(f =>
      `- P: ${f.question}\n  R: ${f.answer}`
    )
    sections.push(`## Perguntas Frequentes\n${faqBlocks.join('\n\n')}`)
  }

  // ─── Platform Listings (links por canal) ───────────────────
  if (context.platformListings && context.platformListings.length > 0) {
    const byProduct = new Map<string, Array<{ platform: string; url: string | null; title: string; type: string }>>()
    for (const l of context.platformListings) {
      const arr = byProduct.get(l.productSku) ?? []
      arr.push({ platform: l.platform, url: l.listingUrl, title: l.listingTitle, type: l.listingType })
      byProduct.set(l.productSku, arr)
    }
    const listingLines: string[] = []
    for (const [sku, listings] of byProduct) {
      const links = listings
        .filter(l => l.url)
        .map(l => `  ${l.platform}${l.type !== 'single' ? ` (${l.type})` : ''}: ${l.url}`)
      if (links.length > 0) {
        listingLines.push(`- ${sku}:\n${links.join('\n')}`)
      }
    }
    if (listingLines.length > 0) {
      sections.push(`## Links dos Produtos por Plataforma\nUse o link correto conforme a origem do cliente. Se o cliente veio pelo WhatsApp, priorize o link do site proprio.\n${listingLines.join('\n')}`)
    }
  }

  // ─── Current message ───────────────────────────────────────
  if (context.pendingMessageCount > 1) {
    sections.push(`## Mensagem Atual do Cliente\n*(O cliente enviou ${context.pendingMessageCount} mensagens em sequência — responda considerando todas)*\n${context.currentMessage}`)
  } else {
    sections.push(`## Mensagem Atual do Cliente\n${context.currentMessage}`)
  }

  // ─── Format rules (reinforcement) ─────────────────────────
  // Anti-hallucination rule based on product context
  const hasProducts = !!context.enrichedProductContext || context.relevantProducts.length > 0
  const productRule = hasProducts
    ? 'REGRA CRÍTICA DE PRODUTOS: Mencione SOMENTE produtos que aparecem na seção "Produtos Relevantes" ou "Catálogo Budamix" acima. NUNCA invente ou mencione produtos que não estão listados. Se o cliente já pediu para ver produtos, MOSTRE os que estão no contexto em vez de continuar fazendo perguntas — no máximo 1 pergunta de qualificação antes de listar opções.'
    : 'REGRA CRÍTICA DE PRODUTOS: Se o cliente perguntar sobre produtos, responda: "Temos várias opções! Pode me contar mais sobre o que procura — tamanho, finalidade ou quantidade?" — NUNCA invente nomes, preços ou links de produtos. NUNCA diga que não encontrou produtos ou que algo não foi carregado.'

  sections.push(`## Regras de Formato (OBRIGATÓRIAS)
- Separe cada ideia com \\\\ (duas barras invertidas). Cada bloco separado por \\\\ será enviado como mensagem individual no WhatsApp.
- Máximo 3-4 blocos. NUNCA inclua \\\\ no início ou final da resposta, apenas ENTRE blocos.
- Cada bloco: máximo 200 caracteres
- Resposta total: máximo 600 caracteres
- NÃO repita confirmações (use apenas uma: "Ótimo!" OU "Perfeito!", nunca ambas)
- ${shouldUseName ? `Use o nome "${firstName}" nesta resposta` : 'NÃO use o nome do cliente nesta resposta'}
- Termine com pergunta ou próximo passo
- ${productRule}

## REGRA INVIOLÁVEL — Comportamento Reativo
Você é uma atendente REATIVA, não uma vendedora. Responda o que o cliente perguntar.
- Se o cliente mandar "oi", "olá", "bom dia" ou qualquer saudação → cumprimente e pergunte como pode ajudar. SEM mencionar produtos, preços ou catálogo.
- Se o cliente responder "sim", "ok", "pode enviar", "ambos", "isso" a uma pergunta SUA sobre produtos → AVANCE: mostre os produtos do contexto, não faça outra pergunta. O cliente já confirmou o interesse.
- Se não há pergunta sobre produto na mensagem do cliente E nenhuma pergunta sua sobre produtos no histórico recente → NÃO mencione nenhum produto.
- ANTI-LOOP: Se você já fez a mesma pergunta (canal, tamanho, etc.) e o cliente já respondeu, NÃO repita. Avance para a próxima etapa (mostrar produtos, enviar link, ou escalar).

## FORMATO DE RESPOSTA OBRIGATÓRIO
Sua resposta será enviada EXATAMENTE como você escrever — direto para o WhatsApp do cliente. Não existe camada intermediária.
Responda APENAS com o texto final da mensagem para o cliente.
NÃO inclua:
- Raciocínio, análise ou reflexões sobre o que responder
- Comentários sobre o contexto, histórico ou falta de informação
- Frases como "vou responder com...", "analisando...", "com base no contexto..."
- Texto entre parênteses ou colchetes com notas internas
- Qualquer texto em inglês
- Prefixos como "Resposta:", "Mensagem:", "Ana:"
Se você pensar antes de responder, mantenha o pensamento FORA da resposta.

Responda à mensagem atual do cliente como ${context.agentName}.`)

  return sections.join('\n\n')
}
