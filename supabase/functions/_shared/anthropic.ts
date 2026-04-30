// Shared Anthropic API client for Claude calls
// Used by intent-classifier.ts (Haiku) and response-generator.ts (Sonnet)

import type { AnthropicMessageResponse } from './types.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

export interface AnthropicCallOptions {
  model: string
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens: number
  temperature?: number
}

/**
 * Call the Anthropic Messages API.
 * @throws Error if API key is missing or API call fails
 */
export async function callAnthropic(options: AnthropicCallOptions): Promise<AnthropicMessageResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      system: options.systemPrompt,
      messages: options.messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.3,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`)
  }

  return await response.json() as AnthropicMessageResponse
}

/** Extract the text content from an Anthropic response */
export function extractText(response: AnthropicMessageResponse): string {
  const textBlock = response.content.find(c => c.type === 'text')
  return textBlock?.text ?? ''
}

/** Get total tokens used (input + output) from an Anthropic response */
export function getTokensUsed(response: AnthropicMessageResponse): number {
  return (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)
}
