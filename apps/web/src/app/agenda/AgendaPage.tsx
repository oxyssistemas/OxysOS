import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import { carregarAgenda, reagendarAgendamento } from "./agendaService";
import { AgendamentoPanel } from "./componentes/AgendamentoPanel";
import { GradeMes } from "./componentes/GradeMes";
import { GradeTempo } from "./componentes/GradeTempo";
import { ListaPorResponsavel } from "./componentes/ListaPorResponsavel";
import {
  VISOES,
  dataDoISO,
  horario,
  minutosEntre,
  inicioDaGradeDoMes,
  inicioDaSemana,
  inicioDoDia,
  paraISODia,
  periodoDaVisao,
  rotuloDoPeriodo,
  somarDias,
  type AgendaPeriodo,
  type EventoAgenda,
  type FiltrosAgenda,
  type VisaoAgenda,
} from "./tipos";

function filtrosDaUrl(params: URLSearchParams): FiltrosAgenda {
  const visao = params.get("visao");
  const data = params.get("data");
  return {
    visao: VISOES.some((v) => v.valor === visao) ? (visao as VisaoAgenda) : "semana",
    data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : paraISODia(new Date()),
    tecnico: params.get("tecnico") ?? "",
    equipe: params.get("equipe") ?? "",
    incluirCancelados: params.get("cancelados") === "1",
  };
}

