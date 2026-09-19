import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { atualizarItem, criarItem, definirDesconto, excluirItem, listarItens } from "../ordensService";
import { ROTULO_TIPO_ITEM, TIPOS_ITEM, formatarMoeda, type DadosItemForm, type ItemOrdem, type OrdemDetalhe } from "../tipos";

interface ItensOrdemProps {
  ordem: OrdemDetalhe;
  podeEditar: boolean;
  /** OS recarregada (total e versão mudam) */
  onAlterado: () => void;
}

const ITEM_VAZIO: DadosItemForm = { tipo: "servico", descricao: "", quantidade: "1", valor_unitario: "" };

function numero(texto: string): number {
  return Number(texto.replace(",", "."));
}

export function ItensOrdem({ ordem, podeEditar, onAlterado }: ItensOrdemProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [itens, setItens] = useState<ItemOrdem[] | null>(null);
  const [painel, setPainel] = useState<{ aberto: boolean; item: ItemOrdem | null }>({ aberto: false, item: null });
  const [form, setForm] = useState<DadosItemForm>(ITEM_VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof DadosItemForm, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [remover, setRemover] = useState<ItemOrdem | null>(null);
  const [desconto, setDesconto] = useState(String(ordem.desconto));
  const [salvandoDesconto, setSalvandoDesconto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setItens(await listarItens(ordem.id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar itens.");
      setItens([]);
    }
  }, [ordem.id, notificarErro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setDesconto(String(ordem.desconto));
  }, [ordem.desconto]);

  function abrir(item: ItemOrdem | null) {
    setForm(
      item
        ? { tipo: item.tipo, descricao: item.descricao, quantidade: String(item.quantidade), valor_unitario: String(item.valor_unitario) }
        : ITEM_VAZIO,
    );
    setErros({});
    setPainel({ aberto: true, item });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novosErros: typeof erros = {};
    if (!form.descricao.trim()) novosErros.descricao = "Descreva o item.";
    else if (form.descricao.trim().length > 200) novosErros.descricao = "Use até 200 caracteres.";
    const qtd = numero(form.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 100000) novosErros.quantidade = "Quantidade maior que zero.";
    const valor = numero(form.valor_unitario);
    if (form.valor_unitario.trim() === "" || !Number.isFinite(valor) || valor < 0) novosErros.valor_unitario = "Informe o valor (0 ou mais).";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      if (painel.item) await atualizarItem(painel.item.id, form);
      else await criarItem(ordem.id, form);
      notificarSucesso(painel.item ? "Item atualizado." : "Item adicionado.");
      setPainel((p) => ({ ...p, aberto: false }));
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o item.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemocao() {
    if (!remover) return;
    setSalvando(true);
    try {
      await excluirItem(remover.id);
      notificarSucesso("Item removido.");
      setRemover(null);
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível remover o item.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarDesconto(e: FormEvent) {
    e.preventDefault();
    const valor = numero(desconto || "0");
    if (!Number.isFinite(valor) || valor < 0) {
      notificarErro("O desconto não pode ser negativo.");
      return;
    }
    if (valor === Number(ordem.desconto)) return;
    setSalvandoDesconto(true);
    try {
      await definirDesconto(ordem.id, ordem.versao, valor);
      notificarSucesso("Desconto aplicado.");
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível aplicar o desconto.");
    } finally {
      setSalvandoDesconto(false);
    }
  }

  const previa = numero(form.quantidade) * numero(form.valor_unitario);

  return (
    <section className="rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-text-primary">Itens da OS</h2>
          <p className="text-xs text-text-muted">Serviços, produtos, peças e materiais (lançamento manual).</p>
        </div>
        {podeEditar && (
          <button
            onClick={() => abrir(null)}
            className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={16} aria-hidden="true" /> Adicionar item
          </button>
        )}
      </div>

      {itens === null ? (
        <div className="flex flex-col gap-2 p-5" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <Package size={22} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Nenhum item lançado.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-5 py-3 font-medium">Descrição</th>
                <th scope="col" className="px-3 py-3 font-medium">Tipo</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Qtd.</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Valor unit.</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Subtotal</th>
                {podeEditar && (
                  <th scope="col" className="px-5 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-text-primary">{item.descricao}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-text-secondary">{ROTULO_TIPO_ITEM[item.tipo]}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-secondary">{item.quantidade.toLocaleString("pt-BR")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-text-secondary">{formatarMoeda(item.valor_unitario)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-text-primary">{formatarMoeda(item.subtotal)}</td>
                  {podeEditar && (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button onClick={() => abrir(item)} aria-label={`Editar ${item.descricao}`} className="rounded p-1.5 text-text-muted hover:bg-white/5 hover:text-accent">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setRemover(item)} aria-label={`Remover ${item.descricao}`} className="rounded p-1.5 text-text-muted hover:bg-white/5 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        {podeEditar ? (
          <form onSubmit={salvarDesconto} className="flex items-end gap-2">
            <div className="w-36">
              <Field
                id="os_desconto"
                label="Desconto (R$)"
                inputMode="decimal"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </div>
            <button
              type="submit"
              disabled={salvandoDesconto}
              className="flex h-[42px] items-center gap-2 rounded-lg border border-border px-3 text-sm text-text-secondary hover:bg-white/5 disabled:opacity-60"
            >
              {salvandoDesconto && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              Aplicar
            </button>
          </form>
        ) : (
          <span />
        )}
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-right tabular-nums text-text-secondary">{formatarMoeda(ordem.subtotal_itens)}</dd>
          <dt className="text-text-muted">Desconto</dt>
          <dd className="text-right tabular-nums text-text-secondary">− {formatarMoeda(ordem.desconto)}</dd>
          <dt className="font-medium text-text-primary">Total</dt>
          <dd className="text-right font-display font-semibold tabular-nums text-text-primary">{formatarMoeda(ordem.valor_total)}</dd>
        </dl>
      </div>

      <SidePanel
        aberto={painel.aberto}
        onFechar={() => !salvando && setPainel((p) => ({ ...p, aberto: false }))}
        titulo={painel.item ? "Editar item" : "Adicionar item"}
        subtitulo={ordem.numero}
      >
        <form onSubmit={salvar} noValidate className="flex flex-col gap-4">
          <SelectField id="item_tipo" label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as DadosItemForm["tipo"] })}>
            {TIPOS_ITEM.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </SelectField>
          <Field
            id="item_descricao"
            label="Descrição"
            maxLength={200}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            erro={erros.descricao}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="item_quantidade"
              label="Quantidade"
              inputMode="decimal"
              value={form.quantidade}
              onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^\d.,]/g, "") })}
              erro={erros.quantidade}
            />
            <Field
              id="item_valor"
              label="Valor unitário (R$)"
              inputMode="decimal"
              value={form.valor_unitario}
              onChange={(e) => setForm({ ...form, valor_unitario: e.target.value.replace(/[^\d.,]/g, "") })}
              erro={erros.valor_unitario}
            />
          </div>
          <p className="text-sm text-text-secondary">
            Subtotal: <span className="font-medium text-text-primary">{Number.isFinite(previa) ? formatarMoeda(previa) : "—"}</span>
          </p>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setPainel((p) => ({ ...p, aberto: false }))}
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
              {painel.item ? "Salvar item" : "Adicionar"}
            </button>
          </div>
        </form>
      </SidePanel>

      <ConfirmDialog
        aberto={!!remover}
        tom="perigo"
        titulo="Remover item?"
        descricao={`"${remover?.descricao}" sairá da OS e o total será recalculado.`}
        textoConfirmar="Remover"
        processando={salvando}
        onCancelar={() => setRemover(null)}
        onConfirmar={confirmarRemocao}
      />
    </section>
  );
}
