import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ZoomIn, ZoomOut, Maximize2, RotateCcw, Download } from "lucide-react";
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
 * - Image: pinch / wheel / button zoom + click-and-drag pan when zoomed.
 * - Video: full-size HTML5 player.
 * - Backdrop click, ESC and X all close. Re-opening resets state.
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

  // Mouse wheel zoom (only for images)
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

  // Click-and-drag pan when zoomed in
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

  // Keyboard shortcuts (Radix handles ESC, we add +/-/0)
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          // Radix would otherwise warn about missing description/title — we
          // hide them visually but keep the structure for screen readers.
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {kind === "image" ? "Visualização de imagem" : "Visualização de vídeo"}
          </DialogPrimitive.Title>

          {/* Header: sender label + actions */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-4 py-2.5 text-white">
            <div className="min-w-0 flex-1 truncate text-sm">
              {senderLabel ?? (kind === "image" ? "Imagem" : "Vídeo")}
            </div>
            <div className="flex items-center gap-1">
              {kind === "image" && (
                <>
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={scale <= MIN_SCALE}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Diminuir zoom"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-xs tabular-nums text-white/70">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={scale >= MAX_SCALE}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Aumentar zoom"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetZoom}
                    disabled={scale === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Restaurar tamanho"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <div className="mx-1 h-5 w-px bg-white/20" />
                </>
              )}
              <a
                href={url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Baixar"
              >
                <Download className="h-4 w-4" />
              </a>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Abrir em nova aba"
              >
                <Maximize2 className="h-4 w-4" />
              </a>
              <DialogPrimitive.Close
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Media surface */}
          <div
            className="flex flex-1 items-center justify-center overflow-hidden p-4"
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
                  "max-h-full max-w-full select-none rounded-md object-contain shadow-2xl",
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
                className="max-h-full max-w-full rounded-md bg-black shadow-2xl"
              />
            )}
          </div>

          {/* Footer: caption */}
          {caption && (
            <div className="border-t border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white/90">
              <p className="mx-auto max-w-3xl whitespace-pre-wrap break-words">{caption}</p>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