export function AgendaPage() {
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const podeAgendar = can("calendar.manage");
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);
  const referencia = useMemo(() => dataDoISO(filtros.data), [filtros.data]);
  const periodo = useMemo(() => periodoDaVisao(filtros.visao, referencia), [filtros.visao, referencia]);

  const [agenda, setAgenda] = useState<AgendaPeriodo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);

  const [painel, setPainel] = useState<{ aberto: boolean; evento: EventoAgenda | null; sugestao: { data: string; hora: string } | null }>(
    { aberto: false, evento: null, sugestao: null },
  );
  const [mover, setMover] = useState<{ evento: EventoAgenda; inicio: Date } | null>(null);
  const [movendo, setMovendo] = useState(false);

  const atualizarFiltros = useCallback(
    (parcial: Partial<FiltrosAgenda>) => {
      const novo = { ...filtros, ...parcial };
      const p = new URLSearchParams();
      if (novo.visao !== "semana") p.set("visao", novo.visao);
      if (novo.data !== paraISODia(new Date())) p.set("data", novo.data);
      if (novo.tecnico) p.set("tecnico", novo.tecnico);
      if (novo.equipe) p.set("equipe", novo.equipe);
      if (novo.incluirCancelados) p.set("cancelados", "1");
      setParams(p, { replace: true });
    },
    [filtros, setParams],
  );

  const carregar = useCallback(async () => {
    const id = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await carregarAgenda({
        inicio: periodo.inicio,
        fim: periodo.fim,
        tecnico: filtros.tecnico,
        equipe: filtros.equipe,
        incluirCancelados: filtros.incluirCancelados,
      });
      if (id !== requisicao.current) return;
      setAgenda(resultado);
    } catch (e) {
      if (id === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar a agenda.");
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [periodo.inicio, periodo.fim, filtros.tecnico, filtros.equipe, filtros.incluirCancelados]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirEvento(evento: EventoAgenda) {
    setPainel({ aberto: true, evento, sugestao: null });
  }

  function abrirNovo(sugestao?: Date) {
    setPainel({
      aberto: true,
      evento: null,
      sugestao: sugestao ? { data: paraISODia(sugestao), hora: horario(sugestao.toISOString()) } : null,
    });
  }

  async function confirmarMover() {
    if (!mover || movendo) return;
    setMovendo(true);
    const duracao = minutosEntre(mover.evento.inicio_em, mover.evento.fim_em);
    try {
      await reagendarAgendamento(mover.evento.id, mover.evento.versao, {
        inicio: mover.inicio,
        fim: new Date(mover.inicio.getTime() + duracao * 60000),
        tecnico: mover.evento.tecnico?.id,
        equipe: mover.evento.equipe?.id,
        observacao: mover.evento.observacao ?? undefined,
      });
      notificarSucesso("Atendimento reagendado.");
      setMover(null);
      carregar();
    } catch (err) {
      // conflito e falta de permissão voltam do banco com mensagem própria
      notificarErro(err instanceof Error ? err.message : "Não foi possível reagendar.");
      setMover(null);
    } finally {
      setMovendo(false);
    }
  }

  function navegar(direcao: -1 | 1) {
    if (filtros.visao === "mes") {
      const nova = new Date(referencia.getFullYear(), referencia.getMonth() + direcao, 1);
      atualizarFiltros({ data: paraISODia(nova) });
      return;
    }
    const passo = filtros.visao === "semana" ? 7 : 1;
    atualizarFiltros({ data: paraISODia(somarDias(referencia, direcao * passo)) });
  }

  const eventos = agenda?.eventos ?? [];
  const primeiraCarga = agenda === null;
  const diasDaGrade =
    filtros.visao === "semana"
      ? Array.from({ length: 7 }, (_, i) => somarDias(inicioDaSemana(referencia), i))
      : [inicioDoDia(referencia)];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Agenda</h1>
          <p className="mt-1 text-sm text-text-secondary" aria-live="polite">
            {primeiraCarga
              ? "Carregando…"
              : `${eventos.length} ${eventos.length === 1 ? "atendimento" : "atendimentos"} no período`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border">
            <button
              onClick={() => navegar(-1)}
              aria-label="Período anterior"
              className="rounded-l-lg px-2 py-2 text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => atualizarFiltros({ data: paraISODia(new Date()) })}
              className="border-x border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              Hoje
            </button>
            <button
              onClick={() => navegar(1)}
              aria-label="Próximo período"
              className="rounded-r-lg px-2 py-2 text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {podeAgendar && (
            <button
              onClick={() => abrirNovo()}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <CalendarPlus size={16} aria-hidden="true" /> Agendar OS
            </button>
          )}

          <div className="flex overflow-hidden rounded-lg border border-border" role="tablist" aria-label="Visão da agenda">
            {VISOES.map((v) => (
              <button
                key={v.valor}
                role="tab"
                aria-selected={filtros.visao === v.valor}
                onClick={() => atualizarFiltros({ visao: v.valor })}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  filtros.visao === v.valor
                    ? "bg-accent-muted text-text-primary"
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                }`}
              >
                {v.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="font-display text-base font-medium text-text-primary">
          {rotuloDoPeriodo(filtros.visao, referencia)}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="agenda-tecnico">
            Técnico
          </label>
          <select
            id="agenda-tecnico"
            value={filtros.tecnico}
            onChange={(e) => atualizarFiltros({ tecnico: e.target.value })}
            className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Todos os técnicos</option>
            {(agenda?.tecnicos ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="agenda-equipe">
            Equipe
          </label>
          <select
            id="agenda-equipe"
            value={filtros.equipe}
            onChange={(e) => atualizarFiltros({ equipe: e.target.value })}
            className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Todas as equipes</option>
            {(agenda?.equipes ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={filtros.incluirCancelados}
              onChange={(e) => atualizarFiltros({ incluirCancelados: e.target.checked })}
              className="h-4 w-4 rounded border-border bg-panel accent-accent"
            />
            Cancelados
          </label>
        </div>
      </div>

      {erro && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button
            onClick={carregar}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
          >
            <RefreshCw size={12} aria-hidden="true" /> Tentar novamente
          </button>
        </div>
      )}

      <div className={`mt-4 transition-opacity ${carregando && !primeiraCarga ? "opacity-60" : ""}`} aria-busy={carregando}>
        {primeiraCarga && !erro ? (
          <div className="h-[520px] animate-pulse rounded-xl border border-border bg-panel" aria-hidden="true" />
        ) : agenda ? (
          <>
            {eventos.length === 0 && filtros.visao !== "mes" && (
              <div className="mb-3 flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-text-muted">
                  <CalendarDays size={20} aria-hidden="true" />
                </div>
                <p className="font-display text-sm font-medium text-text-primary">Nenhum atendimento no período.</p>
                <p className="max-w-sm text-sm text-text-secondary">
                  Agende uma ordem de serviço para ela aparecer aqui.
                </p>
                {podeAgendar && (
                  <button
                    onClick={() => abrirNovo()}
                    className="mt-1 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    <CalendarPlus size={16} aria-hidden="true" /> Agendar OS
                  </button>
                )}
              </div>
            )}

            {(filtros.visao === "dia" || filtros.visao === "semana") && (
              <GradeTempo
                dias={diasDaGrade}
                eventos={eventos}
                aoAbrir={abrirEvento}
                aoMover={podeAgendar ? (evento, inicio) => setMover({ evento, inicio }) : undefined}
                aoEscolherHorario={podeAgendar ? abrirNovo : undefined}
              />
            )}

            {filtros.visao === "mes" && (
              <GradeMes
                inicio={inicioDaGradeDoMes(referencia)}
                mesReferencia={referencia.getMonth()}
                eventos={eventos}
                aoEscolherDia={(dia) => atualizarFiltros({ visao: "dia", data: paraISODia(dia) })}
              />
            )}

            {filtros.visao === "tecnicos" && (
              <ListaPorResponsavel
                responsaveis={agenda.tecnicos}
                eventos={eventos}
                campo="tecnico"
                rotuloVazio="Nenhum técnico ativo cadastrado."
                aoAbrir={abrirEvento}
              />
            )}

            {filtros.visao === "equipes" && (
              <ListaPorResponsavel
                responsaveis={agenda.equipes}
                eventos={eventos}
                campo="equipe"
                rotuloVazio="Nenhuma equipe ativa cadastrada."
                aoAbrir={abrirEvento}
              />
            )}
          </>
        ) : null}
      </div>

      <AgendamentoPanel
        aberto={painel.aberto}
        evento={painel.evento}
        sugestao={painel.sugestao}
        apoio={{ tecnicos: agenda?.tecnicos ?? [], equipes: agenda?.equipes ?? [] }}
        onFechar={() => setPainel({ aberto: false, evento: null, sugestao: null })}
        onSalvo={() => {
          setPainel({ aberto: false, evento: null, sugestao: null });
          carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!mover}
        titulo="Alterar o horário do atendimento?"
        descricao={
          mover
            ? `${mover.evento.numero ?? "O atendimento"} passa para ${mover.inicio.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              })} às ${mover.inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
            : ""
        }
        textoConfirmar="Reagendar"
        processando={movendo}
        onConfirmar={confirmarMover}
        onCancelar={() => setMover(null)}
      />
    </div>
  );
}
