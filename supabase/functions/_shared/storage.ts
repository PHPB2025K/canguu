// =================================================================
// STORAGE — Uploads media coming in from WhatsApp to Supabase Storage
// =================================================================
// Public bucket `chat-attachments`. Files are organized as:
//   {kind}/{conversationId}/{whatsappMessageId}.{ext}
// Returns the public URL so the message metadata can persist it and the
// admin frontend can render it inline (no signed URL needed).
// =================================================================

import { supabase } from './supabase-client.ts'

const BUCKET = 'chat-attachments'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
}

function extensionFor(mimeType: string, fileName?: string | null): string {
  const normalized = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (MIME_TO_EXT[normalized]) return MIME_TO_EXT[normalized]
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()
    if (ext && ext.length <= 5) return ext.toLowerCase()
  }
  // Best-effort default
  if (normalized.startsWith('image/')) return 'jpg'
  if (normalized.startsWith('video/')) return 'mp4'
  return 'bin'
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface UploadResult {
  publicUrl: string
  path: string
  sizeBytes: number
}

/**
 * Upload a base64-encoded media file to Supabase Storage and return its public URL.
 * @param kind  'image' | 'video' | 'audio' | 'document' — first folder segment
 * @param conversationId  used for organization + cleanup if a conversation is purged
 * @param whatsappMessageId  unique key, doubles as filename (avoids collisions)
 */
export async function uploadChatMedia(args: {
  kind: 'image' | 'video' | 'audio' | 'document'
  conversationId: string
  whatsappMessageId: string
  base64: string
  mimeType: string
  fileName?: string | null
}): Promise<UploadResult> {
  const ext = extensionFor(args.mimeType, args.fileName)
  // Sanitize the message id (Evolution sometimes uses chars that are valid in
  // paths but still safer to strip).
  const safeId = args.whatsappMessageId.replace(/[^A-Za-z0-9_-]/g, '_')
  const path = `${args.kind}/${args.conversationId}/${safeId}.${ext}`

  const bytes = base64ToUint8Array(args.base64)
  const contentType = (args.mimeType || '').split(';')[0].trim() || 'application/octet-stream'

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    cacheControl: '3600',
    upsert: true,
  })
  if (error) {
    throw new Error(`Storage upload failed (${path}): ${error.message}`)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return {
    publicUrl: data.publicUrl,
    path,
    sizeBytes: bytes.byteLength,
  }
}
