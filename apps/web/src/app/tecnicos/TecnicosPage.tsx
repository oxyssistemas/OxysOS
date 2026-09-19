import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Wrench,
  X,
} from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { maskPhone } from "@oxys/shared/masks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import {
  TECNICOS_POR_PAGINA,
  definirTecnicoAtivo,
  listarEspecialidades,
  listarTecnicos,
} from "./tecnicosService";
import { nomeCompleto, type Especialidade, type FiltroStatusTecnico, type FiltrosTecnicos, type TecnicoListagem } from "./tipos";
import { TecnicoFormPanel } from "./components/TecnicoFormPanel";
import { EspecialidadesPanel } from "./components/EspecialidadesPanel";

function filtrosDaUrl(params: URLSearchParams): FiltrosTecnicos {
  const status = params.get("status");
  const pagina = Number(params.get("pagina"));
  return {
    busca: params.get("q") ?? "",
    status: status === "inativos" || status === "todos" ? status : "ativos",
    especialidade: params.get("especialidade") ?? "",
    pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
  };
}

function StatusTecnico({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      <CheckCircle2 size={12} aria-hidden="true" /> Ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
      <CircleSlash size={12} aria-hidden="true" /> Inativo
    </span>
  );
}

function ChipsEspecialidades({ tecnico, max = 3 }: { tecnico: TecnicoListagem; max?: number }) {
  if (tecnico.especialidades.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tecnico.especialidades.slice(0, max).map((e) => (
        <span
          key={e.id}
          className={`rounded bg-white/5 px-1.5 py-0.5 text-[11px] ${e.ativo ? "text-text-secondary" : "text-text-muted line-through"}`}
        >
          {e.nome}
        </span>
      ))}
      {tecnico.especialidades.length > max && (
        <span className="text-[11px] text-text-muted">+{tecnico.especialidades.length - max}</span>
      )}
    </div>
  );
}

