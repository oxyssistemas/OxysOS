import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface SidePanelProps {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
  largo?: boolean;
}

export function SidePanel({ aberto, titulo, subtitulo, onFechar, children, largo }: SidePanelProps) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    if (aberto) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={titulo}>
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onFechar}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full max-w-full flex-col bg-panel border-l border-border shadow-2xl animate-slide-in ${
          largo ? "md:w-[640px]" : "md:w-[440px]"
        }`}
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">{titulo}</h2>
            {subtitulo && <p className="mt-1 text-sm text-text-secondary">{subtitulo}</p>}
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar painel"
            className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
