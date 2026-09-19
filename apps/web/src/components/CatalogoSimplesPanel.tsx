import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "@/app/context/CompanyContext";

export interface ItemCatalogo {
  id: string;
  nome: string;
  ativo: boolean;
  /** registros que usam o item (bloqueia exclusão) */
  total_uso: number;
}

export interface CatalogoSimplesPanelProps {
  aberto: boolean;
  titulo: string;
  subtitulo: string;
  placeholder: string;
  /** "técnico"/"técnicos", "equipamento"/"equipamentos" */
  unidadeUso: { singular: string; plural: string };
  listar: () => Promise<ItemCatalogo[]>;
  criar: (lojaId: string, nome: string) => Promise<void>;
  renomear: (id: string, nome: string) => Promise<void>;
  definirAtivo: (id: string, ativo: boolean) => Promise<void>;
  excluir: (id: string) => Promise<void>;
  onFechar: () => void;
  /** avisa a página para recarregar filtros/listagem */
  onAlterado: () => void;
}

/** Painel de catálogo configurável pela empresa (nome + ativo), com contagem de uso. */
export function CatalogoSimplesPanel({
  aberto,
  titulo,
  subtitulo,
  placeholder,
  unidadeUso,
  listar,
  criar,
  renomear,
  definirAtivo,
  excluir: excluirItem,
  onFechar,
  onAlterado,
}: CatalogoSimplesPanelProps) {
  const { company } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [lista, setLista] = useState<ItemCatalogo[] | null>(null);
  const [nova, setNova] = useState("");
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<ItemCatalogo | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await listar());
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar a lista.");
      setLista([]);
    }
  }, [listar, notificarErro]);

  useEffect(() => {
    if (aberto) {
      setLista(null);
      setNova("");
      setEditando(null);
      carregar();
    }
  }, [aberto, carregar]);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    if (!company || !nova.trim() || criando) return;
    setCriando(true);
    try {
      await criar(company.id, nova);
      setNova("");
      notificarSucesso("Item criado.");
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível criar.");
    } finally {
      setCriando(false);
    }
  }

  async function executar(id: string, acao: () => Promise<void>, sucesso: string) {
    setProcessandoId(id);
    try {
      await acao();
      notificarSucesso(sucesso);
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <SidePanel aberto={aberto} titulo={titulo} subtitulo={subtitulo} onFechar={onFechar}>
      <form onSubmit={handleCriar} className="flex gap-2">
        <label htmlFor="catalogo_novo_item" className="sr-only">
          Novo item
        </label>
        <input
          id="catalogo_novo_item"
          value={nova}
          maxLength={60}
          onChange={(e) => setNova(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={!nova.trim() || criando}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {criando ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          Adicionar
        </button>
      </form>

      <div className="mt-5">
        {lista === null ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">Nenhum item cadastrado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {lista.map((esp) => {
              const emEdicao = editando?.id === esp.id;
              const ocupado = processandoId === esp.id;
              return (
                <li key={esp.id} className="flex items-center gap-2 px-3 py-2.5">
                  {emEdicao ? (
                    <form
                      className="flex flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!editando.nome.trim()) return;
                        executar(esp.id, () => renomear(esp.id, editando.nome), "Nome atualizado.").then(() =>
                          setEditando(null),
                        );
                      }}
                    >
                      <label htmlFor={`renomear_${esp.id}`} className="sr-only">
                        Novo nome para {esp.nome}
                      </label>
                      <input
                        id={`renomear_${esp.id}`}
                        autoFocus
                        maxLength={60}
                        value={editando.nome}
                        onChange={(e) => setEditando({ id: esp.id, nome: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setEditando(null)}
                        className="flex-1 rounded-md border border-border bg-base px-2 py-1 text-sm text-text-primary focus:border-accent"
                      />
                      <button type="submit" aria-label="Salvar nome" className="rounded p-1.5 text-text-secondary hover:bg-white/5">
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={() => setEditando(null)} aria-label="Cancelar" className="rounded p-1.5 text-text-secondary hover:bg-white/5">
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm ${esp.ativo ? "text-text-primary" : "text-text-muted line-through"}`}>{esp.nome}</p>
                        <p className="text-xs text-text-muted">
                          {esp.total_uso} {esp.total_uso === 1 ? unidadeUso.singular : unidadeUso.plural}
                          {!esp.ativo && " · inativo"}
                        </p>
                      </div>
                      {ocupado && <Loader2 size={14} className="animate-spin text-text-muted" aria-hidden="true" />}
                      <button
                        onClick={() => setEditando({ id: esp.id, nome: esp.nome })}
                        disabled={ocupado}
                        aria-label={`Renomear ${esp.nome}`}
                        className="rounded p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() =>
                          executar(
                            esp.id,
                            () => definirAtivo(esp.id, !esp.ativo),
                            esp.ativo ? "Item desativado." : "Item reativado.",
                          )
                        }
                        disabled={ocupado}
                        className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5"
                      >
                        {esp.ativo ? "Desativar" : "Reativar"}
                      </button>
                      <button
                        onClick={() => setExcluir(esp)}
                        disabled={ocupado || esp.total_uso > 0}
                        title={esp.total_uso > 0 ? "Em uso: desative em vez de excluir" : undefined}
                        aria-label={`Excluir ${esp.nome}`}
                        className="rounded p-1.5 text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir item?"
        descricao={`"${excluir?.nome}" será removido. Nenhum registro o utiliza.`}
        textoConfirmar="Excluir"
        processando={!!excluir && processandoId === excluir.id}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (!excluir) return;
          executar(excluir.id, () => excluirItem(excluir.id), "Item excluído.").then(() => setExcluir(null));
        }}
      />
    </SidePanel>
  );
}
