import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { normalizarBusca } from "@oxys/shared/masks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  definirItemCatalogoAtivo,
  excluirItemCatalogo,
  listarCatalogoItens,
  salvarItemCatalogo,
} from "../ordens/ordensService";
import {
  ROTULO_TIPO_ITEM,
  TIPOS_ITEM,
  UNIDADES_SUGERIDAS,
  formatarMoeda,
  type DadosItemCatalogoForm,
  type ItemCatalogo,
  type TipoItemOS,
} from "../ordens/tipos";
import { Selo } from "./components/Indicadores";

const VAZIO: DadosItemCatalogoForm = {
  tipo: "material",
  codigo: "",
  nome: "",
  unidade: "un",
  valor_padrao: "",
  observacao: "",
};

type Erros = Partial<Record<keyof DadosItemCatalogoForm, string>>;

function validar(form: DadosItemCatalogoForm): Erros {
  const erros: Erros = {};
  if (!form.nome.trim()) erros.nome = "Informe o nome.";
  else if (form.nome.trim().length > 120) erros.nome = "Use até 120 caracteres.";
  if (form.codigo.trim().length > 40) erros.codigo = "Use até 40 caracteres.";
  if (!form.unidade.trim()) erros.unidade = "Informe a unidade.";
  else if (form.unidade.trim().length > 10) erros.unidade = "Use até 10 caracteres.";
  const valor = form.valor_padrao.trim() === "" ? 0 : Number(form.valor_padrao.replace(",", "."));
  if (!Number.isFinite(valor) || valor < 0) erros.valor_padrao = "Informe um valor de 0 para cima.";
  if (form.observacao.trim().length > 300) erros.observacao = "Use até 300 caracteres.";
  return erros;
}

/**
 * Catálogo de materiais e serviços (§34 e §35): o que a empresa costuma
 * usar, para o técnico escolher em campo em vez de digitar tudo. Não é
 * estoque — não tem saldo nem movimentação.
 */
