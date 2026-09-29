import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Check, Loader2, Search, TriangleAlert, X } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../../context/CompanyContext";
import { listarOrdens } from "../../ordens/ordensService";
import type { OrdemListagem } from "../../ordens/tipos";
import {
  agendarOs,
  consultarConflitos,
  definirStatusAgendamento,
  reagendarAgendamento,
} from "../agendaService";
import {
  DURACOES,
  horaLocal,
  juntarDataHora,
  minutosEntre,
  paraISODia,
  ROTULO_STATUS_AGENDAMENTO,
  tituloDoEvento,
  type AgendaPeriodo,
  type Conflito,
  type EventoAgenda,
} from "../tipos";

interface AgendamentoPanelProps {
  aberto: boolean;
  /** evento existente (editar) ou null (novo agendamento) */
  evento: EventoAgenda | null;
  /** dia/hora sugeridos ao abrir um agendamento novo */
  sugestao?: { data: string; hora: string } | null;
  /** OS já escolhida (central de despacho): dispensa a busca */
  osFixa?: { id: string; rotulo: string } | null;
  /** técnico já escolhido (arrastar a OS até ele no despacho) */
  tecnicoSugerido?: string | null;
  apoio: Pick<AgendaPeriodo, "tecnicos" | "equipes">;
  onFechar: () => void;
  onSalvo: () => void;
}

