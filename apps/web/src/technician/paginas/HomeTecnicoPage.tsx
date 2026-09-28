import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, CalendarDays, Flame, MapPin, RefreshCw, Store } from "lucide-react";
import { useTecnico } from "../TecnicoContext";
import { obterHomeTecnico } from "../tecnicoService";
import { diaRelativo, horario, primeiroNome, saudacao, type HomeTecnico } from "../tipos";

function Numero({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 text-center ${destaque ? "border-accent/30 bg-accent-muted" : "border-border bg-panel"}`}>
      <p className="font-display text-2xl font-semibold tabular-nums text-text-primary">{valor}</p>
      <p className="mt-0.5 text-[11px] text-text-secondary">{rotulo}</p>
    </div>
  );
}

export function HomeTecnicoPage() {
  const { dados } = useTecnico();
  const [home, setHome] = useState<HomeTecnico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setHome(await obterHomeTecnico());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o seu dia.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const proximo = home?.proximo ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">
          {saudacao()}
          {primeiroNome(dados?.tecnico?.nome) ? `, ${primeiroNome(dados?.tecnico?.nome)}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        </p>
      </div>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button
            onClick={carregar}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary"
          >
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {carregando && !home ? (
        <div className="h-28 animate-pulse rounded-xl border border-border bg-panel" aria-hidden="true" />
      ) : home ? (
        <>
          <section aria-label="Resumo de hoje">
            <div className="grid grid-cols-3 gap-2">
              <Numero valor={home.hoje.total} rotulo={home.hoje.total === 1 ? "atendimento" : "atendimentos"} destaque />
              <Numero valor={home.hoje.urgentes} rotulo="prioridade alta" />
              <Numero valor={home.hoje.concluidos} rotulo="concluídos" />
            </div>
            {home.hoje.em_andamento > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                <Flame size={13} aria-hidden="true" /> Você tem um atendimento em andamento.
              </p>
            )}
          </section>

          <section aria-label="Próximo atendimento">
            <h2 className="mb-2 text-sm font-semibold text-text-primary">Próximo atendimento</h2>
            {proximo ? (
              <article
                style={{ borderLeftColor: proximo.prioridade.cor }}
                className="rounded-xl border border-border border-l-[4px] bg-panel p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold tabular-nums text-text-primary">
                      {horario(proximo.inicio_em)} – {horario(proximo.fim_em)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {diaRelativo(proximo.inicio_em)} · {proximo.numero ?? "sem número"}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                    style={{ borderColor: `${proximo.prioridade.cor}55`, color: proximo.prioridade.cor }}
                  >
                    {proximo.prioridade.nome}
                  </span>
                </div>

                <p className="mt-2 text-base font-medium text-text-primary">{proximo.titulo}</p>
                <p className="text-sm text-text-secondary">{proximo.cliente}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    {proximo.local_atendimento === "loja" ? <Store size={12} aria-hidden="true" /> : <MapPin size={12} aria-hidden="true" />}
                    {proximo.local_atendimento === "loja" ? "Na loja" : "No cliente"}
                  </span>
                  {proximo.tipo_servico && <span>{proximo.tipo_servico}</span>}
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: proximo.status_os.cor }} aria-hidden="true" />
                    {proximo.status_os.nome}
                  </span>
                </p>

                <Link
                  to={`/technician/jobs/${proximo.agendamento_id}`}
                  className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-white"
                >
                  Ver atendimento
                </Link>
              </article>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-10 text-center">
                <CalendarCheck size={20} className="text-text-muted" aria-hidden="true" />
                <p className="text-sm text-text-secondary">Nenhum atendimento à frente.</p>
              </div>
            )}
          </section>

          {home.proximos_dias > 0 && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
              <CalendarDays size={13} aria-hidden="true" />
              {home.proximos_dias} {home.proximos_dias === 1 ? "atendimento" : "atendimentos"} nos próximos 7 dias
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