export function CatalogoPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [itens, setItens] = useState<ItemCatalogo[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<TipoItemOS | "todos">("todos");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [painel, setPainel] = useState<{ aberto: boolean; item: ItemCatalogo | null }>({ aberto: false, item: null });
  const [form, setForm] = useState<DadosItemCatalogoForm>(VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState<ItemCatalogo | null>(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await listarCatalogoItens());
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar o catálogo.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return (itens ?? []).filter(
      (i) =>
        (mostrarInativos || i.ativo) &&
        (tipo === "todos" || i.tipo === tipo) &&
        (!termo || normalizarBusca(`${i.nome} ${i.codigo ?? ""}`).includes(termo)),
    );
  }, [itens, busca, tipo, mostrarInativos]);

  const totalInativos = (itens ?? []).filter((i) => !i.ativo).length;

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

  function abrir(item: ItemCatalogo | null) {
    setForm(
      item
        ? {
            tipo: item.tipo,
            codigo: item.codigo ?? "",
            nome: item.nome,
            unidade: item.unidade,
            valor_padrao: item.valor_padrao ? String(item.valor_padrao) : "",
            observacao: item.observacao ?? "",
          }
        : VAZIO,
    );
    setErros({});
    setPainel({ aberto: true, item });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novosErros = validar(form);
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      notificarErro("Revise os campos destacados.");
      return;
    }
    setSalvando(true);
    try {
      await salvarItemCatalogo(painel.item?.id ?? null, painel.item?.versao ?? null, form);
      notificarSucesso(painel.item ? "Item atualizado." : "Item criado.");
      setPainel({ aberto: false, item: null });
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o item.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-base font-semibold text-text-primary">Materiais e serviços</h2>
          <p className="mt-1 text-sm text-text-secondary">
            O que a sua empresa costuma usar e cobrar. O técnico escolhe daqui em campo — o nome, a unidade e o valor
            saem do catálogo, sem digitação. Não é estoque: aqui não há saldo nem movimentação.
          </p>
        </div>
        <button
          onClick={() => abrir(null)}
          disabled={!itens}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> Novo item
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código"
            aria-label="Buscar no catálogo"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por tipo">
          {(["todos", ...TIPOS_ITEM.map((t) => t.valor)] as (TipoItemOS | "todos")[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              aria-pressed={tipo === t}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                tipo === t ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-white/5"
              }`}
            >
              {t === "todos" ? "Todos" : ROTULO_TIPO_ITEM[t]}
            </button>
          ))}
        </div>
        {totalInativos > 0 && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
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
      ) : itens === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <Boxes size={22} className="text-text-muted" aria-hidden="true" />
          <p className="font-display text-sm font-medium text-text-primary">
            {itens.length === 0 ? "Catálogo vazio" : "Nenhum item encontrado"}
          </p>
          <p className="max-w-sm text-xs text-text-muted">
            {itens.length === 0
              ? 'Cadastre o que você usa com frequência, por exemplo "Cabo UTP cat6" (m) ou "Visita técnica" (un).'
              : "Ajuste a busca, o tipo ou mostre os inativos."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {visiveis.map((item) => {
            const ocupado = processandoId !== null;
            return (
              <li key={item.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`text-sm font-medium ${item.ativo ? "text-text-primary" : "text-text-muted"}`}>{item.nome}</p>
                    <Selo tom="destaque">{ROTULO_TIPO_ITEM[item.tipo]}</Selo>
                    {item.codigo && <Selo tom="apagado">{item.codigo}</Selo>}
                    {!item.ativo && <Selo tom="apagado">Inativo</Selo>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {formatarMoeda(item.valor_padrao)} por {item.unidade}
                    {item.total_uso > 0 && ` · usado em ${item.total_uso} ${item.total_uso === 1 ? "OS" : "OS"}`}
                    {item.observacao ? ` · ${item.observacao}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {processandoId === item.id && <Loader2 size={14} className="mr-1 animate-spin text-text-muted" aria-hidden="true" />}
                  <button
                    onClick={() => abrir(item)}
                    disabled={ocupado}
                    aria-label={`Editar ${item.nome}`}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() =>
                      executar(
                        item.id,
                        () => definirItemCatalogoAtivo(item.id, !item.ativo),
                        item.ativo ? "Item desativado." : "Item reativado.",
                      )
                    }
                    disabled={ocupado}
                    className="rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  >
                    {item.ativo ? "Desativar" : "Reativar"}
                  </button>
                  {item.total_uso === 0 && (
                    <button
                      onClick={() => setExcluir(item)}
                      disabled={ocupado}
                      aria-label={`Excluir ${item.nome}`}
                      className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SidePanel
        aberto={painel.aberto}
        titulo={painel.item ? "Editar item do catálogo" : "Novo item do catálogo"}
        subtitulo={painel.item && painel.item.total_uso > 0 ? `Usado em ${painel.item.total_uso} OS — as já lançadas não mudam` : undefined}
        onFechar={() => !salvando && setPainel({ aberto: false, item: null })}
      >
        <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
          <SelectField
            id="catalogo_tipo"
            label="Tipo"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoItemOS })}
          >
            {TIPOS_ITEM.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </SelectField>
          <Field
            id="catalogo_nome"
            label="Nome"
            maxLength={120}
            placeholder="Ex.: Cabo UTP cat6"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="catalogo_unidade" className="text-sm font-medium text-text-secondary">
                Unidade
              </label>
              <input
                id="catalogo_unidade"
                list="unidades-catalogo"
                maxLength={10}
                value={form.unidade}
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                aria-invalid={!!erros.unidade}
                className={`rounded-lg border bg-base px-3.5 py-2.5 text-sm text-text-primary focus:border-accent ${
                  erros.unidade ? "border-danger" : "border-border"
                }`}
              />
              <datalist id="unidades-catalogo">
                {UNIDADES_SUGERIDAS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              {erros.unidade && <p className="text-xs text-danger">{erros.unidade}</p>}
            </div>
            <Field
              id="catalogo_valor"
              label="Valor padrão"
              inputMode="decimal"
              placeholder="0,00"
              value={form.valor_padrao}
              onChange={(e) => setForm({ ...form, valor_padrao: e.target.value })}
              erro={erros.valor_padrao}
            />
          </div>
          <Field
            id="catalogo_codigo"
            label="Código (opcional)"
            maxLength={40}
            placeholder="Referência interna ou do fornecedor"
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            erro={erros.codigo}
          />
          <TextareaField
            id="catalogo_observacao"
            label="Observação (opcional)"
            rows={2}
            maxLength={300}
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            erro={erros.observacao}
          />

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPainel({ aberto: false, item: null })}
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
              {painel.item ? "Salvar alterações" : "Criar item"}
            </button>
          </div>
        </form>
      </SidePanel>

      <ConfirmDialog
        aberto={!!excluir}
        titulo="Excluir do catálogo"
        descricao={
          <>
            <span className="font-medium text-text-primary">{excluir?.nome}</span> sai do catálogo. Itens já lançados em
            OS não são afetados.
          </>
        }
        textoConfirmar="Excluir"
        tom="perigo"
        processando={processandoId === excluir?.id}
        onConfirmar={() =>
          excluir && executar(excluir.id, () => excluirItemCatalogo(excluir.id), "Item excluído.").then(() => setExcluir(null))
        }
        onCancelar={() => setExcluir(null)}
      />
    </div>
  );
}
