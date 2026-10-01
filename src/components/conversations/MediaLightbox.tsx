import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Download,
  FileText,
  MapPin,
  UserRound,
  Mic,
  Link2,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Attachment,
  type ContactInfo,
  type LocationInfo,
  viewerMode,
  displayFilename,
  fileTypeLabel,
  formatBytes,
  downloadHref,
  mapsHref,
} from "@/lib/attachments";

export interface MediaLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: Attachment | null;
  caption?: string | null;
  /** Optional sender name for the header (e.g. customer phone or display name) */
  senderLabel?: string | null;
  /** Transcrição do áudio: só aparece se a pessoa pedir */
  transcription?: string | null;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;
const TEXT_PREVIEW_LIMIT = 400_000;

const iconBtn =
  "flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
const pill = "pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/85 px-1.5 py-1 shadow-md backdrop-blur";

/**
 * Floating viewer that opens inside the Canggu admin (no page nav).
 *
 * Foto, figurinha e vídeo: card do tamanho do arquivo (até 90vw × 85vh), com a
 * barra de ações flutuando no canto (zoom, abrir, baixar, fechar).
 * PDF, texto, áudio, localização, contato e outros arquivos: painel com
 * cabeçalho (nome, tipo, tamanho) e o visualizador certo para cada tipo.
 * Clique fora do card ou ESC fecha.
 */
