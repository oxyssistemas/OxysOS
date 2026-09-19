import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { ChavePermissao } from "../types";
import { Selo } from "../configuracoes/components/Indicadores";
import { definirCargoAtivo, excluirCargo, listarCargosPermissoes, salvarCargo } from "./equipeService";
import { ROTULO_MODULO, type CargoEquipe, type DadosCargoForm, type PermissaoCatalogo } from "./tipos";

type Painel = { cargo: CargoEquipe | null; copia: boolean } | null;

export function CargosPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [cargos, setCargos] = useState<CargoEquipe[] | null>(null);
  const [permissoes, setPermissoes] = useState<PermissaoCatalogo[]>([]);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [painel, setPainel] = useState<Painel>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<CargoEquipe | null>(null);

  const carregar = useCallback(async () => {
    try {
      const dados = await listarCargosPermissoes();
      setCargos(dados.cargos);
      setPermissoes(dados.permissoes);
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar os cargos.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function executar(id: string, acao: () => Promise<void>, sucesso: string) {
    setProcessandoId(id);
    try {
      await acao();
      notificarSucesso(sucesso);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setProcessandoId(null);
    }
  }

  const rotuloPermissao = useMemo(
    () => new Map(permissoes.map((p) => [p.chave, p.descricao])),
    [permissoes],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-text-secondary">
          O cargo define o que a pessoa faz no portal. Os cargos padrão podem ser ajustados; você também pode criar
          cargos próprios (ex.: "Supervisor técnico"). O banco confere a permissão em cada ação — a tela só esconde o
          que não é permitido.
        </p>
        <button
          onClick={() => setPainel({ cargo: null, copia: false })}
          disabled={!cargos}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> Novo cargo
        </button>
      </div>

      {erroCarga ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          {erroCarga}
          <button onClick={carregar} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5">
            Tentar novamente
          </button>
        </div>
      ) : cargos === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cargos.map((c) => {
            const ocupado = processandoId !== null;
            const dono = c.chave === "owner";
            return (
              <li key={c.id} className="rounded-xl border border-border bg-panel p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`text-sm font-medium ${c.ativo ? "text-text-primary" : "text-text-muted"}`}>{c.nome}</p>
                      {c.sistema ? <Selo>Padrão</Selo> : <Selo tom="destaque">Personalizado</Selo>}
                      {c.seu_cargo && <Selo tom="destaque">Seu cargo</Selo>}
                      {!c.ativo && <Selo tom="apagado">Inativo</Selo>}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {c.descricao ? `${c.descricao} · ` : ""}
                      {c.usuarios} {c.usuarios === 1 ? "usuário" : "usuários"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {processandoId === c.id && <Loader2 size={14} className="mr-1 animate-spin text-text-muted" aria-hidden="true" />}
                    {dono ? (
                      <span className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Lock size={13} aria-hidden="true" /> Acesso total
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => setPainel({ cargo: c, copia: false })}
                          disabled={ocupado}
                          aria-label={`Editar ${c.nome}`}
                          className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setPainel({ cargo: c, copia: true })}
                          disabled={ocupado}
                          aria-label={`Duplicar ${c.nome}`}
                          className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={() => executar(c.id, () => definirCargoAtivo(c.id, !c.ativo), c.ativo ? "Cargo desativado." : "Cargo reativado.")}
                          disabled={ocupado}
                          className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-40"
                        >
                          {c.ativo ? "Desativar" : "Reativar"}
                        </button>
                        <button
                          onClick={() => setExcluir(c)}
                          disabled={ocupado || c.sistema || c.usuarios > 0}
                          title={c.sistema ? "Cargo padrão: desative em vez de excluir" : c.usuarios > 0 ? "Há usuários com este cargo" : undefined}
                          aria-label={`Excluir ${c.nome}`}
                          className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {dono ? (
                    <span className="text-xs text-text-secondary">Todas as permissões, inclusive equipe e configurações.</span>
                  ) : c.permissoes.length === 0 ? (
                    <span className="text-xs text-text-muted">Sem permissões.</span>
                  ) : (
                    c.permissoes.map((chave) => (
                      <span key={chave} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-secondary">
                        {rotuloPermissao.get(chave) ?? chave}
                      </span>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CargoPanel
        painel={painel}
        permissoes={permissoes}
        onFechar={() => setPainel(null)}
        onSalvo={async () => {
          setPainel(null);
          await carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir cargo?"
        descricao={`"${excluir?.nome}" será removido. Nenhum usuário tem este cargo.`}
        textoConfirmar="Excluir"
        processando={!!excluir && processandoId === excluir.id}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (!excluir) return;
          executar(excluir.id, () => excluirCargo(excluir.id), "Cargo excluído.").then(() => setExcluir(null));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Construtor de cargo
// ---------------------------------------------------------------------------

interface CargoPanelProps {
  painel: Painel;
  permissoes: PermissaoCatalogo[];
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}

const FORM_VAZIO: DadosCargoForm = { nome: "", descricao: "", permissoes: [] };

function CargoPanel({ painel, permissoes, onFechar, onSalvo }: CargoPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState<DadosCargoForm>(FORM_VAZIO);
  const [erros, setErros] = useState<{ nome?: string; descricao?: string; permissoes?: string }>({});
  const [salvando, setSalvando] = useState(false);

  const cargo = painel?.cargo ?? null;
  const editando = !!cargo && !painel?.copia;

  useEffect(() => {
    if (!painel) return;
    setErros({});
    setForm(
      cargo
        ? {
            nome: painel.copia ? `${cargo.nome} (cópia)`.slice(0, 60) : cargo.nome,
            descricao: cargo.descricao ?? "",
            permissoes: [...cargo.permissoes],
          }
        : FORM_VAZIO,
    );
  }, [painel, cargo]);

  const porModulo = useMemo(() => {
    const grupos = new Map<string, PermissaoCatalogo[]>();
    for (const p of permissoes) {
      const lista = grupos.get(p.modulo) ?? [];
      lista.push(p);
      grupos.set(p.modulo, lista);
    }
    return [...grupos.entries()];
  }, [permissoes]);

  function alternar(chave: ChavePermissao, marcada: boolean) {
    setForm((f) => ({
      ...f,
      permissoes: marcada ? [...f.permissoes, chave] : f.permissoes.filter((c) => c !== chave),
    }));
  }

  function alternarModulo(lista: PermissaoCatalogo[], marcar: boolean) {
    const chaves = lista.map((p) => p.chave);
    setForm((f) => ({
      ...f,
      permissoes: marcar
        ? [...new Set([...f.permissoes, ...chaves])]
        : f.permissoes.filter((c) => !chaves.includes(c)),
    }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novosErros: typeof erros = {};
    if (form.nome.trim().length < 2) novosErros.nome = "O nome deve ter ao menos 2 caracteres.";
    else if (form.nome.trim().length > 60) novosErros.nome = "Use até 60 caracteres.";
    if (form.descricao.trim().length > 200) novosErros.descricao = "Use até 200 caracteres.";
    if (form.permissoes.length === 0) novosErros.permissoes = "Escolha ao menos uma permissão.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      await salvarCargo(editando ? cargo!.id : null, editando ? cargo!.versao : null, {
        ...form,
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
      });
      notificarSucesso(editando ? "Cargo atualizado." : "Cargo criado.");
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o cargo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SidePanel
      aberto={painel !== null}
      largo
      onFechar={() => !salvando && onFechar()}
      titulo={editando ? "Editar cargo" : "Novo cargo"}
      subtitulo={editando && cargo!.usuarios > 0 ? `${cargo!.usuarios} usuário(s) com este cargo` : undefined}
    >
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Field
          id="cargo_nome"
          label="Nome do cargo"
          maxLength={60}
          placeholder="Ex.: Supervisor técnico"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          erro={erros.nome}
          autoFocus
        />
        <TextareaField
          id="cargo_descricao"
          label="Descrição (opcional)"
          maxLength={200}
          rows={2}
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          erro={erros.descricao}
        />
        {editando && cargo!.sistema && (
          <p className="rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-xs text-text-secondary">
            Cargo padrão: o nome e as permissões podem ser ajustados, mas ele não pode ser excluído.
          </p>
        )}

        <fieldset>
          <legend className="text-sm font-medium text-text-primary">
            Permissões <span className="font-normal text-text-muted">({form.permissoes.length})</span>
          </legend>
          {erros.permissoes && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {erros.permissoes}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-3">
            {porModulo.map(([modulo, lista]) => {
              const marcadas = lista.filter((p) => form.permissoes.includes(p.chave)).length;
              return (
                <div key={modulo} className="rounded-lg border border-border bg-base p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-text-primary">{ROTULO_MODULO[modulo] ?? modulo}</p>
                    <button
                      type="button"
                      onClick={() => alternarModulo(lista, marcadas < lista.length)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {marcadas < lista.length ? "Marcar todas" : "Desmarcar todas"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {lista.map((p) => (
                      <label
                        key={p.chave}
                        className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                          p.disponivel ? "text-text-secondary hover:bg-white/5" : "text-text-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.permissoes.includes(p.chave)}
                          onChange={(e) => alternar(p.chave, e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                        />
                        <span>
                          {p.descricao}
                          {!p.disponivel && <span className="block text-xs text-text-muted">Fora do plano atual</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-text-muted">
            <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden="true" />
            Permissões fora do plano ficam guardadas e passam a valer se a funcionalidade for contratada.
          </p>
        </fieldset>

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
            {editando ? "Salvar alterações" : "Criar cargo"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
