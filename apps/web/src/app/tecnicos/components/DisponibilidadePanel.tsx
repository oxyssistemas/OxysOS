import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  obterDisponibilidade,
  registrarAusencia,
  removerAusencia,
  salvarJornadaTecnico,
} from "../equipesService";
import {
  DIAS_SEMANA,
  MOTIVOS_AUSENCIA,
  rotuloMotivo,
  type Ausencia,
  type Disponibilidade,
  type MotivoAusencia,
  type TurnoJornada,
} from "../tipos";

interface DisponibilidadePanelProps {
  aberto: boolean;
  tecnicoId: string | null;
  tecnicoNome: string;
  somenteLeitura?: boolean;
  onFechar: () => void;
}

const TURNO_PADRAO = { inicio: "08:00", fim: "18:00" };

function formatarPeriodo(a: Ausencia): string {
  const inicio = new Date(a.inicio_em);
  const fim = new Date(a.fim_em);
  const data = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data(inicio) === data(fim)) return `${data(inicio)} · ${hora(inicio)} às ${hora(fim)}`;
  return `${data(inicio)} ${hora(inicio)} → ${data(fim)} ${hora(fim)}`;
}

/** yyyy-MM-ddTHH:mm no fuso local, formato aceito pelo input datetime-local */
function paraInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DisponibilidadePanel({
  aberto,
  tecnicoId,
  tecnicoNome,
  somenteLeitura,
  onFechar,
}: DisponibilidadePanelProps) {
  const { notificarSucesso, notificarErro } = useToast();

  const [dados, setDados] = useState<Disponibilidade | null>(null);
  const [jornada, setJornada] = useState<TurnoJornada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvandoJornada, setSalvandoJornada] = useState(false);
  const [erroJornada, setErroJornada] = useState<string | null>(null);

  const [novaAusencia, setNovaAusencia] = useState(false);
  const [motivo, setMotivo] = useState<MotivoAusencia>("folga");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erroAusencia, setErroAusencia] = useState<string | null>(null);
  const [enviandoAusencia, setEnviandoAusencia] = useState(false);
  const [remover, setRemover] = useState<Ausencia | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!tecnicoId) return;
    setCarregando(true);
    setErroCarga(null);
    try {
      const resultado = await obterDisponibilidade(tecnicoId);
      setDados(resultado);
      setJornada(resultado.jornada.map((t) => ({ dia_semana: t.dia_semana, inicio: t.inicio, fim: t.fim })));
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar a disponibilidade.");
    } finally {
      setCarregando(false);
    }
  }, [tecnicoId]);

  useEffect(() => {
    if (!aberto) return;
    setNovaAusencia(false);
    setErroJornada(null);
    setErroAusencia(null);
    // limpa os dados do técnico anterior antes de buscar os deste
    setDados(null);
    setJornada([]);
    carregar();
  }, [aberto, carregar]);

  function abrirFormularioAusencia() {
    const agora = new Date();
    agora.setMinutes(0, 0, 0);
    const amanha = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    setMotivo("folga");
    setInicio(paraInputLocal(agora));
    setFim(paraInputLocal(amanha));
    setObservacao("");
    setErroAusencia(null);
    setNovaAusencia(true);
  }

  function adicionarTurno(dia: number) {
    setJornada((j) => [...j, { dia_semana: dia, ...TURNO_PADRAO }]);
    setErroJornada(null);
  }

  function alterarTurno(indice: number, campo: "inicio" | "fim", valor: string) {
    setJornada((j) => j.map((t, i) => (i === indice ? { ...t, [campo]: valor } : t)));
    setErroJornada(null);
  }

  function removerTurno(indice: number) {
    setJornada((j) => j.filter((_, i) => i !== indice));
    setErroJornada(null);
  }

  function copiarSegundaParaSemana() {
    const segunda = jornada.filter((t) => t.dia_semana === 1);
    if (segunda.length === 0) return;
    setJornada([
      ...jornada.filter((t) => t.dia_semana === 0 || t.dia_semana === 6),
      ...[1, 2, 3, 4, 5].flatMap((dia) => segunda.map((t) => ({ ...t, dia_semana: dia }))),
    ]);
    setErroJornada(null);
  }

  async function salvarJornada() {
    if (!tecnicoId || salvandoJornada) return;
    const invalido = jornada.find((t) => !t.inicio || !t.fim || t.fim <= t.inicio);
    if (invalido) {
      setErroJornada(`Em ${DIAS_SEMANA[invalido.dia_semana]}, o fim do turno precisa ser depois do início.`);
      return;
    }
    setSalvandoJornada(true);
    try {
      await salvarJornadaTecnico(tecnicoId, jornada);
      notificarSucesso("Jornada salva.");
      await carregar();
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Não foi possível salvar a jornada.";
      setErroJornada(mensagem);
      notificarErro(mensagem);
    } finally {
      setSalvandoJornada(false);
    }
  }

  async function enviarAusencia() {
    if (!tecnicoId || enviandoAusencia) return;
    if (!inicio || !fim) {
      setErroAusencia("Informe o início e o fim do período.");
      return;
    }
    if (new Date(fim) <= new Date(inicio)) {
      setErroAusencia("O fim do período precisa ser depois do início.");
      return;
    }
    setEnviandoAusencia(true);
    try {
      await registrarAusencia(tecnicoId, motivo, inicio, fim, observacao);
      notificarSucesso("Ausência registrada.");
      setNovaAusencia(false);
      await carregar();
    } catch (err) {
      setErroAusencia(err instanceof Error ? err.message : "Não foi possível registrar a ausência.");
    } finally {
      setEnviandoAusencia(false);
    }
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setProcessando(true);
    try {
      await removerAusencia(remover.id);
      notificarSucesso("Ausência removida.");
      setRemover(null);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível remover.");
      setRemover(null);
    } finally {
      setProcessando(false);
    }
  }

  const podeEditar = !somenteLeitura;
  const jornadaAlterada =
    !!dados &&
    JSON.stringify(jornada) !==
      JSON.stringify(dados.jornada.map((t) => ({ dia_semana: t.dia_semana, inicio: t.inicio, fim: t.fim })));

  return (
    <SidePanel
      aberto={aberto}
      largo
      titulo="Disponibilidade"
      subtitulo={tecnicoNome}
      onFechar={onFechar}
    >
      {carregando && !dados ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={20} className="animate-spin text-accent" aria-hidden="true" />
          <span className="sr-only">Carregando…</span>
        </div>
      ) : erroCarga ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          {erroCarga}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-text-primary">Jornada semanal</h3>
              {podeEditar && jornada.some((t) => t.dia_semana === 1) && (
                <button
                  onClick={copiarSegundaParaSemana}
                  className="text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Repetir segunda de seg. a sex.
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Sem turnos cadastrados, o técnico é considerado disponível em qualquer horário.
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {DIAS_SEMANA.map((nome, dia) => {
                const turnos = jornada
                  .map((t, indice) => ({ ...t, indice }))
                  .filter((t) => t.dia_semana === dia);
                return (
                  <li key={nome} className="rounded-lg border border-border bg-base px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-secondary">{nome}</span>
                      {podeEditar ? (
                        <button
                          onClick={() => adicionarTurno(dia)}
                          className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary"
                        >
                          <Plus size={12} aria-hidden="true" /> Turno
                        </button>
                      ) : (
                        turnos.length === 0 && <span className="text-xs text-text-muted">Sem turno</span>
                      )}
                    </div>
                    {turnos.length > 0 && (
                      <div className="mt-2 flex flex-col gap-2">
                        {turnos.map((t) => (
                          <div key={t.indice} className="flex items-center gap-2">
                            <label className="sr-only" htmlFor={`jornada_inicio_${t.indice}`}>
                              Início do turno de {nome}
                            </label>
                            <input
                              id={`jornada_inicio_${t.indice}`}
                              type="time"
                              value={t.inicio}
                              disabled={!podeEditar}
                              onChange={(e) => alterarTurno(t.indice, "inicio", e.target.value)}
                              className="rounded-lg border border-border bg-panel px-2.5 py-1.5 text-sm text-text-primary focus:border-accent disabled:opacity-70"
                            />
                            <span className="text-xs text-text-muted">às</span>
                            <label className="sr-only" htmlFor={`jornada_fim_${t.indice}`}>
                              Fim do turno de {nome}
                            </label>
                            <input
                              id={`jornada_fim_${t.indice}`}
                              type="time"
                              value={t.fim}
                              disabled={!podeEditar}
                              onChange={(e) => alterarTurno(t.indice, "fim", e.target.value)}
                              className="rounded-lg border border-border bg-panel px-2.5 py-1.5 text-sm text-text-primary focus:border-accent disabled:opacity-70"
                            />
                            {podeEditar && (
                              <button
                                onClick={() => removerTurno(t.indice)}
                                aria-label={`Remover turno de ${nome}`}
                                className="ml-auto rounded p-1.5 text-text-muted hover:bg-white/5 hover:text-danger"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {erroJornada && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {erroJornada}
              </p>
            )}

            {podeEditar && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={salvarJornada}
                  disabled={!jornadaAlterada || salvandoJornada}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-text-muted"
                >
                  {salvandoJornada && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  Salvar jornada
                </button>
              </div>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-text-primary">Ausências</h3>
              {podeEditar && !novaAusencia && (
                <button
                  onClick={abrirFormularioAusencia}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
                >
                  <Plus size={14} aria-hidden="true" /> Registrar ausência
                </button>
              )}
            </div>

            {novaAusencia && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-border bg-base p-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ausencia_motivo" className="text-xs font-medium text-text-secondary">
                    Motivo
                  </label>
                  <select
                    id="ausencia_motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value as MotivoAusencia)}
                    className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary focus:border-accent"
                  >
                    {MOTIVOS_AUSENCIA.map((m) => (
                      <option key={m.valor} value={m.valor}>
                        {m.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="ausencia_inicio" className="text-xs font-medium text-text-secondary">
                      Início
                    </label>
                    <input
                      id="ausencia_inicio"
                      type="datetime-local"
                      value={inicio}
                      onChange={(e) => setInicio(e.target.value)}
                      className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="ausencia_fim" className="text-xs font-medium text-text-secondary">
                      Fim
                    </label>
                    <input
                      id="ausencia_fim"
                      type="datetime-local"
                      value={fim}
                      onChange={(e) => setFim(e.target.value)}
                      className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary focus:border-accent"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ausencia_observacao" className="text-xs font-medium text-text-secondary">
                    Observação
                  </label>
                  <input
                    id="ausencia_observacao"
                    value={observacao}
                    maxLength={300}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Opcional"
                    className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
                  />
                </div>
                {erroAusencia && (
                  <p role="alert" className="text-xs text-danger">
                    {erroAusencia}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setNovaAusencia(false)}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={enviarAusencia}
                    disabled={enviandoAusencia}
                    className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {enviandoAusencia && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                    Registrar
                  </button>
                </div>
              </div>
            )}

            {dados && dados.ausencias.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-base px-4 py-8 text-center">
                <CalendarOff size={18} className="text-text-muted" aria-hidden="true" />
                <p className="text-sm text-text-secondary">Nenhuma ausência registrada.</p>
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {dados?.ausencias.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-base px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">{rotuloMotivo(a.motivo)}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">{formatarPeriodo(a)}</p>
                      {a.observacao && <p className="mt-0.5 text-xs text-text-muted">{a.observacao}</p>}
                    </div>
                    {podeEditar && (
                      <button
                        onClick={() => setRemover(a)}
                        aria-label={`Remover ${rotuloMotivo(a.motivo).toLowerCase()}`}
                        className="rounded p-1.5 text-text-muted hover:bg-white/5 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-text-muted">Ausências encerradas há mais de 30 dias saem desta lista.</p>
          </section>
        </div>
      )}

      <ConfirmDialog
        aberto={!!remover}
        tom="perigo"
        titulo="Remover ausência?"
        descricao={
          remover
            ? `${rotuloMotivo(remover.motivo)} em ${formatarPeriodo(remover)} deixará de bloquear a agenda do técnico.`
            : ""
        }
        textoConfirmar="Remover"
        processando={processando}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </SidePanel>
  );
}
