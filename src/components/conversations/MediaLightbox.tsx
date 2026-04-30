import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ZoomIn, ZoomOut, RotateCcw, Maximize2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MediaLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "image" | "video" | null;
  url: string | null;
  caption?: string | null;
  /** Optional sender name for the header (e.g. customer phone or display name) */
  senderLabel?: string | null;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;

/**
 * Floating media viewer that opens inside the Canggu admin (no page nav).
 *
 * Card sized to fit the file: small files show small, big files show big,
 * always within 90vw × 85vh. Background uses the Canggu palette
 * (`bg-card`) so it picks up light/dark theme automatically. The action
 * bar floats over the file's top-right corner (close + zoom + open + download).
 *
 * Image: wheel / button / keyboard zoom + click-and-drag pan.
 * Video: native HTML5 player (full controls, autoplay).
 */
export function MediaLightbox({ open, onOpenChange, kind, url, caption, senderLabel }: MediaLightboxProps) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ x: number; y: number } | null>(null);

  // Reset transform whenever the lightbox is opened with a new file
  useEffect(() => {
    if (open) {
      setScale(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open, url]);

  const zoomIn = useCallback(() => {
    setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  }, []);
  const zoomOut = useCallback(() => {
    setScale(s => {
      const next = Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (kind !== "image") return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    setScale(s => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, +(s + delta).toFixed(2)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, [kind]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale === 1 || kind !== "image") return;
    draggingRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [scale, pan, kind]);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    setPan({ x: e.clientX - draggingRef.current.x, y: e.clientY - draggingRef.current.y });
  }, []);
  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // Keyboard shortcuts (Radix already handles ESC; we add +/-/0)
  useEffect(() => {
    if (!open || kind !== "image") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomIn(); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); resetZoom(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, kind, zoomIn, zoomOut, resetZoom]);

  if (!url || !kind) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Outer wrapper handles centering + click-outside-to-close.
          // Inner card hugs the actual file size.
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">
            {kind === "image" ? "Visualização de imagem" : "Visualização de vídeo"}
          </DialogPrimitive.Title>

          {/* Card: shrinks to media content, bounded by viewport */}
          <div
            className="relative inline-flex max-h-[90vh] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            // Clicking inside the card should not close the dialog —
            // Radix already isolates the content, this just guards against
            // future overlay-click handlers if any.
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating action bar — sticks to the top-right of the card */}
            <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1">
              {kind === "image" && (
                <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/85 px-1.5 py-1 shadow-md backdrop-blur">
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={scale <= MIN_SCALE}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Diminuir zoom"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted-foreground">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={scale >= MAX_SCALE}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Aumentar zoom"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetZoom}
                    disabled={scale === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Restaurar tamanho"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/85 px-1.5 py-1 shadow-md backdrop-blur">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted hover:text-foreground"
                  aria-label="Abrir em nova aba"
                >
                  <Maximize2 className="h-4 w-4" />
                </a>
                <a
                  href={url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted hover:text-foreground"
                  aria-label="Baixar"
                >
                  <Download className="h-4 w-4" />
                </a>
                <DialogPrimitive.Close
                  className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/80 transition hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>
            </div>

            {/* Optional sender label — kept very low-key in the corner */}
            {senderLabel && (
              <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                {senderLabel}
              </div>
            )}

            {/* Media surface */}
            <div
              className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onDoubleClick={kind === "image" ? () => (scale === 1 ? zoomIn() : resetZoom()) : undefined}
              style={{ cursor: kind === "image" && scale > 1 ? (draggingRef.current ? "grabbing" : "grab") : "default" }}
            >
              {kind === "image" ? (
                <img
                  src={url}
                  alt={caption ?? "Imagem enviada pelo cliente"}
                  draggable={false}
                  className={cn(
                    "block max-h-[85vh] max-w-[90vw] select-none object-contain",
                    "transition-transform duration-150 ease-out"
                  )}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: "center center",
                  }}
                />
              ) : (
                <video
                  src={url}
                  controls
                  autoPlay
                  playsInline
                  className="block max-h-[85vh] max-w-[90vw] bg-black"
                />
              )}
            </div>

            {/* Caption */}
            {caption && (
              <div className="border-t border-border bg-card px-4 py-3">
                <p className="mx-auto max-w-3xl whitespace-pre-wrap break-words text-sm text-foreground">
                  {caption}
                </p>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
