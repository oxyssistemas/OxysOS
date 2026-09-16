import { useEffect, useState } from "react";
import { Copy, Layers, Loader2, Pencil, Plus } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, TextareaField } from "@oxys/shared/components/Field";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import {
  listarPlanos,
  criarPlano,
  atualizarPlano,
  alternarAtivoPlano,
  duplicarPlano,
  listarFuncionalidadesDoPlano,
  definirFuncionalidadesDoPlano,
} from "../data/planosService";
import { listarFuncionalidades } from "../data/funcionalidadesService";
import type { Funcionalidade, Plano } from "../types";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface FormularioPlano {
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual: number;
}

const VAZIO: FormularioPlano = { nome: "", descricao: "", preco_mensal: 0, preco_anual: 0 };

export function PlanosPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidade[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [painelAberto, setPainelAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Plano | null>(null);
  const [form, setForm] = useState<FormularioPlano>(VAZIO);
  const [featuresSelecionadas, setFeaturesSelecionadas] = useState<Set<string>>(new Set());
  const [erros, setErros] = useState<Partial<Record<keyof FormularioPlano, string>>>({});
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const [dadosPlanos, dadosFuncionalidades] = await Promise.all([
        listarPlanos(),
        listarFuncionalidades(),
      ]);
      setPlanos(dadosPlanos);
      setFuncionalidades(dadosFuncionalidades);
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar planos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function abrirCadastro() {
    setEmEdicao(null);
    setForm(VAZIO);
    setFeaturesSelecionadas(new Set());
    setErros({});
    setPainelAberto(true);
  }

  async function abrirEdicao(p: Plano) {
    setEmEdicao(p);
    setForm({ nome: p.nome, descricao: p.descricao ?? "", preco_mensal: p.preco_mensal, preco_anual: p.preco_anual });
    setErros({});
    setPainelAberto(true);
    const ids = await listarFuncionalidadesDoPlano(p.id);
    setFeaturesSelecionadas(new Set(ids));
  }

  function alternarFeature(id: string) {
    setFeaturesSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormularioPlano, string>> = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome do plano.";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit() {
    if (enviando || !validar()) return;
    setEnviando(true);
    try {
      let planoId = emEdicao?.id;
      if (emEdicao) {
        await atualizarPlano(emEdicao.id, form);
        notificarSucesso("Plano atualizado.");
      } else {
        const novo = await criarPlano(form);
        planoId = novo.id;
        notificarSucesso("Plano criado.");
      }
      if (planoId) {
        await definirFuncionalidadesDoPlano(planoId, Array.from(featuresSelecionadas));
      }
      setPainelAberto(false);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleAlternarAtivo(p: Plano) {
    try {
      await alternarAtivoPlano(p.id, !p.ativo);
      notificarSucesso(p.ativo ? "Plano desativado." : "Plano ativado.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  async function handleDuplicar(p: Plano) {
    try {
      await duplicarPlano(p);
      notificarSucesso("Plano duplicado.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível duplicar.");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Planos</h1>
          <p className="mt-1 text-sm text-text-secondary">Planos comerciais e as funcionalidades incluídas.</p>
        </div>
        <button
          onClick={abrirCadastro}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Novo plano
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
      ) : planos.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-panel">
          <EmptyState
            icone={Layers}
            titulo="Nenhum plano cadastrado"
            descricao="Crie o primeiro plano comercial da plataforma."
            acao={{ label: "Novo plano", onClick: abrirCadastro }}
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planos.map((p) => (
            <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-semibold text-text-primary">{p.nome}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">{p.descricao}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    p.ativo ? "bg-success/10 text-success" : "bg-white/5 text-text-muted"
                  }`}
                >
                  {p.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div>
                <p className="font-display text-xl font-semibold text-accent">
                  {formatarMoeda(p.preco_mensal)}
                  <span className="text-xs font-normal text-text-muted">/mês</span>
                </p>
                <p className="text-xs text-text-muted">ou {formatarMoeda(p.preco_anual)}/ano</p>
              </div>
              <div className="mt-1 flex items-center gap-1 border-t border-border pt-3">
                <button
                  onClick={() => abrirEdicao(p)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-accent"
                >
                  <Pencil size={13} />
                  Editar
                </button>
                <button
                  onClick={() => handleDuplicar(p)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
                >
                  <Copy size={13} />
                  Duplicar
                </button>
                <button
                  onClick={() => handleAlternarAtivo(p)}
                  className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
                >
                  {p.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SidePanel
        aberto={painelAberto}
        onFechar={() => !enviando && setPainelAberto(false)}
        titulo={emEdicao ? "Editar plano" : "Novo plano"}
      >
        <div className="flex flex-col gap-4">
          <Field
            id="plano_nome"
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
          />
          <TextareaField
            id="plano_descricao"
            label="Descrição"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="plano_preco_mensal"
              label="Preço mensal (R$)"
              type="number"
              min={0}
              step="0.01"
              value={form.preco_mensal}
              onChange={(e) => setForm({ ...form, preco_mensal: Number(e.target.value) })}
            />
            <Field
              id="plano_preco_anual"
              label="Preço anual (R$)"
              type="number"
              min={0}
              step="0.01"
              value={form.preco_anual}
              onChange={(e) => setForm({ ...form, preco_anual: Number(e.target.value) })}
            />
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              Funcionalidades incluídas
            </p>
            <div className="flex flex-col gap-1.5">
              {funcionalidades.map((f) => (
                <label
                  key={f.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={featuresSelecionadas.has(f.id)}
                    onChange={() => alternarFeature(f.id)}
                    className="h-4 w-4 rounded border-border bg-base accent-accent"
                  />
                  {f.nome}
                </label>
              ))}
            </div>
          </div>
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