export function AgendamentoPanel({
  aberto,
  evento,
  sugestao,
  osFixa,
  tecnicoSugerido,
  apoio,
  onFechar,
  onSalvo,
}: AgendamentoPanelProps) {
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const podeForcar = can("calendar.override");

  const [osId, setOsId] = useState("");
  const [osEscolhida, setOsEscolhida] = useState<OrdemListagem | null>(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<OrdemListagem[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [data, setData] = useState("");
  const [hora, setHora] = useState("09:00");
  const [duracao, setDuracao] = useState(60);
  const [tecnico, setTecnico] = useState("");
  const [equipe, setEquipe] = useState("");
  const [observacao, setObservacao] = useState("");

  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [verificando, setVerificando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const consulta = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    setErroForm(null);
    setConflitos([]);
    setResultados([]);
    setBusca("");
    setBuscando(false);
    if (evento) {
      setOsId(evento.os_id);
      setOsEscolhida(null);
      setData(paraISODia(new Date(evento.inicio_em)));
      setHora(horaLocal(evento.inicio_em));
      setDuracao(minutosEntre(evento.inicio_em, evento.fim_em));
      setTecnico(evento.tecnico?.id ?? "");
      setEquipe(evento.equipe?.id ?? "");
      setObservacao(evento.observacao ?? "");
    } else {
      setOsId(osFixa?.id ?? "");
      setOsEscolhida(null);
      setData(sugestao?.data ?? paraISODia(new Date()));
      setHora(sugestao?.hora ?? "09:00");
      setDuracao(60);
      setTecnico(tecnicoSugerido ?? "");
      setEquipe("");
      setObservacao("");
    }
  }, [aberto, evento, sugestao, osFixa, tecnicoSugerido]);

  // busca de OS (só no agendamento novo)
  useEffect(() => {
    if (!aberto || evento || osFixa) return;
    const termo = busca.trim();
    if (termo.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    const id = ++consulta.current;
    setBuscando(true);
    const t = setTimeout(() => {
      listarOrdens({
        busca: termo,
        grupo: "abertas",
        status: "",
        prioridade: "",
        tecnico: "",
        tipo: "",
        cliente: "",
        equipamento: "",
        sla: "",
        ordem: "recentes",
        pagina: 1,
      })
        .then((r) => id === consulta.current && setResultados(r.ordens.slice(0, 8)))
        .catch(() => id === consulta.current && setResultados([]))
        .finally(() => id === consulta.current && setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [busca, aberto, evento, osFixa]);

  const inicio = data && hora ? juntarDataHora(data, hora) : null;
  const fim = inicio ? new Date(inicio.getTime() + duracao * 60000) : null;

  const verificar = useCallback(async () => {
    if (!inicio || !fim || (!tecnico && !equipe)) {
      setConflitos([]);
      return;
    }
    setVerificando(true);
    try {
      setConflitos(
        await consultarConflitos({
          tecnico,
          equipe,
          inicio,
          fim,
          ignorar: evento?.id,
        }),
      );
    } catch {
      setConflitos([]);
    } finally {
      setVerificando(false);
    }
    // inicio/fim são recriados a cada render: as dependências são os campos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hora, duracao, tecnico, equipe, evento?.id]);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(verificar, 300);
    return () => clearTimeout(t);
  }, [aberto, verificar]);

  async function salvar(e: FormEvent, forcar = false) {
    e.preventDefault();
    if (enviando) return;
    if (!evento && !osId) {
      setErroForm("Escolha a ordem de serviço.");
      return;
    }
    if (!inicio || !fim) {
      setErroForm("Informe a data e a hora.");
      return;
    }
    setErroForm(null);
    setEnviando(true);
    try {
      if (evento) {
        await reagendarAgendamento(evento.id, evento.versao, {
          inicio,
          fim,
          tecnico,
          equipe,
          observacao,
          forcar,
        });
        notificarSucesso("Atendimento reagendado.");
      } else {
        await agendarOs({ osId, inicio, fim, tecnico, equipe, observacao, forcar });
        notificarSucesso("Atendimento agendado.");
      }
      onSalvo();
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Não foi possível salvar o agendamento.");
    } finally {
      setEnviando(false);
    }
  }

  async function alterarStatus(status: "confirmado" | "cancelado", motivo?: string) {
    if (!evento || processando) return;
    setProcessando(true);
    try {
      await definirStatusAgendamento(evento.id, evento.versao, status, motivo);
      notificarSucesso(status === "confirmado" ? "Atendimento confirmado." : "Atendimento cancelado.");
      setCancelando(false);
      onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar o atendimento.");
    } finally {
      setProcessando(false);
    }
  }

  const encerrado = evento?.status === "cancelado" || evento?.status === "concluido";
  const emCampo = evento?.status === "em_andamento" || evento?.status === "concluido";

  return (
    <SidePanel
      aberto={aberto}
      largo
      titulo={evento ? "Atendimento agendado" : "Agendar atendimento"}
      subtitulo={evento ? tituloDoEvento(evento) : "Escolha a OS, o horário e quem vai atender"}
      onFechar={onFechar}
    >
      <form onSubmit={(e) => salvar(e)} className="flex flex-col gap-5" noValidate>
        {evento ? (
          <div className="rounded-lg border border-border bg-base p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/app/service-orders/${evento.os_id}`} className="font-medium text-accent hover:text-accent-hover">
                {evento.numero ?? "Ver ordem de serviço"}
              </Link>
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                {ROTULO_STATUS_AGENDAMENTO[evento.status]}
              </span>
            </div>
            {evento.cliente && <p className="mt-1 text-text-secondary">{evento.cliente}</p>}
            <p className="mt-0.5 text-xs text-text-muted">
              {evento.tipo_servico ?? "Sem tipo de serviço"} · {evento.status_os.nome} · {evento.prioridade.nome}
            </p>
          </div>
        ) : osFixa ? (
          <div className="rounded-lg border border-border bg-base p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-text-muted">Ordem de serviço</p>
            <p className="mt-0.5 font-medium text-text-primary">{osFixa.rotulo}</p>
          </div>
        ) : (
          <div>
            <label htmlFor="agendamento_os" className="text-sm font-medium text-text-secondary">
              Ordem de serviço *
            </label>
            {osEscolhida ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-border bg-base px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-text-primary">{osEscolhida.numero}</span>
                  <span className="ml-2 text-text-secondary">{osEscolhida.cliente.nome}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {osEscolhida.titulo || osEscolhida.descricao}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOsEscolhida(null);
                    setOsId("");
                  }}
                  aria-label="Trocar ordem de serviço"
                  className="rounded p-1 text-text-muted hover:bg-white/5 hover:text-text-primary"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative mt-1.5">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                  <input
                    id="agendamento_os"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por número, cliente ou descrição"
                    className="w-full rounded-lg border border-border bg-base py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
                  />
                </div>
                {buscando && <p className="mt-1 text-xs text-text-muted">Buscando…</p>}
                {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                  <p className="mt-1 text-xs text-text-muted">Nenhuma OS em aberto encontrada.</p>
                )}
                {resultados.length > 0 && (
                  <ul className="mt-1.5 flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border">
                    {resultados.map((os) => (
                      <li key={os.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOsEscolhida(os);
                            setOsId(os.id);
                            setTecnico((t) => t || os.tecnico?.id || "");
                          }}
                          className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-white/5"
                        >
                          <span className="font-medium text-text-primary">{os.numero}</span>
                          <span className="ml-2 text-text-secondary">{os.cliente.nome}</span>
                          <span className="block truncate text-xs text-text-muted">{os.titulo || os.descricao}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <fieldset disabled={emCampo} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <legend className="sr-only">Horário</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agendamento_data" className="text-sm font-medium text-text-secondary">
              Data *
            </label>
            <input
              id="agendamento_data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agendamento_hora" className="text-sm font-medium text-text-secondary">
              Início *
            </label>
            <input
              id="agendamento_hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agendamento_duracao" className="text-sm font-medium text-text-secondary">
              Duração
            </label>
            <select
              id="agendamento_duracao"
              value={duracao}
              onChange={(e) => setDuracao(Number(e.target.value))}
              className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary focus:border-accent"
            >
              {DURACOES.map((d) => (
                <option key={d.minutos} value={d.minutos}>
                  {d.rotulo}
                </option>
              ))}
              {!DURACOES.some((d) => d.minutos === duracao) && (
                <option value={duracao}>{`${Math.floor(duracao / 60)}h${String(duracao % 60).padStart(2, "0")}`}</option>
              )}
            </select>
          </div>
        </fieldset>

        <fieldset disabled={emCampo} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="sr-only">Responsável</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agendamento_tecnico" className="text-sm font-medium text-text-secondary">
              Técnico
            </label>
            <select
              id="agendamento_tecnico"
              value={tecnico}
              onChange={(e) => setTecnico(e.target.value)}
              className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary focus:border-accent"
            >
              <option value="">Sem técnico</option>
              {apoio.tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agendamento_equipe" className="text-sm font-medium text-text-secondary">
              Equipe
            </label>
            <select
              id="agendamento_equipe"
              value={equipe}
              onChange={(e) => setEquipe(e.target.value)}
              className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary focus:border-accent"
            >
              <option value="">Sem equipe</option>
              {apoio.equipes.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="agendamento_observacao" className="text-sm font-medium text-text-secondary">
            Observação
          </label>
          <input
            id="agendamento_observacao"
            value={observacao}
            maxLength={500}
            disabled={emCampo}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: levar escada"
            className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent disabled:opacity-70"
          />
        </div>

        {verificando && <p className="text-xs text-text-muted">Verificando a agenda…</p>}

        {conflitos.length > 0 && (
          <div role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <TriangleAlert size={15} className="text-amber-400" aria-hidden="true" />
              {conflitos.length === 1 ? "Conflito de agenda" : `${conflitos.length} conflitos de agenda`}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs text-text-secondary">
              {conflitos.map((c, i) => (
                <li key={`${c.tipo}-${c.agendamento_id ?? i}`}>
                  {c.mensagem}
                  {c.os_id && (
                    <>
                      {" "}
                      <Link to={`/app/service-orders/${c.os_id}`} className="text-accent hover:text-accent-hover">
                        ver OS
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {!podeForcar && (
              <p className="mt-1.5 text-xs text-text-muted">
                Só quem tem permissão para agendar sobre conflitos pode seguir assim.
              </p>
            )}
          </div>
        )}

        {erroForm && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-text-primary">
            <AlertTriangle size={15} className="text-danger" aria-hidden="true" />
            {erroForm}
          </div>
        )}

        {evento && !encerrado && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {evento.status === "agendado" && (
              <button
                type="button"
                onClick={() => alterarStatus("confirmado")}
                disabled={processando}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-60"
              >
                <Check size={14} aria-hidden="true" /> Confirmar com o cliente
              </button>
            )}
            {!emCampo && (
              <button
                type="button"
                onClick={() => setCancelando(true)}
                disabled={processando}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-danger disabled:opacity-60"
              >
                Cancelar atendimento
              </button>
            )}
          </div>
        )}

        {!encerrado && !emCampo && (
          <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap justify-end gap-2 border-t border-border bg-panel px-6 py-4">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
            >
              Fechar
            </button>
            {conflitos.length > 0 && podeForcar && (
              <button
                type="button"
                onClick={(e) => salvar(e, true)}
                disabled={enviando}
                className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-60"
              >
                {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                Agendar mesmo assim
              </button>
            )}
            {/* havendo conflito, o caminho é o botão de forçar (para quem pode) */}
            {!(conflitos.length > 0 && podeForcar) && (
              <button
                type="submit"
                disabled={enviando || conflitos.length > 0}
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-text-muted"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CalendarClock size={16} aria-hidden="true" />}
                {evento ? "Salvar alterações" : "Agendar"}
              </button>
            )}
          </div>
        )}

        {emCampo && (
          <p className="rounded-lg border border-border bg-white/5 px-3 py-2.5 text-sm text-text-secondary">
            Este atendimento já começou em campo: o horário passa a ser controlado pelo técnico.
          </p>
        )}
      </form>

      <ConfirmDialog
        aberto={cancelando}
        tom="perigo"
        titulo="Cancelar atendimento?"
        descricao="O horário sai da agenda e a OS volta a ficar sem data. O histórico é preservado."
        textoConfirmar="Cancelar atendimento"
        processando={processando}
        onConfirmar={() => alterarStatus("cancelado")}
        onCancelar={() => setCancelando(false)}
      />
    </SidePanel>
  );
}
