import type { Message } from "@/types/database";

// Anexos de uma mensagem, no formato que a tela usa. Junta os dois jeitos que os
// webhooks gravam em `metadata`:
//   - chaves por tipo (WhatsApp e 1º anexo do Instagram): image_url, video_url,
//     audio_url, document_url, sticker_url, location, contacts
//   - lista `attachments` (Instagram com vários anexos, compartilhamentos, stories)
// Quando o tipo é de mídia mas o arquivo não ficou guardado (mensagem antiga ou
// download que falhou), o anexo vem com `missing: true` para a tela avisar.

export type AttachmentKind = "image" | "sticker" | "video" | "audio" | "document" | "location" | "contact" | "link";
export type ViewerMode = "image" | "video" | "audio" | "pdf" | "text" | "file" | "location" | "contact" | "link";

export interface LocationInfo {
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  address: string | null;
  url: string | null;
}

export interface ContactInfo {
  name: string;
  org: string | null;
  phones: string[];
  emails: string[];
}

export interface Attachment {
  kind: AttachmentKind;
  url: string | null;
  mime: string | null;
  filename: string | null;
  size: number | null;
  title: string | null;
  link: string | null;
  animated: boolean;
  location: LocationInfo | null;
  contacts: ContactInfo[];
  missing: boolean;
  /** Por que o arquivo não ficou guardado (quando o webhook sabe) */
  reason: "too_big" | "type_not_kept" | null;
}

export type Notice =
  | { kind: "unsupported"; label: string | null; detail: string | null }
  | { kind: "reaction"; emoji: string | null };

type Rec = Record<string, unknown>;

const asRec = (v: unknown): Rec | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function metaOf(message: Pick<Message, "metadata">): Rec {
  return asRec(message.metadata) ?? {};
}

// Tipos do Instagram que são "conteúdo compartilhado" (post, reels, story, card)
const IG_SHARE_LABEL: Record<string, string> = {
  share: "Publicação compartilhada",
  ig_post: "Publicação compartilhada",
  story_mention: "Story que menciona a Budamix",
  story_reply: "Resposta a um story",
  ig_reel: "Reels compartilhado",
  reel: "Reels compartilhado",
  template: "Conteúdo compartilhado",
  fallback: "Link compartilhado",
};

export function shareLabel(type: string | null | undefined): string {
  return (type && IG_SHARE_LABEL[type]) || "Conteúdo compartilhado";
}

function kindFrom(kind: string | null, mime: string | null): AttachmentKind {
  const k = (kind ?? "").toLowerCase();
  if (k === "image" || k === "sticker" || k === "video" || k === "audio" || k === "document" || k === "location" || k === "contact" || k === "link") return k;
  if (k === "file") return "document";
  if (k === "animated_image") return "image";
  if (k in IG_SHARE_LABEL) return "link";
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

function parseLocation(v: unknown): LocationInfo | null {
  const r = asRec(v);
  if (!r) return null;
  return {
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    name: str(r.name),
    address: str(r.address),
    url: str(r.url),
  };
}

function parseContacts(v: unknown): ContactInfo[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => {
      const r = asRec(c);
      if (!r) return null;
      const nameRec = asRec(r.name);
      const name = str(r.name) ?? str(nameRec?.formatted_name) ?? str(nameRec?.first_name) ?? "Contato";
      const phones = (Array.isArray(r.phones) ? r.phones : [])
        .map((p) => (typeof p === "string" ? str(p) : str(asRec(p)?.phone) ?? str(asRec(p)?.wa_id)))
        .filter((p): p is string => !!p);
      const emails = (Array.isArray(r.emails) ? r.emails : [])
        .map((e) => (typeof e === "string" ? str(e) : str(asRec(e)?.email)))
        .filter((e): e is string => !!e);
      const org = str(r.org) ?? str(asRec(r.org)?.company);
      return { name, org, phones, emails };
    })
    .filter((c): c is ContactInfo => !!c);
}

function blank(kind: AttachmentKind): Attachment {
  return { kind, url: null, mime: null, filename: null, size: null, title: null, link: null, animated: false, location: null, contacts: [], missing: false, reason: null };
}

// `upload_error` gravado pelo webhook -> motivo que a equipe entende
function reasonFrom(v: unknown): Attachment["reason"] {
  const t = str(v);
  if (!t) return null;
  if (/25 MB/i.test(t)) return "too_big";
  if (/storage 4\d\d/i.test(t) && /mime|type|tipo/i.test(t)) return "type_not_kept";
  return null;
}

