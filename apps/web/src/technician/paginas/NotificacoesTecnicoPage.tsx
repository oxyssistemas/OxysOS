import { useNavigate, useOutletContext } from "react-router-dom";
import { CheckCheck, Loader2 } from "lucide-react";
import { ListaNotificacoes } from "@/components/notificacoes/ListaNotificacoes";
import type { Notificacao } from "@/components/notificacoes/notificacoesService";
import type { useNotificacoes } from "@/components/notificacoes/useNotificacoes";

/** Avisos do técnico: OS atribuída, agendamento, horário alterado, cancelamentos (§43). */
export function NotificacoesTecnicoPage() {
  const { notificacoes } = useOutletContext<{ notificacoes: ReturnType<typeof useNotificacoes> }>();
  const navigate = useNavigate();
  const { itens, nao_lidas, carregando, erro, marcar } = notificacoes;

  function abrir(n: Notificacao) {
    if (!n.lida_em) marcar([n.id]);
    if (n.agendamento_id) navigate(`/technician/jobs/${n.agendamento_id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-text-primary">Avisos</h1>
        {nao_lidas > 0 && (
          <button
            onClick={() => marcar()}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-accent"
          >
            <CheckCheck size={16} aria-hidden="true" /> Marcar todos
          </button>
        )}
      </div>
      {erro && <p className="text-sm text-danger">{erro}</p>}
      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        {carregando ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-text-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Carregando…
          </p>
        ) : (
          <ListaNotificacoes itens={itens} onAbrir={abrir} campo />
        )}
      </div>
    </div>
  );
}
