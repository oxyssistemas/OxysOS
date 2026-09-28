import {
  AlarmClock,
  Ban,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  PauseCircle,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import { tempoRelativo, type Notificacao, type TipoNotificacao } from "./notificacoesService";

const VISUAL: Record<TipoNotificacao, { icone: LucideIcon; cor: string }> = {
  atendimento_iniciado: { icone: PlayCircle, cor: "text-accent" },
  atendimento_pausado: { icone: PauseCircle, cor: "text-amber-300" },
  os_finalizada: { icone: CheckCircle2, cor: "text-success" },
  os_urgente_atrasada: { icone: AlarmClock, cor: "text-danger" },
  os_atribuida: { icone: ClipboardList, cor: "text-accent" },
  atendimento_agendado: { icone: CalendarPlus, cor: "text-accent" },
  horario_alterado: { icone: CalendarClock, cor: "text-amber-300" },
  atendimento_cancelado: { icone: CalendarX, cor: "text-danger" },
  os_cancelada: { icone: Ban, cor: "text-danger" },
};

interface Props {
  itens: Notificacao[];
  /** abrir o aviso: marca como lido e, se houver destino, navega */
  onAbrir: (n: Notificacao) => void;
  /** alvo maior para o celular */
  campo?: boolean;
}

export function ListaNotificacoes({ itens, onAbrir, campo }: Props) {
  if (itens.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-text-muted">Nenhum aviso por enquanto.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {itens.map((n) => {
        const { icone: Icone, cor } = VISUAL[n.tipo] ?? VISUAL.os_atribuida;
        const nova = !n.lida_em;
        return (
          <li key={n.id}>
            <button
              onClick={() => onAbrir(n)}
              className={`flex w-full items-start gap-3 px-4 text-left hover:bg-white/5 ${campo ? "min-h-[64px] py-3.5" : "py-3"} ${
                nova ? "bg-accent/[0.04]" : ""
              }`}
            >
              <Icone size={18} className={`mt-0.5 shrink-0 ${cor}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${nova ? "font-semibold text-text-primary" : "text-text-secondary"}`}>{n.titulo}</span>
                <span className="block text-xs text-text-muted">{n.mensagem}</span>
                <span className="mt-0.5 block text-[11px] text-text-muted">{tempoRelativo(n.criada_em)}</span>
              </span>
              {nova && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Não lido" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