export function getAttachments(message: Pick<Message, "metadata" | "message_type" | "original_audio_url" | "sender">): Attachment[] {
  const meta = metaOf(message);
  const type = message.message_type ?? "";
  const out: Attachment[] = [];
  const seen = new Set<string>();
  const push = (a: Partial<Attachment> & { kind: AttachmentKind }) => {
    const att = { ...blank(a.kind), ...a };
    if (att.url) {
      if (seen.has(att.url)) return;
      seen.add(att.url);
    }
    out.push(att);
  };
  const has = (kind: AttachmentKind) => out.some((a) => a.kind === kind);

  // 1) lista genérica (Instagram)
  if (Array.isArray(meta.attachments)) {
    for (const raw of meta.attachments) {
      const r = asRec(raw);
      if (!r) continue;
      const mime = str(r.mime);
      const kind = kindFrom(str(r.kind) ?? str(r.type), mime);
      const url = str(r.url);
      push({
        kind,
        url,
        mime,
        filename: str(r.filename),
        size: num(r.size),
        title: str(r.title),
        link: str(r.link),
        animated: r.animated === true,
        missing: !url && !(kind === "link" && str(r.link)),
        reason: url ? null : reasonFrom(r.upload_error),
      });
    }
  }

  // 2) chaves por tipo
  const img = str(meta.image_url);
  if (img) push({ kind: "image", url: img, mime: str(meta.image_mimetype) });
  const vid = str(meta.video_url);
  if (vid) push({ kind: "video", url: vid, mime: str(meta.video_mimetype) });
  const aud = str(meta.audio_url) ?? str(message.original_audio_url);
  if (aud) push({ kind: "audio", url: aud, mime: str(meta.audio_mimetype) });
  const doc = str(meta.document_url);
  if (doc) push({ kind: "document", url: doc, mime: str(meta.document_mimetype), filename: str(meta.document_filename), size: num(meta.document_size) });
  const stk = str(meta.sticker_url);
  if (stk) push({ kind: "sticker", url: stk, mime: str(meta.sticker_mimetype), animated: meta.sticker_animated === true });
  const loc = parseLocation(meta.location);
  if (loc) push({ kind: "location", location: loc });
  const contacts = parseContacts(meta.contacts);
  if (contacts.length) push({ kind: "contact", contacts });

  // 3) era mídia, mas o arquivo não ficou guardado
  const fallback: Record<string, AttachmentKind> = {
    image: "image",
    video: "video",
    audio: "audio",
    document: "document",
    file: "document",
    sticker: "sticker",
    location: "location",
    contacts: "contact",
  };
  const fk = fallback[type];
  if (fk && !has(fk)) {
    push({
      kind: fk,
      filename: fk === "document" ? str(meta.document_filename) : null,
      mime: fk === "document" ? str(meta.document_mimetype) : null,
      size: fk === "document" ? num(meta.document_size) : null,
      missing: true,
      reason: reasonFrom(meta.upload_error),
    });
  } else if (type in IG_SHARE_LABEL && !out.length && message.sender === "customer") {
    // (só do cliente: "template" também é o modelo de mensagem que a Ana envia no WhatsApp)
    push({ kind: "link", title: shareLabel(type), missing: true });
  }
  return out;
}

// Motivo que a Meta manda junto do "unsupported" (quando manda), em português
const UNSUPPORTED_LABEL: Record<string, string> = {
  poll: "enquete",
  poll_creation: "enquete",
  poll_update: "voto em enquete",
  view_once: "foto ou vídeo de visualização única",
  view_once_image: "foto de visualização única",
  view_once_video: "vídeo de visualização única",
  edit: "mensagem editada",
  edited: "mensagem editada",
  event: "evento",
  event_creation: "evento",
  channel: "mensagem de canal",
  newsletter: "mensagem de canal",
  live_location: "localização em tempo real",
  ptv: "vídeo redondo (recado em vídeo)",
};

export function getNotice(message: Pick<Message, "metadata" | "message_type" | "content">): Notice | null {
  const type = message.message_type ?? "";
  const meta = metaOf(message);
  if (type === "unsupported") {
    const sub = str(asRec(meta.unsupported)?.type);
    const err = Array.isArray(meta.wa_errors) ? asRec(meta.wa_errors[0]) : null;
    const detail = err ? str(asRec(err.error_data)?.details) ?? str(err.message) ?? str(err.title) : null;
    return { kind: "unsupported", label: sub ? UNSUPPORTED_LABEL[sub.toLowerCase()] ?? sub : null, detail };
  }
  if (type === "reaction") {
    const emoji = str(asRec(meta.reaction)?.emoji) ?? (/^\[reaction:\s*([^\]\s]+)/i.exec(message.content ?? "")?.[1] ?? null);
    return { kind: "reaction", emoji };
  }
  return null;
}

