import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import {
  atualizarStatus,
  criarStatus,
  definirStatusAtivo,
  definirStatusInicial,
  excluirStatus,
  listarStatusConfig,
  obterUsoConfiguracaoOS,
  reordenarStatus,
} from "./configuracaoOsService";
import {
  CATEGORIAS_ESSENCIAIS,
  CATEGORIAS_STATUS,
  COR_HEX,
  CORES_CONFIGURACAO,
  ROTULO_CATEGORIA_STATUS,
  type CategoriaStatus,
  type DadosStatusForm,
  type StatusOSConfig,
  type UsoConfiguracaoOS,
} from "./tipos";
import { ListaOrdenavel } from "./components/ListaOrdenavel";
import { SeletorCor } from "./components/SeletorCor";
import { Selo, StatusOSBadge } from "./components/Indicadores";

export function StatusOsPage() {
  const { notificarSucesso, notificarErro } = useToast();

  const [status, setStatus] = useState<StatusOSConfig[] | null>(null);
  const [uso, setUso] = useState<UsoConfiguracaoOS | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [reordenando, setReordenando] = useState(false);
  const [painel, setPainel] = useState<{ aberto: boolean; item: StatusOSConfig | null }>({ aberto: false, item: null });
  const [excluir, setExcluir] = useState<StatusOSConfig | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [lista, dadosUso] = await Promise.all([listarStatusConfig(), obterUsoConfiguracaoOS()]);
      setStatus(lista);
      setUso(dadosUso);
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar os status.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const usoTotal = (id: string) => uso?.status[id] ?? 0;
  const osAtuais = (id: string) => uso?.status_os_atuais[id] ?? 0;
  const ultimoAtivoEssencial = (s: StatusOSConfig) =>
    s.ativo &&
    CATEGORIAS_ESSENCIAIS.includes(s.categoria) &&
    !(status ?? []).some((o) => o.id !== s.id && o.ativo && o.categoria === s.categoria);

  async function mover(indice: number, direcao: -1 | 1) {
    if (!status || reordenando) return;
    const destino = indice + direcao;
    if (destino < 0 || destino >= status.length) return;
    const nova = [...status];
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    setStatus(nova);
    setReordenando(true);
    try {
      await reordenarStatus(nova.map((s) => s.id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível reordenar.");
      await carregar();
    } finally {
      setReordenando(false);
    }
  }

  async function executar(id: string, acao: () => Promise<void>, sucesso: string) {
    setProcessandoId(id);
    try {
      await acao();
      notificarSucesso(sucesso);
      await carregar();
      return true;
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
      return false;
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-base font-semibold text-text-primary">Status da OS</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Defina as etapas do atendimento na ordem em que acontecem. Nomes e cores são livres; a categoria diz ao
            sistema como tratar cada etapa nos indicadores e nas permissões.
          </p>
        </div>
        <button
          onClick={() => setPainel({ aberto: true, item: null })}
          disabled={!status}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> Novo status
        </button>
      </div>

      <details className="rounded-xl border border-border bg-panel px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-text-secondary">Como funcionam as categorias</summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {CATEGORIAS_STATUS.map((c) => (
            <div key={c.valor}>
              <dt className="font-medium text-text-primary">{c.rotulo}</dt>
              <dd className="text-xs text-text-muted">{c.descricao}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-text-muted">
          O status <strong className="text-text-secondary">inicial</strong> é aplicado às OS novas. A empresa sempre mantém
          ao menos um status ativo nas categorias Aberta, Em andamento, Finalizada e Cancelada.
        </p>
      </details>

      {erroCarga ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          {erroCarga}
          <button onClick={carregar} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5">
            Tentar novamente
          </button>
        </div>
      ) : status === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <ListaOrdenavel
          itens={status}
          rotulo="Status da OS na ordem do fluxo"
          processandoId={processandoId}
          bloqueada={reordenando || processandoId !== null}
          onMover={mover}
          onEditar={(item) => setPainel({ aberto: true, item })}
          selos={(s) => (
            <>
              {s.inicial && <Selo tom="destaque">Inicial</Selo>}
              {!s.ativo && <Selo tom="apagado">Inativo</Selo>}
            </>
          )}
          detalhe={(s) => (
            <>
              {ROTULO_CATEGORIA_STATUS[s.categoria]} · {osAtuais(s.id)} OS neste status
            </>
          )}
          acoes={(s) => {
            const essencial = ultimoAtivoEssencial(s);
            const ocupado = processandoId !== null;
            return (
              <>
                {s.ativo && !s.inicial && s.categoria === "aberto" && (
                  <button
                    onClick={() => executar(s.id, () => definirStatusInicial(s.id), `"${s.nome}" agora é o status inicial.`)}
                    disabled={ocupado}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-50"
                  >
                    Tornar inicial
                  </button>
                )}
                <button
                  onClick={() =>
                    executar(s.id, () => definirStatusAtivo(s.id, !s.ativo), s.ativo ? "Status desativado." : "Status reativado.")
                  }
                  disabled={ocupado || (s.ativo && (s.inicial || essencial))}
                  title={
                    s.ativo && s.inicial
                      ? "Defina outro status inicial antes"
                      : s.ativo && essencial
                        ? "Único status ativo desta categoria"
                        : undefined
                  }
                  className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {s.ativo ? "Desativar" : "Reativar"}
                </button>
                <button
                  onClick={() => setExcluir(s)}
                  disabled={ocupado || s.inicial || essencial || usoTotal(s.id) > 0}
                  title={usoTotal(s.id) > 0 ? "Já usado em OS: desative em vez de excluir" : undefined}
                  aria-label={`Excluir ${s.nome}`}
                  className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </>
            );
          }}
        />
      )}

      <StatusFormPanel
        aberto={painel.aberto}
        item={painel.item}
        emUso={painel.item ? usoTotal(painel.item.id) > 0 : false}
        categoriaTravada={painel.item ? ultimoAtivoEssencial(painel.item) || painel.item.inicial : false}
        onFechar={() => setPainel((p) => ({ ...p, aberto: false }))}
        onSalvo={async () => {
          setPainel((p) => ({ ...p, aberto: false }));
          await carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir status?"
        descricao={`"${excluir?.nome}" será removido. Nenhuma OS usou este status.`}
        textoConfirmar="Excluir"
        processando={!!excluir && processandoId === excluir.id}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (!excluir) return;
          executar(excluir.id, () => excluirStatus(excluir.id), "Status excluído.").then(() => setExcluir(null));
        }}
      />
    </div>
  );
}

interface StatusFormPanelProps {
  aberto: boolean;
  item: StatusOSConfig | null;
  /** já usado em OS: a categoria não pode mudar */
  emUso: boolean;
  /** inicial ou último ativo de uma categoria essencial */
  categoriaTravada: boolean;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}

function StatusFormPanel({ aberto, item, emUso, categoriaTravada, onFechar, onSalvo }: StatusFormPanelProps) {
  const { company } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState<DadosStatusForm>({ nome: "", categoria: "aberto", cor: CORES_CONFIGURACAO[0] });
  const [erros, setErros] = useState<{ nome?: string; cor?: string }>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm(item ? { nome: item.nome, categoria: item.categoria, cor: item.cor } : { nome: "", categoria: "aberto", cor: CORES_CONFIGURACAO[0] });
    setErros({});
  }, [aberto, item]);

  const bloqueioCategoria = !!item && (emUso || categoriaTravada);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !company) return;
    const novosErros: typeof erros = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome do status.";
    else if (form.nome.trim().length > 40) novosErros.nome = "Use até 40 caracteres.";
    if (!COR_HEX.test(form.cor)) novosErros.cor = "Use uma cor no formato #RRGGBB.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      if (item) {
        await atualizarStatus(item.id, form);
        notificarSucesso("Status atualizado.");
      } else {
        await criarStatus(company.id, form);
        notificarSucesso("Status criado no fim do fluxo.");
      }
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SidePanel
      aberto={aberto}
      onFechar={() => !salvando && onFechar()}
      titulo={item ? "Editar status" : "Novo status"}
      subtitulo={item ? `Chave interna: ${item.chave}` : "Entra no fim do fluxo; reordene depois se precisar."}
    >
      <form onSubmit={salvar} className="flex flex-col gap-5" noValidate>
        <Field
          id="status_nome"
          label="Nome"
          maxLength={40}
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          erro={erros.nome}
          autoFocus
        />

        <fieldset disabled={bloqueioCategoria}>
          <legend className="mb-1.5 text-sm font-medium text-text-secondary">Categoria</legend>
          {bloqueioCategoria && (
            <p className="mb-2 text-xs text-text-muted">
              {emUso
                ? "Este status já foi usado em OS, então a categoria não muda. Para outra categoria, crie um novo status."
                : item?.inicial
                  ? "O status inicial precisa ser da categoria Aberta."
                  : "É o único status ativo desta categoria, que o sistema precisa."}
            </p>
          )}
          <div role="radiogroup" className="flex flex-col gap-1.5">
            {CATEGORIAS_STATUS.map((c) => {
              const marcada = form.categoria === c.valor;
              return (
                <label
                  key={c.valor}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                    marcada ? "border-accent bg-accent-muted" : "border-border hover:bg-white/5"
                  } ${bloqueioCategoria ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name="status_categoria"
                    value={c.valor}
                    checked={marcada}
                    onChange={() => setForm({ ...form, categoria: c.valor as CategoriaStatus })}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block text-sm text-text-primary">{c.rotulo}</span>
                    <span className="block text-xs text-text-muted">{c.descricao}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <SeletorCor id="status_cor" valor={form.cor} onAlterar={(cor) => setForm({ ...form, cor })} erro={erros.cor} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-text-secondary">Prévia</p>
          <StatusOSBadge nome={form.nome.trim() || "Nome do status"} cor={COR_HEX.test(form.cor) ? form.cor : null} />
        </div>

        <div className="sticky -bottom-6 -mx-6 mt-2 flex justify-end gap-3 border-t border-border bg-panel px-6 py-4">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {item ? "Salvar alterações" : "Criar status"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
