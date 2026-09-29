import { Link } from "react-router-dom";
import { horario, inicioDoDia, paraISODia, somarDias, tituloDoEvento, type EventoAgenda } from "../tipos";

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MAX_POR_DIA = 3;

interface GradeMesProps {
  /** primeiro dia da grade (domingo da semana que abre o mês) */
  inicio: Date;
  mesReferencia: number;
  eventos: EventoAgenda[];
  aoEscolherDia: (dia: Date) => void;
}

export function GradeMes({ inicio, mesReferencia, eventos, aoEscolherDia }: GradeMesProps) {
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
  const hoje = inicioDoDia(new Date()).getTime();

  const porDia = new Map<string, EventoAgenda[]>();
  for (const evento of eventos) {
    const chave = paraISODia(new Date(evento.inicio_em));
    const lista = porDia.get(chave);
    if (lista) lista.push(evento);
    else porDia.set(chave, [evento]);
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-panel">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-border">
          {DIAS_CURTOS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] uppercase tracking-wide text-text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const chave = paraISODia(dia);
            const doDia = (porDia.get(chave) ?? []).sort((a, b) => a.inicio_em.localeCompare(b.inicio_em));
            const foraDoMes = dia.getMonth() !== mesReferencia;
            const ehHoje = inicioDoDia(dia).getTime() === hoje;
            return (
              <div
                key={chave}
                className={`min-h-[104px] border-b border-l border-border p-1.5 first:border-l-0 ${
                  foraDoMes ? "bg-base/40" : ""
                }`}
              >
                <button
                  onClick={() => aoEscolherDia(dia)}
                  className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium hover:bg-white/10 ${
                    ehHoje ? "bg-accent text-white" : foraDoMes ? "text-text-muted" : "text-text-secondary"
                  }`}
                  aria-label={`Ver ${dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`}
                >
                  {dia.getDate()}
                </button>
                <div className="flex flex-col gap-1">
                  {doDia.slice(0, MAX_POR_DIA).map((evento) => (
                    <Link
                      key={evento.id}
                      to={`/app/service-orders/${evento.os_id}`}
                      title={`${horario(evento.inicio_em)} · ${tituloDoEvento(evento)}`}
                      style={{ borderLeftColor: evento.prioridade.cor }}
                      className={`flex items-center gap-1 overflow-hidden rounded border-l-[3px] bg-white/5 px-1.5 py-0.5 text-[11px] hover:bg-white/10 ${
                        evento.status === "cancelado" ? "opacity-60 line-through" : ""
                      }`}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: evento.status_os.cor }}
                        aria-hidden="true"
                      />
                      <span className="shrink-0 tabular-nums text-text-muted">{horario(evento.inicio_em)}</span>
                      <span className="truncate text-text-secondary">{tituloDoEvento(evento)}</span>
                    </Link>
                  ))}
                  {doDia.length > MAX_POR_DIA && (
                    <button
                      onClick={() => aoEscolherDia(dia)}
                      className="px-1.5 text-left text-[11px] font-medium text-accent hover:text-accent-hover"
                    >
                      +{doDia.length - MAX_POR_DIA} atendimentos
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
