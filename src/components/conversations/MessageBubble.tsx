import { useState } from "react";
import { User, Bot, UserCheck, Mic, Image, FileText, Video, Play } from "lucide-react";
import { format } from "date-fns";
import type { Message } from "@/types/database";
import { cn } from "@/lib/utils";
import { MediaLightbox } from "./MediaLightbox";

interface MessageBubbleProps {
  message: Message;
}

const senderConfig: Record<string, { label: string; icon: typeof User; bubbleClass: string; labelClass: string; timeClass: string }> = {
  customer: {
    label: "Cliente",
    icon: User,
    bubbleClass: "bg-muted border border-border rounded-2xl rounded-bl-md",
    labelClass: "text-muted-foreground",
    timeClass: "text-muted-foreground/50",
  },
  agent: {
    label: "Agente IA",
    icon: Bot,
    bubbleClass: "bg-porcelain border border-porcelain rounded-2xl rounded-br-md",
    labelClass: "text-primary",
    timeClass: "text-muted-foreground/50",
  },
  human_agent: {
    label: "Atendente",
    icon: UserCheck,
    bubbleClass: "bg-primary/15 border border-primary/20 rounded-2xl rounded-br-md",
    labelClass: "text-primary",
    timeClass: "text-muted-foreground/50",
  },
};

// Strip the leading '[Imagem recebida]' / '[Vídeo recebido]' marker so the
// caption from the customer (if any) shows below the media without the prefix.
const MEDIA_PLACEHOLDER_RE = /^\[(Imagem recebida|V[ií]deo recebido|Sticker recebido|Documento recebido|\u00c1udio recebido[^\]]*)\]\s*/i;

function extractCaption(content: string): string {
  return content.replace(MEDIA_PLACEHOLDER_RE, "").trim();
}

function getMediaUrls(metadata: Message["metadata"]): { imageUrl: string | null; videoUrl: string | null; audioUrl: string | null } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { imageUrl: null, videoUrl: null, audioUrl: null };
  }
  const meta = metadata as Record<string, unknown>;
  const imageUrl = typeof meta.image_url === "string" ? meta.image_url : null;
  const videoUrl = typeof meta.video_url === "string" ? meta.video_url : null;
  const audioUrl = typeof meta.audio_url === "string" ? meta.audio_url : null;
  return { imageUrl, videoUrl, audioUrl };
}

function getNonRenderableTypeLabel(type: string | null) {
  if (type === "document") return { icon: FileText, text: "Documento enviado" };
  return null;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const config = senderConfig[message.sender] ?? senderConfig.customer;
  const isCustomer = message.sender === "customer";
  const Icon = config.icon;
  const { imageUrl, videoUrl, audioUrl } = getMediaUrls(message.metadata);
  const time = message.created_at ? format(new Date(message.created_at), "HH:mm") : "";

  // Inline media renderable in the admin
  const isImage = message.message_type === "image";
  const isVideo = message.message_type === "video";
  const isAudio = message.message_type === "audio";
  const caption = isImage || isVideo ? extractCaption(message.content) : "";

  // Lightbox open state — single bubble can host either an image or a video.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const openMedia = () => setLightboxOpen(true);

  // Document still uses the legacy text label (no inline player)
  const fallbackLabel = !isImage && !isVideo && !isAudio ? getNonRenderableTypeLabel(message.message_type) : null;

  // Split agent messages by \\ marker into chunks
  const isAgent = message.sender === "agent";
  const chunks = isAgent && !fallbackLabel && !isImage && !isVideo && !isAudio && message.content.includes("\\\\")
    ? message.content.split("\\\\").map((c) => c.trim()).filter(Boolean)
    : null;

  if (chunks && chunks.length > 1) {
    return (
      <div className="flex flex-col items-end gap-1">
        {chunks.map((chunk, i) => {
          const isFirst = i === 0;
          const isLast = i === chunks.length - 1;
          return (
            <div key={i} className="flex justify-end w-full">
              <div className={cn("max-w-[75%] p-3", config.bubbleClass)}>
                {isFirst && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={cn("h-3.5 w-3.5", config.labelClass)} />
                    <span className={cn("text-xs font-medium", config.labelClass)}>{config.label}</span>
                  </div>
                )}
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{chunk}</p>
                {isLast && (
                  <div className={cn("text-xs mt-1 text-right", config.timeClass)}>
                    {time}
                    {message.tokens_used && (
                      <span className="ml-2">{message.tokens_used} tokens</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const lightbox = (isImage && imageUrl) || (isVideo && videoUrl) ? (
    <MediaLightbox
      open={lightboxOpen}
      onOpenChange={setLightboxOpen}
      kind={isImage ? "image" : "video"}
      url={isImage ? imageUrl : videoUrl}
      caption={caption || null}
      senderLabel={config.label}
    />
  ) : null;

  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      {lightbox}
      <div className={cn("max-w-[75%] p-3", config.bubbleClass)}>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={cn("h-3.5 w-3.5", config.labelClass)} />
          <span className={cn("text-xs font-medium", config.labelClass)}>{config.label}</span>
        </div>

        {isImage && imageUrl ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openMedia}
              className="block w-full overflow-hidden rounded-lg ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Abrir imagem em tamanho grande"
            >
              <img
                src={imageUrl}
                alt={caption || "Imagem enviada pelo cliente"}
                loading="lazy"
                className="max-h-72 w-full cursor-zoom-in object-cover transition hover:opacity-90"
              />
            </button>
            {caption && (
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{caption}</p>
            )}
          </div>
        ) : isImage ? (
          <div className="flex items-center gap-2 text-sm text-foreground italic">
            <Image className="h-4 w-4" />
            Imagem enviada (indisponível)
          </div>
        ) : isVideo && videoUrl ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={openMedia}
              className="group relative block w-full overflow-hidden rounded-lg bg-black ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label="Abrir vídeo em tamanho grande"
            >
              <video
                src={videoUrl}
                preload="metadata"
                muted
                playsInline
                className="max-h-80 w-full"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/30">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105">
                  <Play className="h-6 w-6 fill-foreground text-foreground" />
                </div>
              </div>
            </button>
            {caption && (
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{caption}</p>
            )}
          </div>
        ) : isVideo ? (
          <div className="flex items-center gap-2 text-sm text-foreground italic">
            <Video className="h-4 w-4" />
            Vídeo enviado (indisponível)
          </div>
        ) : isAudio && audioUrl ? (
          <div className="space-y-1.5">
            <audio
              src={audioUrl}
              controls
              preload="metadata"
              className="block w-full max-w-[280px]"
            />
            {/* Transcrição abaixo do player — Yasmin tanto ouve quanto lê */}
            {message.content && (
              <p className="text-xs text-muted-foreground italic">
                <Mic className="mr-1 inline-block h-3 w-3" />
                {message.content}
              </p>
            )}
          </div>
        ) : isAudio ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-foreground italic">
              <Mic className="h-4 w-4" />
              Mensagem de áudio
            </div>
            {message.content && (
              <p className="text-xs text-muted-foreground italic whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}
          </div>
        ) : fallbackLabel ? (
          <div className="flex items-center gap-2 text-sm text-foreground italic">
            <fallbackLabel.icon className="h-4 w-4" />
            {fallbackLabel.text}
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{message.content}</p>
        )}

        <div className={cn("text-xs mt-1 text-right", config.timeClass)}>
          {time}
          {message.tokens_used && message.sender === "agent" && (
            <span className="ml-2">{message.tokens_used} tokens</span>
          )}
        </div>
      </div>
    </div>
  );
}
