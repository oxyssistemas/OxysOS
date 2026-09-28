import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { ListaNotificacoes } from "./ListaNotificacoes";
import { useNotificacoes } from "./useNotificacoes";
import type { Notificacao } from "./notificacoesService";

interface Props {
  /** destino de cada aviso neste portal (null = só marca como lido) */
  linkPara: (n: Notificacao) => string | null;
}

/** Sino do topo com a contagem e o painel de avisos (§43). */
export function SinoNotificacoes({ linkPara }: Props) {
  const { itens, nao_lidas, erro, marcar } = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function abrir(n: Notificacao) {
    if (!n.lida_em) marcar([n.id]);
    const destino = linkPara(n);
    if (destino) {
      setAberto(false);
      navigate(destino);
    }
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={nao_lidas > 0 ? `Avisos: ${nao_lidas} não lidos` : "Avisos"}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className="relative rounded-lg p-2 text-text-secondary hover:bg-white/5 hover:text-text-primary"
      >
        <Bell size={18} aria-hidden="true" />
        {nao_lidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {nao_lidas > 99 ? "99+" : nao_lidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Avisos"
          className="absolute right-0 top-full z-40 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">Avisos</p>
            {nao_lidas > 0 && (
              <button onClick={() => marcar()} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                <CheckCheck size={14} aria-hidden="true" /> Marcar todos como lidos
              </button>
            )}
          </div>
          {erro && <p className="px-4 pt-3 text-xs text-danger">{erro}</p>}
          <div className="max-h-[60vh] overflow-y-auto">
            <ListaNotificacoes itens={itens} onAbrir={abrir} />
          </div>
        </div>
      )}
    </div>
  );
}
