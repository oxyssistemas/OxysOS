import { useEffect, useId, useState } from "react";
import { Loader2, X } from "lucide-react";
import { AssinaturaTouch } from "./AssinaturaTouch";

interface AssinaturaDialogProps {
  aberto: boolean;
  titulo: string;
  processando?: boolean;
  /** recebe o PNG (data URL) quando a pessoa confirma */
  onConfirmar: (png: string) => void;
  onCancelar: () => void;
}

/** Janela com o quadro de assinatura, para itens de checklist do tipo assinatura. */
export function AssinaturaDialog({ aberto, titulo, processando, onConfirmar, onCancelar }: AssinaturaDialogProps) {
  const tituloId = useId();
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setPng(null);
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && !processando && onCancelar();
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, processando, onCancelar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="w-full max-w-lg rounded-t-2xl border border-border bg-panel p-5 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={tituloId} className="font-display text-base font-semibold text-text-primary">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onCancelar}
            disabled={processando}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-text-muted hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>
        <AssinaturaTouch onChange={setPng} altura={200} desabilitado={processando} />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={processando}
            className="min-h-[48px] flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => png && onConfirmar(png)}
            disabled={!png || processando}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {processando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Usar esta assinatura
          </button>
        </div>
      </div>
    </div>
  );
}
