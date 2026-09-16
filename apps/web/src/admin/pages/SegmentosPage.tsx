import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Tags } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field } from "@oxys/shared/components/Field";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import { listarSegmentos, criarSegmento, atualizarSegmento, alternarAtivoSegmento } from "../data/segmentosService";
import type { Segmento } from "../types";

function gerarSlug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function SegmentosPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [painelAberto, setPainelAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Segmento | null>(null);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      setSegmentos(await listarSegmentos());
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar segmentos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirCadastro() {
    setEmEdicao(null);
    setNome("");
    setErro(undefined);
    setPainelAberto(true);
  }

  function abrirEdicao(s: Segmento) {
    setEmEdicao(s);
    setNome(s.nome);
    setErro(undefined);
    setPainelAberto(true);
  }

  async function handleSubmit() {
    if (enviando) return;
    if (!nome.trim()) {
      setErro("Informe o nome do segmento.");
      return;
    }
    setEnviando(true);
    try {
      const input = { nome: nome.trim(), slug: gerarSlug(nome) };
      if (emEdicao) {
        await atualizarSegmento(emEdicao.id, input);
        notificarSucesso("Segmento atualizado.");
      } else {
        await criarSegmento(input);
        notificarSucesso("Segmento criado.");
      }
      setPainelAberto(false);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleAlternarAtivo(s: Segmento) {
    try {
      await alternarAtivoSegmento(s.id, !s.ativo);
      notificarSucesso(s.ativo ? "Segmento desativado." : "Segmento ativado.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Segmentos</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Ramos de atuação atendidos pela plataforma.
          </p>
        </div>
        <button
          onClick={abrirCadastro}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Novo segmento
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Nome</th>
                <th className="px-5 py-3.5 font-medium">Slug</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={4} />}
              {!carregando &&
                segmentos.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-medium text-text-primary">{s.nome}</td>
                    <td className="px-5 py-4 font-mono text-xs text-text-secondary">{s.slug}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          s.ativo ? "bg-success/10 text-success" : "bg-white/5 text-text-muted"
                        }`}
                      >
                        {s.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => abrirEdicao(s)}
                          aria-label={`Editar ${s.nome}`}
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleAlternarAtivo(s)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
                        >
                          {s.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && segmentos.length === 0 && (
          <EmptyState
            icone={Tags}
            titulo="Nenhum segmento cadastrado"
            descricao="Crie o primeiro segmento atendido pela plataforma."
            acao={{ label: "Novo segmento", onClick: abrirCadastro }}
          />
        )}
      </div>

      <SidePanel
        aberto={painelAberto}
        onFechar={() => !enviando && setPainelAberto(false)}
        titulo={emEdicao ? "Editar segmento" : "Novo segmento"}
      >
        <Field id="segmento_nome" label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erro} />
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
