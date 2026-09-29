import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Package, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TelaCarregando } from "@/components/TelaCarregando";
import { criarItem, excluirItem, listarCatalogoItens, obterItensOs } from "@/app/ordens/ordensService";
import {
  ROTULO_TIPO_ITEM,
  TIPOS_ITEM,
  UNIDADES_SUGERIDAS,
  type DadosItemForm,
  type ItemCatalogo,
  type ItemOsCampo,
  type ItensOsResposta,
  type TipoItemOS,
} from "@/app/ordens/tipos";
import { useTecnico } from "../TecnicoContext";
import { obterAtendimento } from "../tecnicoService";
import { AvisoSemInternet } from "../offline/AvisoSemInternet";

const campo =
  "min-h-[48px] w-full rounded-lg border border-border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-60";

function formVazio(): DadosItemForm {
  return {
    tipo: "material",
    descricao: "",
    unidade: "un",
    quantidade: "1",
    valor_unitario: "0",
    observacao: "",
    catalogo_item_id: "",
  };
}

/** Materiais e serviços usados no atendimento (§34 e §35). O preço é da empresa. */
export function MateriaisAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { pode } = useTecnico();
  const { notificarSucesso, notificarErro } = useToast();
  const [osId, setOsId] = useState<string | null>(null);
  const [dados, setDados] = useState<ItensOsResposta | null>(null);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<DadosItemForm>(formVazio);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [remover, setRemover] = useState<ItemOsCampo | null>(null);
  const [removendo, setRemovendo] = useState(false);

  // o banco também aceita quem edita a OS, mas no portal o cargo de campo é este
  const podeLancar = pode("service_orders.add_material");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const atendimento = await obterAtendimento(id);
      setOsId(atendimento.os.id);
      setDados(await obterItensOs(atendimento.os.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os materiais.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    listarCatalogoItens()
      .then((c) => setCatalogo(c.filter((i) => i.ativo)))
      .catch(() => setCatalogo([]));
  }, []);

  function escolherDoCatalogo(idCatalogo: string) {
    const item = catalogo.find((c) => c.id === idCatalogo);
    if (!item) {
      setForm((f) => ({ ...f, catalogo_item_id: "", descricao: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      catalogo_item_id: item.id,
      tipo: item.tipo,
      descricao: item.nome,
      unidade: item.unidade,
    }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !osId) return;
    const quantidade = Number(form.quantidade.replace(",", "."));
    if (!form.catalogo_item_id && !form.descricao.trim()) {
      notificarErro("Escolha do catálogo ou descreva o material.");
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      notificarErro("Informe uma quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      await criarItem(osId, form);
      notificarSucesso("Material registrado.");
      setForm(formVazio());
      setAberto(false);
      await carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível registrar o material.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    setRemovendo(true);
    try {
      await excluirItem(remover.id);
      notificarSucesso("Item removido.");
      setRemover(null);
      await carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível remover o item.");
    } finally {
      setRemovendo(false);
    }
  }

  if (!dados && !erro) return <TelaCarregando />;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>

      <h1 className="font-display text-xl font-semibold text-text-primary">Materiais e serviços</h1>
      <AvisoSemInternet acao="registrar materiais e serviços" />

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {podeLancar && !aberto && (
        <button
          onClick={() => setAberto(true)}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white"
        >
          <Plus size={18} aria-hidden="true" /> Registrar material
        </button>
      )}

      {aberto && (
        <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4">
          {catalogo.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Do catálogo</span>
              <select value={form.catalogo_item_id} onChange={(e) => escolherDoCatalogo(e.target.value)} className={campo}>
                <option value="">Digitar (fora do catálogo)</option>
                {catalogo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.unidade})
                  </option>
                ))}
              </select>
            </label>
          )}

          {!form.catalogo_item_id && (
            <>
              <div className="flex gap-2">
                {TIPOS_ITEM.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setForm({ ...form, tipo: t.valor as TipoItemOS })}
                    aria-pressed={form.tipo === t.valor}
                    className={`min-h-[44px] flex-1 rounded-lg border text-xs font-medium ${
                      form.tipo === t.valor ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
              <input
                value={form.descricao}
                maxLength={200}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="O que foi usado"
                className={campo}
              />
            </>
          )}

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Quantidade</span>
              <input
                inputMode="decimal"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^\d.,]/g, "") })}
                className={campo}
              />
            </label>
            <label className="flex w-28 flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">Unidade</span>
              <input
                list="unidades-campo"
                maxLength={10}
                value={form.unidade}
                disabled={!!form.catalogo_item_id}
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                className={campo}
              />
              <datalist id="unidades-campo">
                {UNIDADES_SUGERIDAS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
          </div>

          <input
            value={form.observacao}
            maxLength={300}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            placeholder="Observação (opcional)"
            className={campo}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => (setAberto(false), setForm(formVazio()))}
              className="min-h-[48px] flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-60"
            >
              {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Registrar
            </button>
          </div>
          <p className="text-[11px] text-text-muted">O valor é definido pela empresa — você registra só o que usou.</p>
        </form>
      )}

      {dados?.itens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <Package size={20} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Nada registrado neste atendimento.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {dados?.itens.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border bg-panel p-3.5">
              <Package size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{item.descricao}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {item.quantidade.toLocaleString("pt-BR")} {item.unidade} · {ROTULO_TIPO_ITEM[item.tipo]}
                  {!item.meu && item.criado_por && ` · ${item.criado_por}`}
                </p>
                {item.observacao && <p className="mt-1 text-xs text-text-secondary">{item.observacao}</p>}
              </div>
              {podeLancar && item.meu && (
                <button
                  onClick={() => setRemover(item)}
                  aria-label={`Remover ${item.descricao}`}
                  className="shrink-0 rounded-lg p-2.5 text-text-secondary active:bg-danger/10"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!podeLancar && (
        <p className="text-center text-[11px] text-text-muted">Seu cargo não permite registrar materiais.</p>
      )}

      <ConfirmDialog
        aberto={!!remover}
        titulo="Remover item"
        descricao={`"${remover?.descricao}" sai da OS.`}
        textoConfirmar="Remover"
        tom="perigo"
        processando={removendo}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}
