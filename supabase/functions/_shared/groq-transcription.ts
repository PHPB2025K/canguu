// Groq Whisper API — Audio transcription for WhatsApp voice messages
// Uses whisper-large-v3 model with Portuguese language hint

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

/**
 * Transcribe audio from base64 using Groq Whisper API.
 * @param audioBase64 - Raw base64 string (no data URI prefix)
 * @param mimeType - Audio MIME type (e.g., 'audio/ogg; codecs=opus')
 * @returns Transcribed text in Portuguese
 * @throws Error if API key is missing or transcription fails
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  const groqApiKey = Deno.env.get('GROQ_API_KEY')
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY not configured')
  }

  // Convert base64 to Uint8Array → Blob
  const binaryString = atob(audioBase64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // Determine file extension from MIME type
  const ext = mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('mp4') ? 'm4a'
    : mimeType.includes('mpeg') ? 'mp3'
    : mimeType.includes('webm') ? 'webm'
    : 'ogg'

  const blob = new Blob([bytes], { type: mimeType })

  const formData = new FormData()
  formData.append('file', blob, `audio.${ext}`)
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'pt')
  formData.append('response_format', 'json')

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq Whisper API error ${response.status}: ${errorText}`)
  }

  const result = await response.json() as { text: string }

  if (!result.text || result.text.trim().length === 0) {
    throw new Error('Groq Whisper returned empty transcription')
  }

  return result.text.trim()
}
