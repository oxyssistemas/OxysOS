import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { faixaHoraria, tituloDoEvento, type EventoAgenda } from "../tipos";

interface EventoAgendaCardProps {
  evento: EventoAgenda;
  /** compacto: dentro da grade de horários, onde o espaço é pouco */
  compacto?: boolean;
  /** quando informado, o cartão abre o painel do atendimento em vez da OS */
  aoAbrir?: (evento: EventoAgenda) => void;
  /** permite arrastar o cartão para outro horário (visões Dia e Semana) */
  arrastavel?: boolean;
}

/**
 * As cores vêm da configuração da empresa: a faixa lateral é a prioridade e o
 * ponto é o status da OS. Nada de cor fixa por regra no componente.
 */
export function EventoAgendaCard({ evento, compacto, aoAbrir, arrastavel }: EventoAgendaCardProps) {
  const cancelado = evento.status === "cancelado";
  const classe = `block h-full w-full overflow-hidden rounded-md border border-border border-l-[3px] bg-panel px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06] ${
    cancelado ? "opacity-60" : ""
  } ${arrastavel ? "cursor-grab active:cursor-grabbing" : ""}`;
  const conteudo = (
    <>
      {/* no compacto (grade da semana) o título vem primeiro: é o que sobrevive à truncagem */}
      <p className={`flex items-center gap-1.5 truncate text-xs font-medium text-text-primary ${cancelado ? "line-through" : ""}`}>
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: evento.status_os.cor }}
          aria-hidden="true"
        />
        <span className="truncate">{tituloDoEvento(evento)}</span>
      </p>
      <p className="truncate text-[11px] text-text-muted">
        {faixaHoraria(evento)}
        {evento.numero && !compacto ? ` · ${evento.numero}` : ""}
      </p>
      {!compacto && (
        <>
          {evento.cliente && <p className="truncate text-[11px] text-text-secondary">{evento.cliente}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
            {evento.tecnico?.nome && <span className="truncate">{evento.tecnico.nome}</span>}
            {evento.equipe && (
              <span className="inline-flex items-center gap-1 truncate">
                <Users size={10} style={{ color: evento.equipe.cor }} aria-hidden="true" />
                {evento.equipe.nome}
              </span>
            )}
            {!evento.tecnico?.nome && !evento.equipe && <span>Sem responsável</span>}
            <span className="truncate">· {evento.status_os.nome}</span>
          </p>
        </>
      )}
    </>
  );

  if (aoAbrir) {
    return (
      <button
        type="button"
        draggable={arrastavel}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", evento.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => aoAbrir(evento)}
        title={`${faixaHoraria(evento)} · ${tituloDoEvento(evento)}`}
        style={{ borderLeftColor: evento.prioridade.cor }}
        className={classe}
      >
        {conteudo}
      </button>
    );
  }

  return (
    <Link
      to={`/app/service-orders/${evento.os_id}`}
      title={`${faixaHoraria(evento)} · ${tituloDoEvento(evento)}`}
      style={{ borderLeftColor: evento.prioridade.cor }}
      className={classe}
    >
      {conteudo}
    </Link>
  );
}
