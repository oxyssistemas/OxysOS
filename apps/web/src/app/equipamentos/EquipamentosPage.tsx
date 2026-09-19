import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, HardDrive, Plus, RefreshCw, Search, Tags, X } from "lucide-react";
import type { ItemCatalogo } from "@/components/CatalogoSimplesPanel";
import { useCompany } from "../context/CompanyContext";
import { EQUIPAMENTOS_POR_PAGINA, listarCategorias, listarEquipamentos } from "./equipamentosService";
import {
  ROTULO_STATUS_EQUIPAMENTO,
  type EquipamentoListagem,
  type FiltroArquivoEquipamento,
  type FiltroGarantia,
  type FiltrosEquipamentos,
  type StatusEquipamento,
} from "./tipos";
import { GarantiaInfo, StatusEquipamentoBadge } from "./components/Indicadores";
import { EquipamentoFormPanel } from "./components/EquipamentoFormPanel";
import { CategoriasEquipamentoPanel } from "./components/CategoriasEquipamentoPanel";

const STATUS_VALIDOS: StatusEquipamento[] = ["operacional", "em_manutencao", "fora_de_operacao"];
const GARANTIAS_VALIDAS: FiltroGarantia[] = ["vigente", "vencendo", "vencida", "sem"];

function filtrosDaUrl(params: URLSearchParams): FiltrosEquipamentos {
  const arquivo = params.get("arquivo");
  const status = params.get("status") as StatusEquipamento | null;
  const garantia = params.get("garantia") as FiltroGarantia | null;
  const pagina = Number(params.get("pagina"));
  return {
    busca: params.get("q") ?? "",
    arquivo: arquivo === "arquivados" || arquivo === "todos" ? arquivo : "ativos",
    status: status && STATUS_VALIDOS.includes(status) ? status : "",
    categoria: params.get("categoria") ?? "",
    cliente: params.get("cliente") ?? "",
    garantia: garantia && GARANTIAS_VALIDAS.includes(garantia) ? garantia : "",
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

function descricaoModelo(e: EquipamentoListagem): string {
  return [e.marca, e.modelo].filter(Boolean).join(" ");
}

const classeFiltro = "rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary";

export function EquipamentosPage() {
  const { can } = useCompany();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);

  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const [equipamentos, setEquipamentos] = useState<EquipamentoListagem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [categorias, setCategorias] = useState<ItemCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [categoriasAberto, setCategoriasAberto] = useState(false);
  const requisicao = useRef(0);

  const atualizarFiltros = useCallback(
    (parcial: Partial<FiltrosEquipamentos>) => {
      const novo = { ...filtros, pagina: 1, ...parcial };
      const p = new URLSearchParams();
      if (novo.busca) p.set("q", novo.busca);
      if (novo.arquivo !== "ativos") p.set("arquivo", novo.arquivo);
      if (novo.status) p.set("status", novo.status);
      if (novo.categoria) p.set("categoria", novo.categoria);
      if (novo.cliente) p.set("cliente", novo.cliente);
      if (novo.garantia) p.set("garantia", novo.garantia);
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
      const r = await listarEquipamentos(filtros);
      if (id !== requisicao.current) return;
      if (r.equipamentos.length === 0 && filtros.pagina > 1) {
        atualizarFiltros({ pagina: 1 });
        return;
      }
      setEquipamentos(r.equipamentos);
      setTotal(r.total);
    } catch (e) {
      if (id === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar equipamentos.");
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [filtros, atualizarFiltros]);

  const carregarCategorias = useCallback(() => {
    listarCategorias().then(setCategorias).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarCategorias();
  }, [carregarCategorias]);

  const totalPaginas = Math.max(1, Math.ceil(total / EQUIPAMENTOS_POR_PAGINA));
  const temFiltro = !!(filtros.busca || filtros.status || filtros.categoria || filtros.cliente || filtros.garantia || filtros.arquivo !== "ativos");
  const primeiraCarga = equipamentos === null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Equipamentos</h1>
          <p className="mt-1 text-sm text-text-secondary" aria-live="polite">
            {primeiraCarga ? "Carregando…" : `${total.toLocaleString("pt-BR")} ${total === 1 ? "equipamento" : "equipamentos"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("assets.edit") && (
            <button
              onClick={() => setCategoriasAberto(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              <Tags size={16} aria-hidden="true" /> Categorias
            </button>
          )}
          {can("assets.create") && (
            <button
              onClick={() => setFormAberto(true)}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Plus size={16} aria-hidden="true" /> Novo equipamento
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <label htmlFor="busca-equipamentos" className="sr-only">
            Buscar equipamentos
          </label>
          <input
            id="busca-equipamentos"
            type="search"
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
            placeholder="Buscar por nome, marca, modelo, nº de série, localização ou cliente"
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="sr-only" htmlFor="filtro-eq-arquivo">Ativos ou arquivados</label>
          <select
            id="filtro-eq-arquivo"
            value={filtros.arquivo}
            onChange={(e) => atualizarFiltros({ arquivo: e.target.value as FiltroArquivoEquipamento })}
            className={classeFiltro}
          >
            <option value="ativos">Ativos</option>
            <option value="arquivados">Arquivados</option>
            <option value="todos">Todos</option>
          </select>
          <label className="sr-only" htmlFor="filtro-eq-status">Situação</label>
          <select
            id="filtro-eq-status"
            value={filtros.status}
            onChange={(e) => atualizarFiltros({ status: e.target.value as StatusEquipamento | "" })}
            className={classeFiltro}
          >
            <option value="">Todas as situações</option>
            {STATUS_VALIDOS.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_EQUIPAMENTO[s]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-eq-categoria">Categoria</label>
          <select
            id="filtro-eq-categoria"
            value={filtros.categoria}
            onChange={(e) => atualizarFiltros({ categoria: e.target.value })}
            className={classeFiltro}
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {!c.ativo ? " (inativa)" : ""}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filtro-eq-garantia">Garantia</label>
          <select
            id="filtro-eq-garantia"
            value={filtros.garantia}
            onChange={(e) => atualizarFiltros({ garantia: e.target.value as FiltroGarantia })}
            className={classeFiltro}
          >
            <option value="">Qualquer garantia</option>
            <option value="vigente">Garantia vigente</option>
            <option value="vencendo">Vence em até 30 dias</option>
            <option value="vencida">Garantia vencida</option>
            <option value="sem">Sem garantia registrada</option>
          </select>
        </div>
        {filtros.cliente && (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            Filtrando por um cliente específico.
            <button onClick={() => atualizarFiltros({ cliente: "" })} className="font-medium text-accent hover:text-accent-hover">
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
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                <div className="h-3.5 w-1/4 animate-pulse rounded bg-white/5" />
                <div className="h-3.5 w-1/5 animate-pulse rounded bg-white/5" />
                <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : equipamentos && equipamentos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
              <HardDrive size={22} aria-hidden="true" />
            </div>
            <p className="font-display text-sm font-medium text-text-primary">
              {temFiltro ? "Nenhum equipamento encontrado." : "Nenhum equipamento cadastrado."}
            </p>
            <p className="max-w-xs text-sm text-text-secondary">
              {temFiltro
                ? "Revise a busca ou os filtros aplicados."
                : "Cadastre os equipamentos dos seus clientes para acompanhar garantia e histórico de atendimentos."}
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
              can("assets.create") && (
                <button
                  onClick={() => setFormAberto(true)}
                  className="mt-1 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  <Plus size={16} aria-hidden="true" /> Cadastrar primeiro equipamento
                </button>
              )
            )}
          </div>
        ) : equipamentos ? (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-panel md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-5 py-3 font-medium">Equipamento</th>
                    <th scope="col" className="px-5 py-3 font-medium">Cliente</th>
                    <th scope="col" className="hidden px-5 py-3 font-medium lg:table-cell">Categoria</th>
                    <th scope="col" className="px-5 py-3 font-medium">Garantia</th>
                    <th scope="col" className="px-5 py-3 font-medium">Situação</th>
                    <th scope="col" className="hidden px-5 py-3 text-right font-medium xl:table-cell">OS</th>
                  </tr>
                </thead>
                <tbody>
                  {equipamentos.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => navigate(`/app/assets/${e.id}`)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/app/assets/${e.id}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="font-medium text-text-primary hover:text-accent"
                        >
                          {e.nome}
                        </Link>
                        <p className="text-xs text-text-muted">
                          {[descricaoModelo(e), e.numero_serie && `S/N ${e.numero_serie}`].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">
                        <p>{e.cliente.nome}</p>
                        {e.endereco && (
                          <p className="text-xs text-text-muted">
                            {e.endereco.rotulo} · {e.endereco.cidade}/{e.endereco.estado}
                          </p>
                        )}
                      </td>
                      <td className="hidden px-5 py-3.5 text-text-secondary lg:table-cell">
                        {e.categoria?.nome ?? <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <GarantiaInfo garantiaAte={e.garantia_ate} compacto />
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusEquipamentoBadge status={e.status} arquivado={!!e.arquivado_em} />
                      </td>
                      <td className="hidden px-5 py-3.5 text-right tabular-nums text-text-primary xl:table-cell">{e.total_os}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {equipamentos.map((e) => (
                <li key={e.id}>
                  <Link to={`/app/assets/${e.id}`} className="block rounded-xl border border-border bg-panel p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{e.nome}</p>
                        <p className="truncate text-sm text-text-secondary">{e.cliente.nome}</p>
                      </div>
                      <StatusEquipamentoBadge status={e.status} arquivado={!!e.arquivado_em} />
                    </div>
                    {(descricaoModelo(e) || e.categoria) && (
                      <p className="mt-1 text-xs text-text-muted">
                        {[e.categoria?.nome, descricaoModelo(e)].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-2 text-xs">
                      <GarantiaInfo garantiaAte={e.garantia_ate} compacto />
                    </p>
                  </Link>
                </li>
              ))}
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

      <EquipamentoFormPanel
        aberto={formAberto}
        equipamentoId={null}
        onFechar={() => setFormAberto(false)}
        onSalvo={(id) => {
          setFormAberto(false);
          navigate(`/app/assets/${id}`);
        }}
      />

      {can("assets.edit") && (
        <CategoriasEquipamentoPanel
          aberto={categoriasAberto}
          onFechar={() => setCategoriasAberto(false)}
          onAlterado={() => {
            carregarCategorias();
            carregar();
          }}
        />
      )}
    </div>
  );
}
