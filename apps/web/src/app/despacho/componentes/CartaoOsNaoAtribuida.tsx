import { Link } from "react-router-dom";
import { CalendarClock, Clock, MapPin, Sparkles, UserPlus } from "lucide-react";
import {
  CLASSE_SLA,
  ROTULO_SLA,
  esperaHumana,
  tituloDaOs,
  type OsNaoAtribuida,
} from "../tipos";

interface CartaoOsNaoAtribuidaProps {
  os: OsNaoAtribuida;
  podeDistribuir: boolean;
  aoSugerir: (os: OsNaoAtribuida) => void;
  aoAgendar: (os: OsNaoAtribuida) => void;
  /** marca o cartão que está sendo arrastado */
  arrastando: boolean;
  aoArrastar: (os: OsNaoAtribuida | null) => void;
}

export function CartaoOsNaoAtribuida({
  os,
  podeDistribuir,
  aoSugerir,
  aoAgendar,
  arrastando,
  aoArrastar,
}: CartaoOsNaoAtribuidaProps) {
  return (
    <li
      draggable={podeDistribuir}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", os.os_id);
        e.dataTransfer.effectAllowed = "move";
        aoArrastar(os);
      }}
      onDragEnd={() => aoArrastar(null)}
      style={{ borderLeftColor: os.prioridade.cor }}
      className={`rounded-xl border border-border border-l-[3px] bg-panel p-3 transition-opacity ${
        podeDistribuir ? "cursor-grab active:cursor-grabbing" : ""
      } ${arrastando ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{tituloDaOs(os)}</p>
          <p className="truncate text-xs text-text-secondary">
            {os.numero ?? "Sem número"}
            {os.cliente ? ` · ${os.cliente}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${CLASSE_SLA[os.sla]}`}>
          {ROTULO_SLA[os.sla]}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: os.prioridade.cor }} aria-hidden="true" />
          {os.prioridade.nome}
        </span>
        {os.tipo_servico && <span className="truncate">{os.tipo_servico.nome}</span>}
        <span className="inline-flex items-center gap-1">
          <MapPin size={11} aria-hidden="true" />
          {os.local_atendimento === "loja" ? "Na loja" : "No cliente"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} aria-hidden="true" />
          aguardando {esperaHumana(os.aguardando_minutos)}
        </span>
        {os.agendado_em && (
          <span className="inline-flex items-center gap-1 text-text-secondary">
            <CalendarClock size={11} aria-hidden="true" />
            já agendada
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
        <Link to={`/app/service-orders/${os.os_id}`} className="font-medium text-text-secondary hover:text-text-primary">
          Abrir OS
        </Link>
        {podeDistribuir && (
          <div className="flex gap-3">
            <button
              onClick={() => aoSugerir(os)}
              className="inline-flex items-center gap-1 font-medium text-text-secondary hover:text-text-primary"
            >
              <Sparkles size={13} aria-hidden="true" /> Sugerir técnico
            </button>
            <button
              onClick={() => aoAgendar(os)}
              className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
            >
              <UserPlus size={13} aria-hidden="true" /> Agendar
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
