import { useState } from "react";
import {
  User,
  Bot,
  UserCheck,
  Mic,
  Image,
  FileText,
  Video,
  Play,
  MoreVertical,
  Languages,
  MapPin,
  UserRound,
  Link2,
  Maximize2,
  Info,
  Sticker,
} from "lucide-react";
import { format } from "date-fns";
import type { Message } from "@/types/database";
import { cn } from "@/lib/utils";
import { MediaLightbox } from "./MediaLightbox";
import {
  type Attachment,
  type Notice,
  getAttachments,
  getNotice,
  customerCaption,
  viewerMode,
  displayFilename,
  fileTypeLabel,
  formatBytes,
} from "@/lib/attachments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// `content` é o texto que a IA (Ana) lê nos bastidores: pra imagem e vídeo ele
// carrega a descrição automática do Gemini, pra áudio a transcrição do Groq, pra
// documento/figurinha uma instrução interna. Na tela do Canggu quem olha é uma
// PESSOA: ela vê o arquivo com os próprios olhos, então NUNCA mostramos o texto
// da IA por padrão, só a legenda REAL que o cliente digitou (customerCaption).

// Conteúdo de áudio que é só placeholder (sem transcrição de fato):
const AUDIO_PLACEHOLDER_RE = /^\[[ÁA]udio recebido[^\]]*\]$/i;

// Transcrição do áudio para o botão opcional "Transcrever". Prioriza um campo
// explícito em metadata (caso o backend venha a salvar) e cai pro `content`
// (formato atual). Retorna null quando é só placeholder: aí nem oferecemos.
function getAudioTranscription(message: Message): string | null {
  const meta =
    message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
      ? (message.metadata as Record<string, unknown>)
      : null;
  const explicit = meta && typeof meta.transcription === "string" ? meta.transcription : null;
  const text = (explicit ?? message.content ?? "").trim();
  if (!text || AUDIO_PLACEHOLDER_RE.test(text)) return null;
  return text;
}

