import { useEffect, useId, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  aberto: boolean;
  titulo: string;
  descricao: ReactNode;
  textoConfirmar: string;
  tom?: "perigo" | "neutro";
  processando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmDialog({
  aberto,
  titulo,
  descricao,
  textoConfirmar,
  tom = "neutro",
  processando,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  const tituloId = useId();
  const descricaoId = useId();
  const cancelarRef = useRef<HTMLButtonElement>(null);
  // refs: o efeito roda só ao abrir/fechar, mesmo que o pai recrie os callbacks
  const onCancelarRef = useRef(onCancelar);
  const processandoRef = useRef(processando);
  onCancelarRef.current = onCancelar;
  processandoRef.current = processando;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    cancelarRef.current?.focus();
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !processandoRef.current) onCancelarRef.current();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={() => !processando && onCancelar()} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricaoId}
        className="relative w-full max-w-md animate-fade-in rounded-xl border border-border bg-panel p-6 shadow-2xl"
      >
        <h2 id={tituloId} className="font-display text-base font-semibold text-text-primary">
          {titulo}
        </h2>
        <div id={descricaoId} className="mt-2 text-sm text-text-secondary">
          {descricao}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelarRef}
            type="button"
            onClick={onCancelar}
            disabled={processando}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={processando}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              tom === "perigo" ? "bg-danger hover:brightness-110" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {processando && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
