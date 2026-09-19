import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, MapPin, Plus, RefreshCw, Search, X } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { listarStatusConfig } from "../configuracoes/configuracaoOsService";
import type { StatusOSConfig } from "../configuracoes/tipos";
import { PrioridadeBadge, StatusOSBadge } from "../configuracoes/components/Indicadores";
import { ORDENS_POR_PAGINA, listarOrdens } from "./ordensService";
import { useApoioOrdem } from "./useApoioOrdem";
import { SlaBadge } from "./components/Indicadores";
import {
  formatarAgendamento,
  formatarDataHora,
  type FiltroSla,
  type FiltrosOrdens,
  type GrupoOrdens,
  type OrdemListagem,
  type OrdenacaoOrdens,
} from "./tipos";

const GRUPOS: { valor: GrupoOrdens; rotulo: string }[] = [
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "finalizadas", rotulo: "Finalizadas" },
  { valor: "canceladas", rotulo: "Canceladas" },
  { valor: "todas", rotulo: "Todas" },
];
const SLAS: FiltroSla[] = ["atrasada", "vencendo", "no_prazo", "sem_prazo"];
const ORDENS: OrdenacaoOrdens[] = ["recentes", "prazo", "agendamento"];

function filtrosDaUrl(params: URLSearchParams): FiltrosOrdens {
  const grupo = params.get("grupo") as GrupoOrdens | null;
  const sla = params.get("sla") as FiltroSla | null;
  const ordem = params.get("ordem") as OrdenacaoOrdens | null;
  const pagina = Number(params.get("pagina"));
  return {
    busca: params.get("q") ?? "",
    grupo: grupo && GRUPOS.some((g) => g.valor === grupo) ? grupo : "abertas",
    status: params.get("status") ?? "",
    prioridade: params.get("prioridade") ?? "",
    tecnico: params.get("tecnico") ?? "",
    tipo: params.get("tipo") ?? "",
    sla: sla && SLAS.includes(sla) ? sla : "",
    ordem: ordem && ORDENS.includes(ordem) ? ordem : "recentes",
    cliente: params.get("cliente") ?? "",
    equipamento: params.get("equipamento") ?? "",
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

const classeFiltro = "rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary";

function Titulo({ os }: { os: OrdemListagem }) {
  return <>{os.titulo || os.descricao}</>;
}

export function OrdensPage() {
  const { can } = useCompany();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);
  const { apoio } = useApoioOrdem();

  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const [ordens, setOrdens] = useState<OrdemListagem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusOSConfig[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);

  const atualizarFiltros = useCallback(
    (parcial: Partial<FiltrosOrdens>) => {
      const novo = { ...filtros, pagina: 1, ...parcial };
      const p = new URLSearchParams();
      if (novo.busca) p.set("q", novo.busca);
      if (novo.grupo !== "abertas") p.set("grupo", novo.grupo);
      if (novo.status) p.set("status", novo.status);
      if (novo.prioridade) p.set("prioridade", novo.prioridade);
      if (novo.tecnico) p.set("tecnico", novo.tecnico);
      if (novo.tipo) p.set("tipo", novo.tipo);
      if (novo.sla) p.set("sla", novo.sla);
      if (novo.ordem !== "recentes") p.set("ordem", novo.ordem);
      if (novo.cliente) p.set("cliente", novo.cliente);
      if (novo.equipamento) p.set("equipamento", novo.equipamento);
      if (novo.pagina > 1) p.set("pagina", String(novo.pagina));
      setParams(p, { replace: true });
    },
    [filtros, setParams],
  );

  useEffect(() => {
    if (buscaDigitada === filtros.busca) return;
    const t = setTimeout(() => atualizarFiltros({ busca: buscaDigitada.trim() }), 350);
    return () => clearTimeout(t);
  }, [buscaDigitada, filtros.busca, atualizarFiltros]);

  const carregar = useCallback(async () => {
    const id = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await listarOrdens(filtros);
      if (id !== requisicao.current) return;
      if (r.ordens.length === 0 && filtros.pagina > 1) {
        atualizarFiltros({ pagina: 1 });
        return;
      }
      setOrdens(r.ordens);
      setTotal(r.total);
    } catch (e) {
      if (id === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar as ordens de serviço.");
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [filtros, atualizarFiltros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    listarStatusConfig().then(setStatus).catch(() => setStatus([]));
  }, []);

  const totalPaginas = Math.max(1, Math.ceil(total / ORDENS_POR_PAGINA));
  const temFiltro = !!(
    filtros.busca || filtros.status || filtros.prioridade || filtros.tecnico || filtros.tipo || filtros.sla ||
    filtros.cliente || filtros.equipamento || filtros.grupo !== "abertas"
  );
  const primeiraCarga = ordens === null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Ordens de serviço</h1>
          <p className="mt-1 text-sm text-text-secondary" aria-live="polite">
            {primeiraCarga ? "Carregando…" : `${total.toLocaleString("pt-BR")} ${total === 1 ? "ordem" : "ordens"}`}
          </p>
        </div>
        {can("service_orders.create") && (
          <Link
            to="/app/service-orders/new"
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={16} aria-hidden="true" /> Nova ordem
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="Situação das ordens" className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {GRUPOS.map((g) => (
          <button
            key={g.valor}
            role="tab"
            aria-selected={filtros.grupo === g.valor}
            onClick={() => atualizarFiltros({ grupo: g.valor, status: "" })}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              filtros.grupo === g.valor ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {g.rotulo}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <label htmlFor="busca-ordens" className="sr-only">
            Buscar ordens de serviço
          </label>
          <input
            id="busca-ordens"
            type="search"
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
            placeholder="Buscar por número, título, descrição, cliente ou equipamento"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
          {buscaDigitada && (
            <button
              onClick={() => {
                setBuscaDigitada("");
                atualizarFiltros({ busca: "" });
              }}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <label className="sr-only" htmlFor="filtro-os-status">Status</label>
          <select id="filtro-os-status" value={filtros.status} onChange={(e) => atualizarFiltros({ status: e.target.value })} className={classeFiltro}>
            <option value="">Todos os status</option>
            {status.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
                {s.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-os-prioridade">Prioridade</label>
          <select
            id="filtro-os-prioridade"
            value={filtros.prioridade}
            onChange={(e) => atualizarFiltros({ prioridade: e.target.value })}
            className={classeFiltro}
          >
            <option value="">Todas as prioridades</option>
            {(apoio?.prioridades ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          {apoio?.tecnicos && (
            <>
              <label className="sr-only" htmlFor="filtro-os-tecnico">Técnico</label>
              <select
                id="filtro-os-tecnico"
                value={filtros.tecnico}
                onChange={(e) => atualizarFiltros({ tecnico: e.target.value })}
                className={classeFiltro}
              >
                <option value="">Todos os técnicos</option>
                <option value="sem">Sem técnico</option>
                {apoio.tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="sr-only" htmlFor="filtro-os-tipo">Tipo de serviço</label>
          <select id="filtro-os-tipo" value={filtros.tipo} onChange={(e) => atualizarFiltros({ tipo: e.target.value })} className={classeFiltro}>
            <option value="">Todos os tipos</option>
            {(apoio?.tipos ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-os-sla">Prazo</label>
          <select id="filtro-os-sla" value={filtros.sla} onChange={(e) => atualizarFiltros({ sla: e.target.value as FiltroSla })} className={classeFiltro}>
            <option value="">Qualquer prazo</option>
            <option value="atrasada">Atrasadas</option>
            <option value="vencendo">Vencem em breve</option>
            <option value="no_prazo">No prazo</option>
            <option value="sem_prazo">Sem prazo</option>
          </select>
          <label className="sr-only" htmlFor="filtro-os-ordem">Ordenar por</label>
          <select
            id="filtro-os-ordem"
            value={filtros.ordem}
            onChange={(e) => atualizarFiltros({ ordem: e.target.value as OrdenacaoOrdens })}
            className={classeFiltro}
          >
            <option value="recentes">Mais recentes</option>
            <option value="prazo">Prazo mais próximo</option>
            <option value="agendamento">Agendamento</option>
          </select>
        </div>
        {(filtros.cliente || filtros.equipamento) && (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            Filtrando por {filtros.equipamento ? "um equipamento" : "um cliente"} específico.
            <button
              onClick={() => atualizarFiltros({ cliente: "", equipamento: "" })}
              className="font-medium text-accent hover:text-accent-hover"
            >
              Remover filtro
            </button>
          </p>
        )}
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
          <div className="overflow-hidden rounded-xl border border-border bg-panel" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                <div className="h-3.5 w-24 animate-pulse rounded bg-white/5" />
                <div className="h-3.5 w-1/4 animate-pulse rounded bg-white/5" />
                <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : ordens && ordens.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
              <ClipboardList size={22} aria-hidden="true" />
            </div>
            <p className="font-display text-sm font-medium text-text-primary">
              {temFiltro ? "Nenhuma ordem encontrada." : "Nenhuma ordem de serviço em aberto."}
            </p>
            <p className="max-w-xs text-sm text-text-secondary">
              {temFiltro ? "Revise a busca ou os filtros aplicados." : "As ordens abertas aparecem aqui até serem finalizadas ou canceladas."}
            </p>
            {temFiltro ? (
              <button
                onClick={() => {
                  setBuscaDigitada("");
                  setParams({}, { replace: true });
                }}
                className="text-sm font-medium text-accent hover:text-accent-hover"
              >
                Limpar filtros
              </button>
            ) : (
              can("service_orders.create") && (
                <Link
                  to="/app/service-orders/new"
                  className="mt-1 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  <Plus size={16} aria-hidden="true" /> Abrir ordem de serviço
                </Link>
              )
            )}
          </div>
        ) : ordens ? (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-panel md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-4 py-3 font-medium">Ordem</th>
                    <th scope="col" className="px-4 py-3 font-medium">Cliente</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">Tipo</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Técnico</th>
                    <th scope="col" className="px-4 py-3 font-medium">Prioridade</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Data</th>
                    <th scope="col" className="px-4 py-3 font-medium">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {ordens.map((os) => {
                    const agendamento = formatarAgendamento(os.data_agendada, os.hora_agendada);
                    return (
                      <tr
                        key={os.id}
                        onClick={() => navigate(`/app/service-orders/${os.id}`)}
                        className="cursor-pointer border-b border-border align-top transition-colors last:border-0 hover:bg-white/[0.03]"
                      >
                        <td className="max-w-[18rem] px-4 py-3">
                          <Link
                            to={`/app/service-orders/${os.id}`}
                            onClick={(ev) => ev.stopPropagation()}
                            className="font-mono text-xs font-medium text-accent hover:text-accent-hover"
                          >
                            {os.numero}
                          </Link>
                          <p className="truncate text-text-primary">
                            <Titulo os={os} />
                          </p>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <p className="max-w-[12rem] truncate">{os.cliente.nome}</p>
                          {os.local_atendimento === "externo" && (
                            <p className="flex items-center gap-1 text-xs text-text-muted">
                              <MapPin size={11} aria-hidden="true" /> Externo
                            </p>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-text-secondary xl:table-cell">
                          {os.tipo_servico?.nome ?? <span className="text-text-muted">—</span>}
                        </td>
                        <td className="hidden px-4 py-3 text-text-secondary lg:table-cell">
                          {os.tecnico?.nome ?? <span className="text-text-muted">Sem técnico</span>}
                        </td>
                        <td className="px-4 py-3">
                          {os.prioridade ? <PrioridadeBadge nome={os.prioridade.nome} cor={os.prioridade.cor} nivel={os.prioridade.nivel} /> : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusOSBadge nome={os.status.nome} cor={os.status.cor} />
                        </td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-text-secondary lg:table-cell">
                          <p>{formatarDataHora(os.criado_em)}</p>
                          {agendamento && <p className="text-text-muted">Agendada: {agendamento}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <SlaBadge sla={os.sla} prazo={os.prazo_em} compacto />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {ordens.map((os) => {
                const agendamento = formatarAgendamento(os.data_agendada, os.hora_agendada);
                return (
                  <li key={os.id}>
                    <Link to={`/app/service-orders/${os.id}`} className="block rounded-xl border border-border bg-panel p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-medium text-accent">{os.numero}</p>
                          <p className="truncate font-medium text-text-primary">
                            <Titulo os={os} />
                          </p>
                          <p className="truncate text-sm text-text-secondary">{os.cliente.nome}</p>
                        </div>
                        <StatusOSBadge nome={os.status.nome} cor={os.status.cor} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {os.prioridade && <PrioridadeBadge nome={os.prioridade.nome} cor={os.prioridade.cor} nivel={os.prioridade.nivel} />}
                        <SlaBadge sla={os.sla} prazo={os.prazo_em} compacto />
                      </div>
                      <p className="mt-2 text-xs text-text-muted">
                        {[os.tecnico?.nome ?? "Sem técnico", agendamento && `Agendada: ${agendamento}`].filter(Boolean).join(" · ")}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {totalPaginas > 1 && (
              <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginação">
                <p className="text-sm text-text-secondary">
                  Página {filtros.pagina} de {totalPaginas}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => atualizarFiltros({ pagina: filtros.pagina - 1 })}
                    disabled={filtros.pagina <= 1}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-white/5 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} aria-hidden="true" /> Anterior
                  </button>
                  <button
                    onClick={() => atualizarFiltros({ pagina: filtros.pagina + 1 })}
                    disabled={filtros.pagina >= totalPaginas}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-white/5 disabled:opacity-40"
                  >
                    Próxima <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </nav>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