// Menu de 3 pontinhos do áudio: oferece "Transcrever" (opcional, sob demanda).
function AudioTranscribeMenu({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Opções do áudio"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onToggle}>
          <Languages className="mr-2 h-4 w-4" />
          {open ? "Ocultar transcrição" : "Transcrever"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const cardButton =
  "flex w-full items-center gap-3 rounded-lg border border-border bg-background/70 px-3 py-2.5 text-left transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary";

// Mídia que o cliente mandou mas não ficou guardada (mensagem antiga ou download que falhou)
const MISSING_LABEL: Record<Attachment["kind"], { icon: typeof User; text: string }> = {
  image: { icon: Image, text: "Foto recebida (arquivo não disponível)" },
  sticker: { icon: Sticker, text: "Figurinha recebida (arquivo não disponível)" },
  video: { icon: Video, text: "Vídeo recebido (arquivo não disponível)" },
  audio: { icon: Mic, text: "Mensagem de áudio" },
  document: { icon: FileText, text: "Documento recebido (arquivo não disponível)" },
  location: { icon: MapPin, text: "Localização recebida (sem detalhes)" },
  contact: { icon: UserRound, text: "Contato recebido (sem detalhes)" },
  link: { icon: Link2, text: "Conteúdo compartilhado (não ficou guardado)" },
};

function MissingAttachment({ att }: { att: Attachment }) {
  const { icon: Icon, text } = MISSING_LABEL[att.kind];
  const label = att.kind === "document" && att.filename ? `${att.filename} (arquivo não disponível)` : att.kind === "link" && att.title ? `${att.title} (não ficou guardado)` : text;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-sm italic text-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </div>
      {att.kind !== "audio" && att.kind !== "location" && att.kind !== "contact" && (
        <p className="text-xs text-muted-foreground">
          {att.reason === "too_big"
            ? "Maior que 25 MB, o painel não guarda. Peça para o cliente mandar por e-mail ou em partes."
            : att.reason === "type_not_kept"
              ? "Tipo de arquivo que o painel ainda não guarda. Peça para o cliente reenviar em PDF ou foto."
              : "Se precisar ver, peça para o cliente reenviar."}
        </p>
      )}
    </div>
  );
}

function AttachmentTitle({ att }: { att: Attachment }) {
  if (!att.title) return null;
  return <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{att.title}</p>;
}

// Nome do produto / legenda do reels e link do conteúdo compartilhado (Instagram)
function AttachmentFooter({ att }: { att: Attachment }) {
  if (!att.note && !att.link) return null;
  return (
    <div className="space-y-0.5">
      {att.note && <p className="line-clamp-2 text-xs text-muted-foreground">{att.note}</p>}
      {att.link && (
        <a href={att.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Link2 className="h-3 w-3" />
          Abrir link
        </a>
      )}
    </div>
  );
}

function AttachmentPreview({
  att,
  onOpen,
  transcription,
}: {
  att: Attachment;
  onOpen: () => void;
  transcription: string | null;
}) {
  const [showTranscript, setShowTranscript] = useState(false);

  if (att.missing || (!att.url && att.kind !== "location" && att.kind !== "contact" && !(att.kind === "link" && att.link))) {
    if (att.kind === "audio") {
      // Sem arquivo de áudio: rótulo + transcrição opcional sob demanda
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm italic text-foreground">
              <Mic className="h-4 w-4" />
              Mensagem de áudio
            </div>
            {transcription && <AudioTranscribeMenu open={showTranscript} onToggle={() => setShowTranscript((v) => !v)} />}
          </div>
          {showTranscript && transcription && (
            <p className="whitespace-pre-wrap break-words border-t border-border/50 pt-1.5 text-xs italic text-muted-foreground">{transcription}</p>
          )}
        </div>
      );
    }
    return <MissingAttachment att={att} />;
  }

  const mode = viewerMode(att);

  if (att.kind === "sticker") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block rounded-lg ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Abrir figurinha"
      >
        <img src={att.url ?? ""} alt="Figurinha" loading="lazy" className="h-32 w-32 cursor-zoom-in object-contain transition hover:opacity-90" />
      </button>
    );
  }

  if (mode === "image" && att.kind !== "document") {
    return (
      <div className="space-y-1">
        <AttachmentTitle att={att} />
        <button
          type="button"
          onClick={onOpen}
          className="block w-full overflow-hidden rounded-lg ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Abrir imagem em tamanho grande"
        >
          <img
            src={att.url ?? ""}
            alt="Imagem enviada pelo cliente"
            loading="lazy"
            className="max-h-72 w-full cursor-zoom-in object-cover transition hover:opacity-90"
          />
        </button>
        <AttachmentFooter att={att} />
      </div>
    );
  }

  if (mode === "video" && att.kind !== "document") {
    return (
      <div className="space-y-1">
        <AttachmentTitle att={att} />
        <button
          type="button"
          onClick={onOpen}
          className="group relative block w-full overflow-hidden rounded-lg bg-black ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Abrir vídeo em tamanho grande"
        >
          <video src={att.url ?? ""} preload="metadata" muted playsInline className="max-h-80 w-full" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/30">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105">
              <Play className="h-6 w-6 fill-foreground text-foreground" />
            </div>
          </div>
        </button>
        <AttachmentFooter att={att} />
      </div>
    );
  }

  if (att.kind === "audio") {
    return (
      <div className="space-y-1.5">
        {/* Player na própria bolha (dá play e ouve) + botão que abre a janela flutuante */}
        <div className="flex items-center gap-1">
          {/* largura fixa: com w-full a bolha (que encolhe até o conteúdo) zerava o player */}
          <audio src={att.url ?? ""} controls preload="metadata" className="block h-10 w-[260px] max-w-full" />
          <button
            type="button"
            onClick={onOpen}
            aria-label="Abrir áudio em janela"
            title="Abrir em janela"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          {transcription && <AudioTranscribeMenu open={showTranscript} onToggle={() => setShowTranscript((v) => !v)} />}
        </div>
        {/* Transcrição opcional: só quando a pessoa pede em "Transcrever" */}
        {showTranscript && transcription && (
          <p className="whitespace-pre-wrap break-words border-t border-border/50 pt-1.5 text-xs italic text-muted-foreground">
            <Mic className="mr-1 inline-block h-3 w-3" />
            {transcription}
          </p>
        )}
      </div>
    );
  }

  if (att.kind === "location" && att.location) {
    const loc = att.location;
    const coords = loc.latitude != null && loc.longitude != null ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` : null;
    return (
      <button type="button" onClick={onOpen} className={cardButton} aria-label="Abrir localização no mapa">
        <MapPin className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{loc.name || "Localização"}</span>
          <span className="block truncate text-xs text-muted-foreground">{loc.address || coords || "Ver no mapa"}</span>
        </span>
      </button>
    );
  }

  if (att.kind === "contact" && att.contacts.length) {
    const first = att.contacts[0];
    const extra = att.contacts.length > 1 ? ` + ${att.contacts.length - 1}` : "";
    return (
      <button type="button" onClick={onOpen} className={cardButton} aria-label="Abrir contato">
        <UserRound className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {first.name}
            {extra}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{first.phones[0] || first.emails[0] || "Contato"}</span>
        </span>
      </button>
    );
  }

  if (att.kind === "link") {
    return (
      <button type="button" onClick={onOpen} className={cardButton} aria-label="Abrir conteúdo compartilhado">
        <Link2 className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{att.title || "Link compartilhado"}</span>
          <span className="block truncate text-xs text-muted-foreground">{att.link}</span>
        </span>
      </button>
    );
  }

  // Documento (PDF, planilha, texto, etc.) ou qualquer outro arquivo
  const details = [fileTypeLabel(att), formatBytes(att.size)].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={onOpen} className={cardButton} aria-label={`Abrir ${displayFilename(att)}`}>
      <FileText className="h-8 w-8 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{displayFilename(att)}</span>
        <span className="block truncate text-xs text-muted-foreground">{details}</span>
      </span>
    </button>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  if (notice.kind === "reaction") {
    return (
      <p className="text-sm text-foreground">
        {notice.emoji ? (
          <>
            Reagiu com <span className="text-lg leading-none">{notice.emoji}</span> a uma mensagem
          </>
        ) : (
          "Reagiu a uma mensagem"
        )}
      </p>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">Mensagem que o WhatsApp não repassa ao painel</p>
        <p className="text-xs text-muted-foreground">
          {notice.label
            ? `Tipo: ${notice.label}. `
            : "Costuma ser enquete, foto de visualização única, evento ou mensagem editada. "}
          Se for importante, peça para o cliente reenviar em texto ou foto.
        </p>
      </div>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const config = senderConfig[message.sender] ?? senderConfig.customer;
  const isCustomer = message.sender === "customer";
  const Icon = config.icon;
  const time = message.created_at ? format(new Date(message.created_at), "HH:mm") : "";

  const attachments = getAttachments(message);
  const notice = getNotice(message);
  const hasAttachments = attachments.length > 0;
  const isAudio = attachments.some((a) => a.kind === "audio");
  // Áudio não tem legenda: o `content` dele é a transcrição (escondida por padrão)
  const caption = hasAttachments && !isAudio ? customerCaption(message) : "";
  const audioTranscription = isAudio ? getAudioTranscription(message) : null;

  // Janela flutuante: guarda QUAL anexo está aberto (uma bolha pode ter vários no Instagram).
  // O anexo continua guardado depois de fechar, para a animação de saída rodar inteira.
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const openViewer = (att: Attachment) => {
    setViewing(att);
    setViewerOpen(true);
  };

  // Split agent messages by \\ marker into chunks
  const isAgent = message.sender === "agent";
  const chunks = isAgent && !hasAttachments && !notice && message.content.includes("\\\\")
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

  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      <MediaLightbox
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        attachment={viewing}
        caption={caption || null}
        senderLabel={config.label}
        transcription={audioTranscription}
      />
      <div className={cn("max-w-[75%] p-3", config.bubbleClass)}>
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className={cn("h-3.5 w-3.5", config.labelClass)} />
          <span className={cn("text-xs font-medium", config.labelClass)}>{config.label}</span>
        </div>

        {hasAttachments ? (
          <div className="space-y-2">
            {attachments.map((att, i) => (
              <AttachmentPreview key={(att.url ?? att.kind) + i} att={att} onOpen={() => openViewer(att)} transcription={audioTranscription} />
            ))}
            {caption && <p className="text-sm text-foreground whitespace-pre-wrap break-words">{caption}</p>}
          </div>
        ) : notice ? (
          <NoticeView notice={notice} />
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
