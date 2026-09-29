import { inicioDoDia, minutosNoDia, type EventoAgenda } from "../tipos";
import { EventoAgendaCard } from "./EventoAgendaCard";

const ALTURA_HORA = 56;
const HORA_INICIO_PADRAO = 7;
const HORA_FIM_PADRAO = 19;

interface GradeTempoProps {
  /** um dia (visão Dia) ou sete (visão Semana) */
  dias: Date[];
  eventos: EventoAgenda[];
  aoAbrir?: (evento: EventoAgenda) => void;
  /** arrastar um atendimento para outro horário (só com permissão de agendar) */
  aoMover?: (evento: EventoAgenda, novoInicio: Date) => void;
  /** clicar num horário vazio para agendar ali */
  aoEscolherHorario?: (inicio: Date) => void;
}

const PASSO_MINUTOS = 15;

/** Minuto do dia (arredondado ao passo) a partir da posição vertical do ponteiro. */
function minutoDoPonteiro(clientY: number, coluna: HTMLElement, horaInicio: number): number {
  const caixa = coluna.getBoundingClientRect();
  const minutos = horaInicio * 60 + ((clientY - caixa.top) / ALTURA_HORA) * 60;
  return Math.max(0, Math.round(minutos / PASSO_MINUTOS) * PASSO_MINUTOS);
}

interface Posicionado {
  evento: EventoAgenda;
  inicio: number;
  fim: number;
  coluna: number;
  colunas: number;
}

/** Eventos que se sobrepõem dividem a largura do dia. */
function posicionar(eventos: EventoAgenda[], dia: Date): Posicionado[] {
  const doDia = eventos
    .map((evento) => ({
      evento,
      inicio: minutosNoDia(evento.inicio_em, dia),
      fim: minutosNoDia(evento.fim_em, dia),
    }))
    .filter((e) => e.fim > e.inicio)
    .sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);

  const posicionados: Posicionado[] = [];
  let grupo: Posicionado[] = [];
  let fimDoGrupo = -1;

  const fecharGrupo = () => {
    grupo.forEach((p) => (p.colunas = grupo.reduce((max, o) => Math.max(max, o.coluna + 1), 1)));
    posicionados.push(...grupo);
    grupo = [];
    fimDoGrupo = -1;
  };

  for (const item of doDia) {
    if (grupo.length > 0 && item.inicio >= fimDoGrupo) fecharGrupo();
    // primeira coluna livre no grupo atual
    const ocupadas = new Set(grupo.filter((p) => p.fim > item.inicio).map((p) => p.coluna));
    let coluna = 0;
    while (ocupadas.has(coluna)) coluna += 1;
    grupo.push({ ...item, coluna, colunas: 1 });
    fimDoGrupo = Math.max(fimDoGrupo, item.fim);
  }
  if (grupo.length > 0) fecharGrupo();
  return posicionados;
}

export function GradeTempo({ dias, eventos, aoAbrir, aoMover, aoEscolherHorario }: GradeTempoProps) {
  const limites = eventos.reduce(
    (acc, e) => {
      const inicio = new Date(e.inicio_em);
      const fim = new Date(e.fim_em);
      return {
        primeira: Math.min(acc.primeira, inicio.getHours()),
        ultima: Math.max(acc.ultima, fim.getMinutes() > 0 ? fim.getHours() + 1 : fim.getHours()),
      };
    },
    { primeira: HORA_INICIO_PADRAO, ultima: HORA_FIM_PADRAO },
  );
  const horaInicio = Math.max(0, Math.min(limites.primeira, HORA_INICIO_PADRAO));
  const horaFim = Math.min(24, Math.max(limites.ultima, HORA_FIM_PADRAO));
  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i);
  const altura = horas.length * ALTURA_HORA;
  const hoje = inicioDoDia(new Date()).getTime();
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-panel">
      <div className="min-w-[640px]">
        <div className="flex border-b border-border">
          <div className="w-14 shrink-0" />
          {dias.map((dia) => {
            const ehHoje = inicioDoDia(dia).getTime() === hoje;
            return (
              <div key={dia.toISOString()} className="flex-1 border-l border-border px-2 py-2 text-center">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">
                  {dia.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                </p>
                <p className={`text-sm font-medium ${ehHoje ? "text-accent" : "text-text-primary"}`}>
                  {dia.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex" style={{ height: altura }}>
          <div className="w-14 shrink-0">
            {horas.map((h) => (
              <div key={h} className="relative" style={{ height: ALTURA_HORA }}>
                <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-text-muted">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {dias.map((dia) => {
            const posicionados = posicionar(eventos, dia);
            const ehHoje = inicioDoDia(dia).getTime() === hoje;
            const topoAgora = ((minutosAgora - horaInicio * 60) / 60) * ALTURA_HORA;
            return (
              <div
                key={dia.toISOString()}
                className="relative flex-1 border-l border-border"
                onDragOver={aoMover ? (e) => e.preventDefault() : undefined}
                onDrop={
                  aoMover
                    ? (e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/plain");
                        const evento = eventos.find((ev) => ev.id === id);
                        if (!evento) return;
                        const minuto = minutoDoPonteiro(e.clientY, e.currentTarget, horaInicio);
                        const novo = inicioDoDia(dia);
                        novo.setMinutes(minuto);
                        aoMover(evento, novo);
                      }
                    : undefined
                }
                onDoubleClick={
                  aoEscolherHorario
                    ? (e) => {
                        const minuto = minutoDoPonteiro(e.clientY, e.currentTarget, horaInicio);
                        const novo = inicioDoDia(dia);
                        novo.setMinutes(minuto);
                        aoEscolherHorario(novo);
                      }
                    : undefined
                }
              >
                {horas.map((h) => (
                  <div key={h} className="border-b border-border/60" style={{ height: ALTURA_HORA }} />
                ))}

                {ehHoje && topoAgora >= 0 && topoAgora <= altura && (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t border-accent"
                    style={{ top: topoAgora }}
                    aria-hidden="true"
                  />
                )}

                {posicionados.map(({ evento, inicio, fim, coluna, colunas }) => {
                  const topo = ((inicio - horaInicio * 60) / 60) * ALTURA_HORA;
                  const alturaEvento = Math.max(26, ((fim - inicio) / 60) * ALTURA_HORA - 2);
                  return (
                    <div
                      key={evento.id}
                      className="absolute px-0.5"
                      style={{
                        top: Math.max(0, topo),
                        height: alturaEvento,
                        left: `${(coluna / colunas) * 100}%`,
                        width: `${100 / colunas}%`,
                      }}
                    >
                      {/* na semana o espaço é de uma coluna estreita; no dia, só eventos curtos encolhem */}
                      <EventoAgendaCard
                        evento={evento}
                        compacto={dias.length > 1 || alturaEvento < 76}
                        aoAbrir={aoAbrir}
                        arrastavel={!!aoMover && evento.status !== "cancelado" && evento.status !== "concluido"}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-border px-4 py-2 text-[11px] text-text-muted">
        {aoMover
          ? "Arraste um atendimento para mudar o horário; dois cliques num espaço vazio abrem um novo agendamento."
          : "Atendimentos que passam da meia-noite aparecem em cada dia que ocupam."}
      </p>
      <span className="sr-only" aria-live="polite">
        {eventos.length === 0 ? "Nenhum atendimento no período." : `${eventos.length} atendimentos no período.`}
      </span>
    </div>
  );
}
