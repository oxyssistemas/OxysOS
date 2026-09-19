import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Copy, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { normalizarBusca } from "@oxys/shared/masks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  definirModeloChecklistAtivo,
  excluirModeloChecklist,
  listarModelosChecklist,
  salvarModeloChecklist,
} from "../ordens/execucaoService";
import {
  ROTULO_TIPO_ITEM_CHECKLIST,
  TIPOS_ITEM_CHECKLIST,
  type DadosModeloForm,
  type ItemModeloForm,
  type ModeloChecklist,
  type TipoItemChecklist,
} from "../ordens/tiposExecucao";
import { listarTiposServico } from "./configuracaoOsService";
import type { TipoServico } from "./tipos";
import { Selo } from "./components/Indicadores";

export function ChecklistsPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [modelos, setModelos] = useState<ModeloChecklist[] | null>(null);
  const [tipos, setTipos] = useState<TipoServico[]>([]);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [painel, setPainel] = useState<{ aberto: boolean; modelo: ModeloChecklist | null; copia: boolean }>({
    aberto: false,
    modelo: null,
    copia: false,
  });
  const [excluir, setExcluir] = useState<ModeloChecklist | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [lista, listaTipos] = await Promise.all([listarModelosChecklist(), listarTiposServico()]);
      setModelos(lista);
      setTipos(listaTipos);
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar os modelos de checklist.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return (modelos ?? []).filter(
      (m) =>
        (mostrarInativos || m.ativo) &&
        (!termo || normalizarBusca(`${m.nome} ${m.descricao ?? ""} ${m.tipo_servico?.nome ?? ""}`).includes(termo)),
    );
  }, [modelos, busca, mostrarInativos]);

  const totalInativos = (modelos ?? []).filter((m) => !m.ativo).length;

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-base font-semibold text-text-primary">Checklists</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Modelos de verificação aplicados nas OS: caixas de seleção, textos, números, fotos, listas de opções e datas.
            Itens obrigatórios precisam ser respondidos antes de finalizar a OS. Alterar um modelo não muda checklists já
            aplicados.
          </p>
        </div>
        <button
          onClick={() => setPainel({ aberto: true, modelo: null, copia: false })}
          disabled={!modelos}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> Novo modelo
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar modelo"
            aria-label="Buscar modelo de checklist"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        {totalInativos > 0 && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} className="h-4 w-4 accent-accent" />
            Mostrar inativos ({totalInativos})
          </label>
        )}
      </div>

      {erroCarga ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          {erroCarga}
          <button onClick={carregar} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5">
            Tentar novamente
          </button>
        </div>
      ) : modelos === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <ClipboardList size={22} className="text-text-muted" aria-hidden="true" />
          <p className="font-display text-sm font-medium text-text-primary">
            {modelos.length === 0 ? "Nenhum modelo de checklist" : "Nenhum modelo encontrado"}
          </p>
          <p className="max-w-sm text-xs text-text-muted">
            {modelos.length === 0
              ? "Crie um modelo, por exemplo \"Instalação de câmeras\" ou \"Entrada de aparelho\"."
              : "Ajuste a busca ou mostre os inativos."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {visiveis.map((m) => {
            const ocupado = processandoId !== null;
            const obrigatorios = m.itens.filter((i) => i.obrigatorio).length;
            return (
              <li key={m.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`text-sm font-medium ${m.ativo ? "text-text-primary" : "text-text-muted"}`}>{m.nome}</p>
                    {m.tipo_servico && <Selo tom="destaque">{m.tipo_servico.nome}</Selo>}
                    {!m.ativo && <Selo tom="apagado">Inativo</Selo>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {m.itens.length} {m.itens.length === 1 ? "item" : "itens"}
                    {obrigatorios > 0 && ` (${obrigatorios} obrigatório${obrigatorios > 1 ? "s" : ""})`} · usado em {m.total_uso} OS
                    {m.descricao ? ` · ${m.descricao}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {processandoId === m.id && <Loader2 size={14} className="mr-1 animate-spin text-text-muted" aria-hidden="true" />}
                  <button
                    onClick={() => setPainel({ aberto: true, modelo: m, copia: false })}
                    disabled={ocupado}
                    aria-label={`Editar ${m.nome}`}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setPainel({ aberto: true, modelo: m, copia: true })}
                    disabled={ocupado}
                    aria-label={`Duplicar ${m.nome}`}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => executar(m.id, () => definirModeloChecklistAtivo(m.id, !m.ativo), m.ativo ? "Modelo desativado." : "Modelo reativado.")}
                    disabled={ocupado}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-40"
                  >
                    {m.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button
                    onClick={() => setExcluir(m)}
                    disabled={ocupado || m.total_uso > 0}
                    title={m.total_uso > 0 ? "Já usado em OS: desative em vez de excluir" : undefined}
                    aria-label={`Excluir ${m.nome}`}
                    className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ModeloChecklistPanel
        aberto={painel.aberto}
        modelo={painel.modelo}
        copia={painel.copia}
        tipos={tipos}
        onFechar={() => setPainel((p) => ({ ...p, aberto: false }))}
        onSalvo={async () => {
          setPainel((p) => ({ ...p, aberto: false }));
          await carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir modelo de checklist?"
        descricao={`"${excluir?.nome}" será removido. Nenhuma OS usou este modelo.`}
        textoConfirmar="Excluir"
        processando={!!excluir && processandoId === excluir.id}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (!excluir) return;
          executar(excluir.id, () => excluirModeloChecklist(excluir.id), "Modelo excluído.").then(() => setExcluir(null));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Construtor do modelo
// ---------------------------------------------------------------------------

interface ModeloChecklistPanelProps {
  aberto: boolean;
  modelo: ModeloChecklist | null;
  /** abre o modelo como base para um novo */
  copia: boolean;
  tipos: TipoServico[];
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}

const LIMITE_ITENS = 100;

function novoItem(tipo: TipoItemChecklist = "checkbox"): ItemModeloForm {
  return { chave: crypto.randomUUID(), rotulo: "", tipo, obrigatorio: false, opcoes: "", ajuda: "" };
}

type ErrosModelo = { nome?: string; descricao?: string; itens?: string; porItem: Record<string, string> };

function validar(form: DadosModeloForm): ErrosModelo {
  const erros: ErrosModelo = { porItem: {} };
  if (!form.nome.trim()) erros.nome = "Informe o nome do modelo.";
  else if (form.nome.trim().length > 80) erros.nome = "Use até 80 caracteres.";
  if (form.descricao.trim().length > 300) erros.descricao = "Use até 300 caracteres.";
  if (form.itens.length === 0) erros.itens = "Inclua ao menos um item.";
  if (form.itens.length > LIMITE_ITENS) erros.itens = `O checklist pode ter no máximo ${LIMITE_ITENS} itens.`;
  for (const item of form.itens) {
    if (!item.rotulo.trim()) erros.porItem[item.chave] = "Dê um nome ao item.";
    else if (item.rotulo.trim().length > 150) erros.porItem[item.chave] = "Use até 150 caracteres no nome.";
    else if (item.ajuda.trim().length > 300) erros.porItem[item.chave] = "Use até 300 caracteres na ajuda.";
    else if (item.tipo === "selecao") {
      const opcoes = new Set(item.opcoes.split("\n").map((o) => o.trim()).filter(Boolean));
      if (opcoes.size < 2) erros.porItem[item.chave] = "Informe ao menos duas opções diferentes (uma por linha).";
      else if (opcoes.size > 30) erros.porItem[item.chave] = "Use até 30 opções.";
      else if ([...opcoes].some((o) => o.length > 100)) erros.porItem[item.chave] = "Cada opção deve ter até 100 caracteres.";
    }
  }
  return erros;
}

function temErros(e: ErrosModelo): boolean {
  return !!(e.nome || e.descricao || e.itens || Object.keys(e.porItem).length > 0);
}

function ModeloChecklistPanel({ aberto, modelo, copia, tipos, onFechar, onSalvo }: ModeloChecklistPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState<DadosModeloForm>({ nome: "", descricao: "", tipo_servico_id: "", itens: [] });
  const [erros, setErros] = useState<ErrosModelo>({ porItem: {} });
  const [salvando, setSalvando] = useState(false);
  const editando = !!modelo && !copia;

  useEffect(() => {
    if (!aberto) return;
    setForm(
      modelo
        ? {
            nome: copia ? `${modelo.nome} (cópia)`.slice(0, 80) : modelo.nome,
            descricao: modelo.descricao ?? "",
            tipo_servico_id: modelo.tipo_servico?.id ?? "",
            itens: modelo.itens.map((i) => ({
              chave: crypto.randomUUID(),
              rotulo: i.rotulo,
              tipo: i.tipo,
              obrigatorio: i.obrigatorio,
              opcoes: i.opcoes.join("\n"),
              ajuda: i.ajuda ?? "",
            })),
          }
        : { nome: "", descricao: "", tipo_servico_id: "", itens: [novoItem()] },
    );
    setErros({ porItem: {} });
  }, [aberto, modelo, copia]);

  function alterarItem(chave: string, dados: Partial<ItemModeloForm>) {
    setForm((f) => ({ ...f, itens: f.itens.map((i) => (i.chave === chave ? { ...i, ...dados } : i)) }));
  }

  function mover(indice: number, delta: -1 | 1) {
    setForm((f) => {
      const itens = [...f.itens];
      const destino = indice + delta;
      if (destino < 0 || destino >= itens.length) return f;
      [itens[indice], itens[destino]] = [itens[destino], itens[indice]];
      return { ...f, itens };
    });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novosErros = validar(form);
    setErros(novosErros);
    if (temErros(novosErros)) {
      notificarErro("Revise os campos destacados.");
      return;
    }
    setSalvando(true);
    try {
      await salvarModeloChecklist(editando ? modelo!.id : null, editando ? modelo!.versao : null, form);
      notificarSucesso(editando ? "Modelo atualizado." : "Modelo criado.");
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o modelo.");
    } finally {
      setSalvando(false);
    }
  }

  const tiposVisiveis = tipos.filter((t) => t.ativo || t.id === form.tipo_servico_id);

  return (
    <SidePanel
      aberto={aberto}
      largo
      onFechar={() => !salvando && onFechar()}
      titulo={editando ? "Editar modelo de checklist" : "Novo modelo de checklist"}
      subtitulo={editando && modelo!.total_uso > 0 ? `Usado em ${modelo!.total_uso} OS — as já aplicadas não mudam` : undefined}
    >
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Field
          id="modelo_nome"
          label="Nome"
          maxLength={80}
          placeholder="Ex.: Instalação de câmeras"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          erro={erros.nome}
          autoFocus
        />
        <TextareaField
          id="modelo_descricao"
          label="Descrição (opcional)"
          maxLength={300}
          rows={2}
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          erro={erros.descricao}
        />
        <SelectField
          id="modelo_tipo"
          label="Sugerir para o tipo de serviço (opcional)"
          value={form.tipo_servico_id}
          onChange={(e) => setForm({ ...form, tipo_servico_id: e.target.value })}
        >
          <option value="">Qualquer tipo de serviço</option>
          {tiposVisiveis.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
              {t.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </SelectField>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-text-primary">
            Itens ({form.itens.length})
          </legend>
          {erros.itens && (
            <p role="alert" className="text-xs text-danger">
              {erros.itens}
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {form.itens.map((item, i) => {
              const erroItem = erros.porItem[item.chave];
              return (
                <li key={item.chave} className={`rounded-lg border bg-base p-3 ${erroItem ? "border-danger/50" : "border-border"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-2 w-5 shrink-0 text-right text-xs tabular-nums text-text-muted">{i + 1}.</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="sr-only" htmlFor={`rotulo-${item.chave}`}>
                          Nome do item {i + 1}
                        </label>
                        <input
                          id={`rotulo-${item.chave}`}
                          value={item.rotulo}
                          maxLength={150}
                          placeholder="Ex.: Câmeras gravando"
                          onChange={(e) => alterarItem(item.chave, { rotulo: e.target.value })}
                          aria-invalid={!!erroItem}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
                        />
                        <label className="sr-only" htmlFor={`tipo-${item.chave}`}>
                          Tipo do item {i + 1}
                        </label>
                        <select
                          id={`tipo-${item.chave}`}
                          value={item.tipo}
                          onChange={(e) => alterarItem(item.chave, { tipo: e.target.value as TipoItemChecklist })}
                          className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary focus:border-accent sm:w-44"
                        >
                          {TIPOS_ITEM_CHECKLIST.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>
                      {item.tipo === "selecao" && (
                        <textarea
                          value={item.opcoes}
                          rows={3}
                          placeholder={"Uma opção por linha\nEx.: Bom\nRegular\nRuim"}
                          aria-label={`Opções do item ${i + 1}`}
                          onChange={(e) => alterarItem(item.chave, { opcoes: e.target.value })}
                          className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
                        />
                      )}
                      <input
                        value={item.ajuda}
                        maxLength={300}
                        placeholder="Ajuda para quem responde (opcional)"
                        aria-label={`Ajuda do item ${i + 1}`}
                        onChange={(e) => alterarItem(item.chave, { ajuda: e.target.value })}
                        className="rounded-lg border border-border bg-panel px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={item.obrigatorio}
                            onChange={(e) => alterarItem(item.chave, { obrigatorio: e.target.checked })}
                            className="h-4 w-4 accent-accent"
                          />
                          Obrigatório para finalizar
                        </label>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => mover(i, -1)}
                            disabled={i === 0}
                            aria-label={`Mover item ${i + 1} para cima`}
                            className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => mover(i, 1)}
                            disabled={i === form.itens.length - 1}
                            aria-label={`Mover item ${i + 1} para baixo`}
                            className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, itens: f.itens.filter((x) => x.chave !== item.chave) }))}
                            aria-label={`Remover item ${i + 1}`}
                            className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      {erroItem && <p className="text-xs text-danger">{erroItem}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, itens: [...f.itens, novoItem(f.itens[f.itens.length - 1]?.tipo)] }))}
            disabled={form.itens.length >= LIMITE_ITENS}
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-text-secondary hover:border-accent hover:text-text-primary disabled:opacity-50"
          >
            <Plus size={15} aria-hidden="true" /> Adicionar item
          </button>
          <p className="text-xs text-text-muted">
            Tipos: {TIPOS_ITEM_CHECKLIST.map((t) => ROTULO_TIPO_ITEM_CHECKLIST[t.valor]).join(", ")}.
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
            {editando ? "Salvar alterações" : "Criar modelo"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