export function MediaLightbox({ open, onOpenChange, attachment, caption, senderLabel, transcription }: MediaLightboxProps) {
  if (!attachment) return null;
  const mode = viewerMode(attachment);
  const url = attachment.url;
  if (mode === "location" && !attachment.location) return null;
  if (mode === "contact" && !attachment.contacts.length) return null;
  if (mode === "link" && !attachment.link) return null;
  if (mode !== "location" && mode !== "contact" && mode !== "link" && !url) return null;

  const chip = [senderLabel, attachment.title].filter(Boolean).join(" · ") || null;
  const name = displayFilename(attachment);
  const meta = [fileTypeLabel(attachment), formatBytes(attachment.size)].filter(Boolean).join(" · ");

  let body: ReactNode;
  if (mode === "image" && url) {
    body = <ImageFrame url={url} filename={attachment.filename} chip={chip} caption={caption} alt={caption || (attachment.kind === "sticker" ? "Figurinha" : "Imagem enviada pelo cliente")} />;
  } else if (mode === "video" && url) {
    body = <VideoFrame url={url} filename={attachment.filename} chip={chip} caption={caption} />;
  } else if (mode === "pdf" && url) {
    body = (
      <Panel icon={FileText} title={name} subtitle={meta} className="h-[88vh] w-[min(94vw,1000px)]" actions={<Actions url={url} filename={attachment.filename} />} caption={caption}>
        <PdfBody url={url} />
      </Panel>
    );
  } else if (mode === "text" && url) {
    body = (
      <Panel icon={FileText} title={name} subtitle={meta} className="w-[min(94vw,900px)]" actions={<Actions url={url} filename={attachment.filename} />} caption={caption}>
        <TextBody url={url} />
      </Panel>
    );
  } else if (mode === "audio" && url) {
    body = (
      <Panel icon={Mic} title={attachment.kind === "audio" ? "Áudio do cliente" : name} subtitle={chip} className="w-[min(94vw,460px)]" actions={<Actions url={url} filename={attachment.filename} />}>
        <AudioBody url={url} transcription={transcription} />
      </Panel>
    );
  } else if (mode === "location" && attachment.location) {
    const maps = mapsHref(attachment.location);
    body = (
      <Panel
        icon={MapPin}
        title={attachment.location.name || "Localização enviada"}
        subtitle={attachment.location.address}
        className="w-[min(94vw,760px)]"
        actions={
          <Actions url={null}>
            {maps && (
              <a href={maps} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Abrir no Google Maps" title="Abrir no Google Maps">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </Actions>
        }
      >
        <LocationBody loc={attachment.location} />
      </Panel>
    );
  } else if (mode === "contact") {
    const n = attachment.contacts.length;
    body = (
      <Panel icon={UserRound} title={n > 1 ? `${n} contatos enviados` : "Contato enviado"} className="w-[min(94vw,460px)]" actions={<Actions url={null} />}>
        <ContactBody contacts={attachment.contacts} />
      </Panel>
    );
  } else if (mode === "link" && attachment.link) {
    body = (
      <Panel icon={Link2} title={attachment.title || "Link compartilhado"} className="w-[min(94vw,460px)]" actions={<Actions url={null} />} caption={caption}>
        <LinkBody link={attachment.link} />
      </Panel>
    );
  } else if (url) {
    body = (
      <Panel icon={FileText} title={name} subtitle={meta} className="w-[min(94vw,460px)]" actions={<Actions url={url} filename={attachment.filename} />} caption={caption}>
        <FileBody url={url} filename={attachment.filename} />
      </Panel>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Ao abrir, o foco vai para a janela (e não para o 1º botão, que era o de zoom:
          // um Enter ou espaço logo depois ampliava a imagem sem querer).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.target as HTMLElement | null)?.focus?.();
          }}
          // Wrapper de tela cheia centraliza o card; clique na área vazia fecha.
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none sm:p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {body}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CloseButton() {
  return (
    <DialogPrimitive.Close
      className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-destructive hover:text-destructive-foreground"
      aria-label="Fechar"
    >
      <X className="h-4 w-4" />
    </DialogPrimitive.Close>
  );
}

function Actions({ url, filename, children }: { url: string | null; filename?: string | null; children?: ReactNode }) {
  const dl = url ? downloadHref(url, filename) : null;
  return (
    <div className={pill}>
      {children}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Abrir em nova aba" title="Abrir em nova aba">
          <Maximize2 className="h-4 w-4" />
        </a>
      )}
      {dl && (
        <a
          href={dl}
          // link do Storage já força o download; outro endereço abre em nova aba
          {...(dl === url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={iconBtn}
          aria-label="Baixar"
          title="Baixar"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
      <CloseButton />
    </div>
  );
}

function Caption({ text, centered = true }: { text: string; centered?: boolean }) {
  return (
    <div className="border-t border-border bg-card px-4 py-3">
      <p className={cn("max-w-3xl whitespace-pre-wrap break-words text-sm text-foreground", centered && "mx-auto")}>{text}</p>
    </div>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
      {text}
    </div>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Abrindo arquivo...
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  subtitle,
  className,
  actions,
  caption,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  className?: string;
  actions: ReactNode;
  caption?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative flex max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl", className)}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="truncate text-sm font-medium text-foreground">{title}</DialogPrimitive.Title>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
      {caption && <Caption text={caption} centered={false} />}
    </div>
  );
}

function ImageFrame({ url, filename, chip, caption, alt }: { url: string; filename: string | null; chip: string | null; caption?: string | null; alt: string }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const zoomIn = useCallback(() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2))), []);
  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Roda do mouse dá zoom. Listener nativo com passive:false para poder segurar a rolagem da página.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
      setScale((s) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, +(s + delta).toFixed(2)));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Atalhos (ESC o Radix já trata): + / - / 0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, resetZoom]);

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div className="relative inline-flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <DialogPrimitive.Title className="sr-only">Visualização de imagem</DialogPrimitive.Title>
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1">
        {!failed && (
          <div className={pill}>
            <button type="button" onClick={zoomOut} disabled={scale <= MIN_SCALE} className={iconBtn} aria-label="Diminuir zoom">
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={zoomIn} disabled={scale >= MAX_SCALE} className={iconBtn} aria-label="Aumentar zoom">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={resetZoom} disabled={scale === 1} className={iconBtn} aria-label="Restaurar tamanho">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
        <Actions url={url} filename={filename} />
      </div>
      {chip && <Chip text={chip} />}
      <div
        ref={surfaceRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40"
        onMouseDown={(e) => {
          if (scale === 1) return;
          dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
          setDragging(true);
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
        }}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDoubleClick={() => (scale === 1 ? zoomIn() : resetZoom())}
        style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
      >
        {failed ? (
          <div className="min-w-[280px] p-10">
            <Problem text="Não consegui mostrar esta imagem aqui. Use Baixar para abrir no computador." />
          </div>
        ) : (
          <img
            src={url}
            alt={alt}
            draggable={false}
            onError={() => setFailed(true)}
            className="block max-h-[85vh] max-w-[90vw] select-none object-contain transition-transform duration-150 ease-out"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "center center" }}
          />
        )}
      </div>
      {caption && <Caption text={caption} />}
    </div>
  );
}

function VideoFrame({ url, filename, chip, caption }: { url: string; filename: string | null; chip: string | null; caption?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative inline-flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <DialogPrimitive.Title className="sr-only">Visualização de vídeo</DialogPrimitive.Title>
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1">
        <Actions url={url} filename={filename} />
      </div>
      {chip && <Chip text={chip} />}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40">
        {failed ? (
          <div className="min-w-[280px] p-10">
            <Problem text="Este navegador não conseguiu tocar o vídeo. Use Baixar para assistir no computador." />
          </div>
        ) : (
          <video src={url} controls autoPlay playsInline onError={() => setFailed(true)} className="block max-h-[85vh] max-w-[90vw] bg-black" />
        )}
      </div>
      {caption && <Caption text={caption} />}
    </div>
  );
}

