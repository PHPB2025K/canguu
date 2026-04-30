// Agent configuration loader with in-memory cache (TTL 5 min)
// Reads from agent_config table and returns typed config object
// NOTE: Ana operates 24/7 — no working hours or away message logic

import { supabase } from './supabase-client.ts'
import type { AgentConfig } from './types.ts'

export interface AgentSettings {
  systemPrompt: string
  agentName: string
  model: string
  temperature: number
  maxTokens: number
  greetingMessage: string
  escalationKeywords: string[]
  maxMessagesBeforeEscalation: number
  messageBufferSeconds: number
  maxChunksPerResponse: number
  maxCharsPerChunk: number
  maxTotalChars: number
}

// In-memory cache (Edge Functions can be reused across invocations)
let cachedSettings: AgentSettings | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function getConfig(): Promise<AgentSettings> {
  const now = Date.now()

  if (cachedSettings && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedSettings
  }

  const { data, error } = await supabase
    .from('agent_config')
    .select('config_key, config_value')

  if (error) {
    throw new Error(`Failed to load agent config: ${error.message}`)
  }

  const configMap = new Map<string, string>()
  for (const row of (data as Pick<AgentConfig, 'config_key' | 'config_value'>[]) ?? []) {
    configMap.set(row.config_key, row.config_value)
  }

  const get = (key: string, fallback = ''): string => configMap.get(key) ?? fallback

  let escalationKeywords: string[]
  try {
    escalationKeywords = JSON.parse(get('escalation_keywords', '[]'))
  } catch {
    escalationKeywords = []
  }

  cachedSettings = {
    systemPrompt: get('system_prompt'),
    agentName: get('agent_name', 'Ana'),
    model: get('model', 'claude-sonnet-4-20250514'),
    temperature: parseFloat(get('temperature', '0.3')),
    maxTokens: parseInt(get('max_tokens', '500'), 10),
    greetingMessage: get('greeting_message'),
    escalationKeywords,
    maxMessagesBeforeEscalation: parseInt(get('max_messages_before_escalation', '10'), 10),
    messageBufferSeconds: parseInt(get('message_buffer_seconds', '8'), 10),
    maxChunksPerResponse: parseInt(get('max_chunks_per_response', '4'), 10),
    maxCharsPerChunk: parseInt(get('max_chars_per_chunk', '200'), 10),
    maxTotalChars: parseInt(get('max_total_chars', '600'), 10),
  }

  cacheTimestamp = now
  return cachedSettings
}

/** Force cache invalidation (e.g., after settings update) */
export function invalidateConfigCache(): void {
  cachedSettings = null
  cacheTimestamp = 0
}
