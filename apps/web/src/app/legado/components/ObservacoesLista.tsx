import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import type { OSObservacao, UsuarioResponsavel } from "../types";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface ObservacoesListaProps {
  observacoes: OSObservacao[];
  usuarios: UsuarioResponsavel[];
  permiteAdicionar?: boolean;
  onAdicionar?: (texto: string) => Promise<void>;
}

export function ObservacoesLista({
  observacoes,
  usuarios,
  permiteAdicionar,
  onAdicionar,
}: ObservacoesListaProps) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  function nomeUsuario(id: string | null): string {
    if (!id) return "—";
    return usuarios.find((u) => u.id === id)?.nome ?? "—";
  }

  async function handleAdicionar() {
    if (!texto.trim() || !onAdicionar || enviando) return;
    setEnviando(true);
    try {
      await onAdicionar(texto.trim());
      setTexto("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {observacoes.length === 0 ? (
        <p className="text-xs text-text-muted">Nenhuma observação registrada ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {observacoes.map((o) => (
            <li key={o.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-text-secondary">
              <p className="text-text-primary">{o.texto}</p>
              <p className="mt-1 text-text-muted">
                {nomeUsuario(o.usuario_id)} · {formatarData(o.criado_em)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {permiteAdicionar && (
        <div className="flex items-end gap-2 border-t border-border pt-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Adicionar observação sobre o reparo..."
            className="min-h-[60px] flex-1 resize-y rounded-lg border border-border bg-base px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent"
          />
          <button
            type="button"
            onClick={handleAdicionar}
            disabled={enviando || !texto.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-60"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