// PDF: baixa o arquivo e abre no leitor de PDF do próprio navegador, dentro do painel.
// Se não der para baixar aqui (endereço de fora), cai para o link direto.
function PdfBody({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    const ctrl = new AbortController();
    setSrc(null);
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        objectUrl = URL.createObjectURL(new Blob([b], { type: "application/pdf" }));
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSrc(url);
      });
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  if (!src) return <Loading />;
  return <iframe src={src} title="Documento PDF" className="min-h-0 w-full flex-1 border-0 bg-muted" />;
}

function TextBody({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    setText(null);
    setFailed(false);
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((t) => setText(t.length > TEXT_PREVIEW_LIMIT ? t.slice(0, TEXT_PREVIEW_LIMIT) + "\n\n[... o arquivo continua. Baixe para ver tudo.]" : t))
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [url]);
  if (failed)
    return (
      <div className="p-4">
        <Problem text="Não consegui abrir o conteúdo aqui. Use Baixar ou Abrir em nova aba." />
      </div>
    );
  if (text === null) return <Loading />;
  return <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">{text}</pre>;
}

function AudioBody({ url, transcription }: { url: string; transcription?: string | null }) {
  const [failed, setFailed] = useState(false);
  const [showText, setShowText] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Um áudio por vez: pausa o player da bolha (ou outro) quando a janela abre tocando
  useEffect(() => {
    document.querySelectorAll("audio").forEach((a) => {
      if (a !== audioRef.current) a.pause();
    });
  }, []);
  return (
    <div className="space-y-4 p-5">
      <audio ref={audioRef} src={url} controls autoPlay preload="metadata" onError={() => setFailed(true)} className="block w-full" />
      {failed && <Problem text="Este navegador não conseguiu tocar o áudio. Use Baixar para ouvir no computador." />}
      {transcription && (
        <div>
          <button type="button" onClick={() => setShowText((v) => !v)} className="text-xs font-medium text-primary hover:underline">
            {showText ? "Ocultar transcrição" : "Ver transcrição"}
          </button>
          {showText && (
            <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm italic text-muted-foreground">{transcription}</p>
          )}
        </div>
      )}
    </div>
  );
}

function LocationBody({ loc }: { loc: LocationInfo }) {
  const lat = loc.latitude;
  const lon = loc.longitude;
  const hasCoords = lat != null && lon != null;
  const d = 0.004;
  const embed = hasCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d}%2C${lat - d}%2C${lon + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lon}`
    : null;
  return (
    <div>
      {embed && <iframe src={embed} title="Mapa da localização" loading="lazy" className="block h-[min(55vh,420px)] w-full border-0" />}
      {/* nome e endereço já estão no cabeçalho; aqui ficam as coordenadas */}
      <div className="space-y-1 px-4 py-3 text-sm">
        {hasCoords && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {lat.toFixed(6)}, {lon.toFixed(6)}
          </p>
        )}
        {!hasCoords && loc.url && (
          <a href={loc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir localização
          </a>
        )}
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm tabular-nums text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* sem permissão de área de transferência: a pessoa copia na mão */
          }
        }}
        className={iconBtn}
        aria-label={`Copiar ${label.toLowerCase()}`}
        title="Copiar"
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ContactBody({ contacts }: { contacts: ContactInfo[] }) {
  return (
    <div className="divide-y divide-border">
      {contacts.map((c, i) => (
        <div key={i} className="space-y-2 p-4">
          <div>
            <p className="font-medium text-foreground">{c.name}</p>
            {c.org && <p className="text-xs text-muted-foreground">{c.org}</p>}
          </div>
          {c.phones.map((p) => (
            <CopyRow key={"p" + p} label="Telefone" value={p} />
          ))}
          {c.emails.map((e) => (
            <CopyRow key={"e" + e} label="E-mail" value={e} />
          ))}
          {!c.phones.length && !c.emails.length && <p className="text-xs text-muted-foreground">Contato sem telefone nem e-mail.</p>}
        </div>
      ))}
    </div>
  );
}

function LinkBody({ link }: { link: string }) {
  return (
    <div className="space-y-3 p-5 text-sm">
      <p className="text-muted-foreground">O Instagram mandou só o link deste conteúdo, sem o arquivo.</p>
      <p className="break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{link}</p>
      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
        <ExternalLink className="h-4 w-4" />
        Abrir link
      </a>
    </div>
  );
}

function FileBody({ url, filename }: { url: string; filename: string | null }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <FileText className="h-14 w-14 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">Esse tipo de arquivo não abre dentro do painel. Baixe para abrir no computador.</p>
      <a
        href={downloadHref(url, filename)}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
      >
        <Download className="h-4 w-4" />
        Baixar arquivo
      </a>
    </div>
  );
}