// `content` é o que a Ana lê: legenda do cliente + marcações internas
// ("[Foto enviada pelo cliente] descrição da IA", "[O cliente enviou um DOCUMENTO...]").
// Na tela só vale o que o CLIENTE escreveu.
const AI_DESCRIPTION_RE = /\[(Foto|Imagem|V[ií]deo) enviad[oa] pelo cliente\][\s\S]*$/i;
const SYSTEM_NOTE_RE =
  /\[(?:O cliente|Foto|Imagem|V[ií]deo|[ÁA]udio|Sticker|Figurinha|Documento|Arquivo|Localiza|Contato|document|sticker|file|template|share|story|reel|ig_reel|ig_post|fallback|reaction|unsupported|location|contacts|mensagem sem texto|anexo|attachment|animated_image)[^\]\n]{0,400}\]/gi;

export function customerCaption(message: Pick<Message, "metadata" | "content">): string {
  const explicit = str(metaOf(message).caption);
  if (explicit) return explicit;
  return (message.content ?? "").replace(AI_DESCRIPTION_RE, "").replace(SYSTEM_NOTE_RE, "").trim();
}

export function extensionOf(name: string | null | undefined): string {
  const clean = (name ?? "").split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

const TEXT_EXT = new Set(["txt", "csv", "xml", "json", "log", "md", "ofx"]);
const BROWSER_IMAGE = /^image\/(jpe?g|png|webp|gif|bmp|avif)$/;

export function viewerMode(a: Attachment): ViewerMode {
  if (a.kind === "location") return "location";
  if (a.kind === "contact") return "contact";
  if (a.kind === "image" || a.kind === "sticker") return "image";
  if (a.kind === "video") return "video";
  if (a.kind === "audio") return "audio";
  const mime = (a.mime ?? "").split(";")[0].trim().toLowerCase();
  if (a.kind === "link") {
    if (!a.url) return "link";
    return mime.startsWith("video/") ? "video" : "image";
  }
  const ext = extensionOf(a.filename ?? a.url);
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (BROWSER_IMAGE.test(mime) || (!mime && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext))) return "image";
  if (mime.startsWith("video/") || (!mime && ["mp4", "mov", "webm"].includes(ext))) return "video";
  if (mime.startsWith("audio/") || (!mime && ["mp3", "ogg", "m4a", "aac", "wav", "opus"].includes(ext))) return "audio";
  // (o MIME do Word/Excel novo também tem "xml" no nome: por isso a regra é exata)
  if (mime.startsWith("text/") || /^application\/((.+\+)?(json|xml)|csv)$/.test(mime) || (!mime && TEXT_EXT.has(ext)) || (mime === "application/octet-stream" && TEXT_EXT.has(ext))) return "text";
  return "file";
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  csv: "Planilha CSV",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
  txt: "Texto",
  xml: "XML",
  json: "JSON",
  zip: "ZIP",
  rar: "RAR",
  "7z": "7-Zip",
  heic: "Foto HEIC",
  ofx: "Extrato OFX",
};

export function fileTypeLabel(a: Attachment): string {
  const ext = extensionOf(a.filename ?? a.url);
  if (TYPE_LABEL[ext]) return TYPE_LABEL[ext];
  const mime = (a.mime ?? "").split(";")[0].trim().toLowerCase();
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Imagem";
  if (mime.startsWith("video/")) return "Vídeo";
  if (mime.startsWith("audio/")) return "Áudio";
  if (mime.startsWith("text/")) return "Texto";
  return ext ? ext.toUpperCase() : "Arquivo";
}

export function displayFilename(a: Attachment): string {
  if (a.filename) return a.filename;
  if (a.kind === "document") return a.url ? `documento.${extensionOf(a.url) || "pdf"}` : "Documento";
  return a.title ?? "Arquivo";
}

// Link que força o download com o nome original (Supabase Storage: ?download=nome)
export function downloadHref(url: string, filename?: string | null): string {
  if (!/\/storage\/v1\/object\/public\//.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}download=${encodeURIComponent(filename ?? "")}`;
}

export function mapsHref(loc: LocationInfo): string | null {
  if (loc.latitude == null || loc.longitude == null) return loc.url;
  return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
}