export function TecnicosPage() {
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);
  const podeGerenciar = can("technicians.manage");

  const [buscaDigitada, setBuscaDigitada] = useState(filtros.busca);
  const [tecnicos, setTecnicos] = useState<TecnicoListagem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [painel, setPainel] = useState<{ aberto: boolean; tecnicoId: string | null }>({ aberto: false, tecnicoId: null });
  const [painelEspecialidades, setPainelEspecialidades] = useState(false);
  const [alternar, setAlternar] = useState<TecnicoListagem | null>(null);
  const [processando, setProcessando] = useState(false);
  const requisicao = useRef(0);

  const atualizarFiltros = useCallback(
    (parcial: Partial<FiltrosTecnicos>) => {
      const novo = { ...filtros, pagina: 1, ...parcial };
      const p = new URLSearchParams();
      if (novo.busca) p.set("q", novo.busca);
      if (novo.status !== "ativos") p.set("status", novo.status);
      if (novo.especialidade) p.set("especialidade", novo.especialidade);
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
      const resultado = await listarTecnicos(filtros);
      if (id !== requisicao.current) return;
      if (resultado.tecnicos.length === 0 && filtros.pagina > 1) {
        atualizarFiltros({ pagina: 1 });
        return;
      }
      setTecnicos(resultado.tecnicos);
      setTotal(resultado.total);
    } catch (e) {
      if (id === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar técnicos.");
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [filtros, atualizarFiltros]);

  const carregarEspecialidades = useCallback(() => {
    listarEspecialidades().then(setEspecialidades).catch(() => setEspecialidades([]));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarEspecialidades();
  }, [carregarEspecialidades]);

  async function confirmarAlternancia() {
    if (!alternar) return;
    setProcessando(true);
    try {
      await definirTecnicoAtivo(alternar.id, alternar.versao, !alternar.ativo);
      notificarSucesso(alternar.ativo ? "Técnico desativado." : "Técnico reativado.");
      setAlternar(null);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
      setAlternar(null);
      await carregar();
    } finally {
      setProcessando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TECNICOS_POR_PAGINA));
  const temFiltro = !!(filtros.busca || filtros.especialidade || filtros.status !== "ativos");
  const primeiraCarga = tecnicos === null;

  function abrir(t: TecnicoListagem) {
    setPainel({ aberto: true, tecnicoId: t.id });
  }

  const acoes = (t: TecnicoListagem) =>
    podeGerenciar && (
      <div className="flex justify-end gap-3 text-xs">
        <button
          onClick={(e) => {
            e.stopPropagation();
            abrir(t);
          }}
          className="font-medium text-text-secondary hover:text-text-primary"
        >
          Editar
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAlternar(t);
          }}
          className="font-medium text-text-secondary hover:text-text-primary"
        >
          {t.ativo ? "Desativar" : "Reativar"}
        </button>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Técnicos</h1>
          <p className="mt-1 text-sm text-text-secondary" aria-live="polite">
            {primeiraCarga ? "Carregando…" : `${total.toLocaleString("pt-BR")} ${total === 1 ? "técnico" : "técnicos"}`}
          </p>
        </div>
        {podeGerenciar && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPainelEspecialidades(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
            >
              <Tags size={16} aria-hidden="true" /> Especialidades
            </button>
            <button
              onClick={() => setPainel({ aberto: true, tecnicoId: null })}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Plus size={16} aria-hidden="true" /> Novo técnico
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <label htmlFor="busca-tecnicos" className="sr-only">
            Buscar técnicos
          </label>
          <input
            id="busca-tecnicos"
            type="search"
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
            placeholder="Buscar por nome, e-mail, telefone ou CPF"
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
        <div className="grid grid-cols-2 gap-2 md:flex">
          <label className="sr-only" htmlFor="filtro-status-tecnico">Status</label>
          <select
            id="filtro-status-tecnico"
            value={filtros.status}
            onChange={(e) => atualizarFiltros({ status: e.target.value as FiltroStatusTecnico })}
            className="rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary"
          >
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          <label className="sr-only" htmlFor="filtro-especialidade">Especialidade</label>
          <select
            id="filtro-especialidade"
            value={filtros.especialidade}
            onChange={(e) => atualizarFiltros({ especialidade: e.target.value })}
            className="rounded-lg border border-border bg-panel px-3 py-2.5 text-sm text-text-primary"
          >
            <option value="">Todas as especialidades</option>
            {especialidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {!e.ativo ? " (inativa)" : ""}
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
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
                <div className="h-3.5 w-1/4 animate-pulse rounded bg-white/5" />
                <div className="h-3.5 w-1/5 animate-pulse rounded bg-white/5" />
                <div className="ml-auto h-3.5 w-20 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : tecnicos && tecnicos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-panel px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
              <Wrench size={22} aria-hidden="true" />
            </div>
            <p className="font-display text-sm font-medium text-text-primary">
              {temFiltro ? "Nenhum técnico encontrado." : "Nenhum técnico cadastrado."}
            </p>
            <p className="max-w-xs text-sm text-text-secondary">
              {temFiltro ? "Revise a busca ou os filtros aplicados." : "Cadastre sua equipe técnica para atribuir ordens de serviço."}
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
              podeGerenciar && (
                <button
                  onClick={() => setPainel({ aberto: true, tecnicoId: null })}
                  className="mt-1 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  <Plus size={16} aria-hidden="true" /> Cadastrar primeiro técnico
                </button>
              )
            )}
          </div>
        ) : tecnicos ? (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-panel md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th scope="col" className="px-5 py-3 font-medium">Técnico</th>
                    <th scope="col" className="px-5 py-3 font-medium">Contato</th>
                    <th scope="col" className="hidden px-5 py-3 font-medium lg:table-cell">Especialidades</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium" title="Em andamento ou pausadas">
                      Em andamento
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Concluídas</th>
                    {podeGerenciar && (
                      <th scope="col" className="px-5 py-3 text-right font-medium">
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tecnicos.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => abrir(t)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-3.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            abrir(t);
                          }}
                          className="flex items-center gap-2 text-left font-medium text-text-primary hover:text-accent"
                        >
                          {nomeCompleto(t)}
                          {t.usuario_id && (
                            <KeyRound size={12} className="text-text-muted" aria-label="Possui login no sistema" />
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">
                        <p>{t.telefone ? maskPhone(t.telefone) : <span className="text-text-muted">—</span>}</p>
                        {t.email && <p className="text-xs text-text-muted">{t.email}</p>}
                      </td>
                      <td className="hidden px-5 py-3.5 lg:table-cell">
                        <ChipsEspecialidades tecnico={t} />
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusTecnico ativo={t.ativo} />
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-text-primary">{t.os_em_andamento}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-text-primary">{t.os_concluidas}</td>
                      {podeGerenciar && <td className="px-5 py-3.5">{acoes(t)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {tecnicos.map((t) => (
                <li key={t.id} className="rounded-xl border border-border bg-panel p-4">
                  <button onClick={() => abrir(t)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium text-text-primary">
                        {nomeCompleto(t)}
                        {t.usuario_id && <KeyRound size={12} className="text-text-muted" aria-label="Possui login no sistema" />}
                      </p>
                      <StatusTecnico ativo={t.ativo} />
                    </div>
                    {(t.telefone || t.email) && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {[t.telefone && maskPhone(t.telefone), t.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="mt-2">
                      <ChipsEspecialidades tecnico={t} max={4} />
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      {t.os_em_andamento} em andamento · {t.os_concluidas} concluídas
                    </p>
                  </button>
                  {podeGerenciar && <div className="mt-3 border-t border-border pt-3">{acoes(t)}</div>}
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

      <TecnicoFormPanel
        aberto={painel.aberto}
        tecnicoId={painel.tecnicoId}
        onFechar={() => setPainel({ aberto: false, tecnicoId: null })}
        onSalvo={() => {
          setPainel({ aberto: false, tecnicoId: null });
          carregar();
          carregarEspecialidades();
        }}
      />

      {podeGerenciar && (
        <EspecialidadesPanel
          aberto={painelEspecialidades}
          onFechar={() => setPainelEspecialidades(false)}
          onAlterado={() => {
            carregarEspecialidades();
            carregar();
          }}
        />
      )}

      <ConfirmDialog
        aberto={!!alternar}
        tom={alternar?.ativo ? "perigo" : "neutro"}
        titulo={alternar?.ativo ? "Desativar técnico?" : "Reativar técnico?"}
        descricao={
          alternar?.ativo ? (
            <>
              {nomeCompleto(alternar)} não poderá receber novas ordens de serviço. O histórico é preservado.
              {alternar.os_em_andamento > 0 && (
                <span className="mt-2 block text-text-primary">
                  Atenção: há {alternar.os_em_andamento} OS em andamento ou pausadas com este técnico. Elas continuam
                  atribuídas a ele.
                </span>
              )}
            </>
          ) : (
            `${alternar ? nomeCompleto(alternar) : ""} voltará a poder receber ordens de serviço.`
          )
        }
        textoConfirmar={alternar?.ativo ? "Desativar" : "Reativar"}
        processando={processando}
        onConfirmar={confirmarAlternancia}
        onCancelar={() => setAlternar(null)}
      />
    </div>
  );
}
