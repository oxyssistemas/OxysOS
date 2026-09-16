import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Users2, X } from "lucide-react";
import { formatarDocumento, maskPhone } from "@oxys/shared/masks";
import { useCompany } from "../context/CompanyContext";
import { ITENS_POR_PAGINA, listarClientes, listarTagsClientes } from "./clientesService";
import type { ClienteListagem, FiltroStatusCliente, FiltrosClientes, TipoPessoa } from "./tipos";
import { ClienteFormPanel } from "./components/ClienteFormPanel";
import { StatusCliente, TipoClienteBadge } from "./components/StatusCliente";

function filtrosDaUrl(params: URLSearchParams): FiltrosClientes {
  const status = params.get("status");
  const tipo = params.get("tipo");
  const pagina = Number(params.get("pagina"));
  return {
    busca: params.get("q") ?? "",
    status: status === "arquivados" || status === "todos" ? status : "ativos",
    tipo: tipo === "pf" || tipo === "pj" ? tipo : "",
    tag: params.get("tag") ?? "",
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

function contato(c: ClienteListagem): string {
  const telefone = c.telefone || c.whatsapp;
  return telefone ? maskPhone(telefone) : c.email ?? "";
}

function cidade(c: ClienteListagem): string {
  const e = c.cliente_enderecos[0];
  return e ? `${e.cidade}/${e.estado}` : "";
}

export function ClientesPage() {
  const { can } = useCompany();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);

  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const [clientes, setClientes] = useState<ClienteListagem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const requisicao = useRef(0);

  const atualizarFiltros = useCallback(
    (parcial: Partial<FiltrosClientes>) => {
      const novo = { ...filtros, pagina: 1, ...parcial };
      const p = new URLSearchParams();
      if (novo.busca) p.set("q", novo.busca);
      if (novo.status !== "ativos") p.set("status", novo.status);
      if (novo.tipo) p.set("tipo", novo.tipo);
      if (novo.tag) p.set("tag", novo.tag);
      if (novo.pagina > 1) p.set("pagina", String(novo.pagina));
      setParams(p, { replace: true });
    },
    [filtros, setParams],
  );

  // busca com debounce
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
      const resultado = await listarClientes(filtros);
      if (id !== requisicao.current) return;
      const totalPaginas = Math.max(1, Math.ceil(resultado.total / ITENS_POR_PAGINA));
      if (filtros.pagina > totalPaginas) {
        atualizarFiltros({ pagina: totalPaginas });
        return;
      }
      setClientes(resultado.clientes);
      setTotal(resultado.total);
    } catch (e) {
      if (id === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar clientes.");
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [filtros, atualizarFiltros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    listarTagsClientes().then(setTags);
  }, []);

  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
  const temFiltro = !!(filtros.busca || filtros.tipo || filtros.tag || filtros.status !== "ativos");
  const primeiraCarga = clientes === null;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Clientes</h1>
          <p className="mt-1 text-sm text-text-secondary" aria-live="polite">
            {primeiraCarga ? "Carregando…" : `${total.toLocaleString("pt-BR")} ${total === 1 ? "cliente" : "clientes"}`}
          </p>
        </div>
        {can("customers.create") && (
          <button
            onClick={() => setFormAberto(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={16} aria-hidden="true" />
            Novo cliente
          </button>
        )}
      </div>

      {/* Filtros: uma linha acima da lista */}
      <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <label htmlFor="busca-clientes" className="sr-only">
            Buscar clientes
          </label>
          <input
            id="busca-clientes"
            type="search"
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, e-mail ou telefone"
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
        <div className="grid grid-cols-3 gap-2 md:flex">
          <label className="sr-only" htmlFor="filtro-status">Status</label>
          <select
            id="filtro-status"
            value={filtros.status}
            onChange={(e) => atualizarFiltros({ status: e.target.value as FiltroStatusCliente })}
            className="rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary"
          >
            <option value="ativos">Ativos</option>
            <option value="arquivados">Arquivados</option>
            <option value="todos">Todos</option>
          </select>
          <label className="sr-only" htmlFor="filtro-tipo">Tipo</label>
          <select
            id="filtro-tipo"
            value={filtros.tipo}
            onChange={(e) => atualizarFiltros({ tipo: e.target.value as TipoPessoa | "" })}
            className="rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary"
          >
            <option value="">PF e PJ</option>
            <option value="pf">Pessoa física</option>
            <option value="pj">Pessoa jurídica</option>
          </select>
          <label className="sr-only" htmlFor="filtro-tag">Tag</label>
          <select
            id="filtro-tag"
            value={filtros.tag}
            onChange={(e) => atualizarFiltros({ tag: e.target.value })}
            className="rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary"
          >
            <option value="">Todas as tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
          <div className="overflow-hidden rounded-xl border border-border bg-panel" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-white/5" />
                <div className="h-3.5 w-1/5 animate-pulse rounded bg-white/5" />
                <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : clientes && clientes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
              <Users2 size={22} aria-hidden="true" />
            </div>
            <p className="font-display text-sm font-medium text-text-primary">
              {temFiltro ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado."}
            </p>
            <p className="max-w-xs text-sm text-text-secondary">
              {temFiltro ? "Revise a busca ou os filtros aplicados." : "Cadastre seus clientes para abrir ordens de serviço."}
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
              can("customers.create") && (
                <button
                  onClick={() => setFormAberto(true)}
                  className="mt-1 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  <Plus size={16} aria-hidden="true" /> Cadastrar primeiro cliente
                </button>
              )
            )}
          </div>
        ) : clientes ? (
          <>
            {/* Desktop/tablet: tabela */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-panel md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-5 py-3 font-medium">Cliente</th>
                    <th scope="col" className="px-5 py-3 font-medium">Documento</th>
                    <th scope="col" className="px-5 py-3 font-medium">Contato</th>
                    <th scope="col" className="hidden px-5 py-3 font-medium lg:table-cell">Cidade</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/app/customers/${c.id}`)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <TipoClienteBadge tipo={c.tipo_pessoa} />
                          <Link
                            to={`/app/customers/${c.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-text-primary hover:text-accent"
                          >
                            {c.nome}
                          </Link>
                        </div>
                        {c.tipo_pessoa === "pj" && c.razao_social && c.razao_social !== c.nome && (
                          <p className="mt-0.5 text-xs text-text-muted">{c.razao_social}</p>
                        )}
                        {c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.slice(0, 3).map((t) => (
                              <span key={t} className="rounded bg-white/5 px-1.5 text-[11px] text-text-secondary">
                                {t}
                              </span>
                            ))}
                            {c.tags.length > 3 && <span className="text-[11px] text-text-muted">+{c.tags.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-text-secondary">
                        {formatarDocumento(c.documento, c.tipo_pessoa) || <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">{contato(c) || <span className="text-text-muted">—</span>}</td>
                      <td className="hidden px-5 py-3.5 text-text-secondary lg:table-cell">
                        {cidade(c) || <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusCliente arquivado={!!c.arquivado_em} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cartões */}
            <ul className="flex flex-col gap-2 md:hidden">
              {clientes.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/app/customers/${c.id}`}
                    className="block rounded-xl border border-border bg-panel p-4 active:bg-white/[0.03]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <TipoClienteBadge tipo={c.tipo_pessoa} />
                          <p className="truncate font-medium text-text-primary">{c.nome}</p>
                        </div>
                        {c.documento && (
                          <p className="mt-1 text-xs tabular-nums text-text-muted">{formatarDocumento(c.documento, c.tipo_pessoa)}</p>
                        )}
                      </div>
                      <StatusCliente arquivado={!!c.arquivado_em} />
                    </div>
                    {(contato(c) || cidade(c)) && (
                      <p className="mt-2 text-sm text-text-secondary">
                        {[contato(c), cidade(c)].filter(Boolean).join(" · ")}
                      </p>
                    )}
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

      <ClienteFormPanel
        aberto={formAberto}
        onFechar={() => setFormAberto(false)}
        onSalvo={(id) => {
          setFormAberto(false);
          navigate(`/app/customers/${id}`);
        }}
      />
    </div>
  );
}
