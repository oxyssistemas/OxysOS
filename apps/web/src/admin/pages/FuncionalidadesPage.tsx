import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Puzzle } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, TextareaField } from "@oxys/shared/components/Field";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import {
  listarFuncionalidades,
  criarFuncionalidade,
  atualizarFuncionalidade,
  alternarAtivoFuncionalidade,
} from "../data/funcionalidadesService";
import type { Funcionalidade } from "../types";

const CATEGORIAS_SUGERIDAS = ["operacao", "gestao", "campo", "inteligencia", "plataforma"];

interface FormularioFuncionalidade {
  nome: string;
  key: string;
  descricao: string;
  categoria: string;
}

const VAZIO: FormularioFuncionalidade = { nome: "", key: "", descricao: "", categoria: "operacao" };

export function FuncionalidadesPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [painelAberto, setPainelAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Funcionalidade | null>(null);
  const [form, setForm] = useState<FormularioFuncionalidade>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof FormularioFuncionalidade, string>>>({});
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      setFuncionalidades(await listarFuncionalidades());
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar módulos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirCadastro() {
    setEmEdicao(null);
    setForm(VAZIO);
    setErros({});
    setPainelAberto(true);
  }

  function abrirEdicao(f: Funcionalidade) {
    setEmEdicao(f);
    setForm({ nome: f.nome, key: f.key, descricao: f.descricao ?? "", categoria: f.categoria });
    setErros({});
    setPainelAberto(true);
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormularioFuncionalidade, string>> = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome.";
    if (!form.key.trim()) novosErros.key = "Informe a chave técnica (ex: service_orders).";
    else if (!/^[a-z0-9_]+$/.test(form.key)) novosErros.key = "Use apenas letras minúsculas, números e _.";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit() {
    if (enviando || !validar()) return;
    setEnviando(true);
    try {
      if (emEdicao) {
        await atualizarFuncionalidade(emEdicao.id, form);
        notificarSucesso("Módulo atualizado.");
      } else {
        await criarFuncionalidade(form);
        notificarSucesso("Módulo criado.");
      }
      setPainelAberto(false);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleAlternarAtivo(f: Funcionalidade) {
    try {
      await alternarAtivoFuncionalidade(f.id, !f.ativo);
      notificarSucesso(f.ativo ? "Módulo desativado." : "Módulo ativado.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  const porCategoria = funcionalidades.reduce<Record<string, Funcionalidade[]>>((acc, f) => {
    (acc[f.categoria] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Módulos</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Catálogo global de funcionalidades disponíveis na plataforma.
          </p>
        </div>
        <button
          onClick={abrirCadastro}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Novo módulo
        </button>
      </div>

      {carregando ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
          <table className="w-full text-sm">
            <tbody>
              <TabelaSkeleton colunas={4} />
            </tbody>
          </table>
        </div>
      ) : funcionalidades.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-panel">
          <EmptyState
            icone={Puzzle}
            titulo="Nenhum módulo cadastrado"
            descricao="Crie a primeira funcionalidade do catálogo."
            acao={{ label: "Novo módulo", onClick: abrirCadastro }}
          />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {Object.entries(porCategoria).map(([categoria, itens]) => (
            <div key={categoria} className="overflow-hidden rounded-xl border border-border bg-panel">
              <div className="border-b border-border px-5 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{categoria}</p>
              </div>
              <table className="w-full text-left text-sm">
                <tbody>
                  {itens.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-text-primary">{f.nome}</p>
                        <p className="font-mono text-xs text-text-muted">{f.key}</p>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary">{f.descricao ?? "—"}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            f.ativo ? "bg-success/10 text-success" : "bg-white/5 text-text-muted"
                          }`}
                        >
                          {f.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => abrirEdicao(f)}
                            aria-label={`Editar ${f.nome}`}
                            className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleAlternarAtivo(f)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
                          >
                            {f.ativo ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <SidePanel
        aberto={painelAberto}
        onFechar={() => !enviando && setPainelAberto(false)}
        titulo={emEdicao ? "Editar módulo" : "Novo módulo"}
      >
        <div className="flex flex-col gap-4">
          <Field
            id="func_nome"
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
          />
          <Field
            id="func_key"
            label="Chave técnica (key)"
            placeholder="ex: service_orders"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase() })}
            erro={erros.key}
            disabled={!!emEdicao}
          />
          <div>
            <label htmlFor="func_categoria" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Categoria
            </label>
            <input
              id="func_categoria"
              list="categorias-sugeridas"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              className="w-full rounded-lg border border-border bg-base px-3.5 py-2.5 text-sm text-text-primary focus:border-accent"
            />
            <datalist id="categorias-sugeridas">
              {CATEGORIAS_SUGERIDAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <TextareaField
            id="func_descricao"
            label="Descrição (opcional)"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="mt-8 flex items-center justify-end gap-3 border-t border-border pt-5">
          <button
            onClick={() => setPainelAberto(false)}
            disabled={enviando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </SidePanel>
    </div>
  );
}
