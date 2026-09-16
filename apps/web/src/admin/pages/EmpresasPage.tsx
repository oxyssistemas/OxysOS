import { useEffect, useMemo, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { NovaEmpresaWizard } from "../components/NovaEmpresaWizard";
import { EmpresaDetalhe } from "../components/EmpresaDetalhe";
import { useToast } from "@oxys/shared/components/Toast";
import { listarEmpresasComRelacoes } from "../data/lojasService";
import { listarSegmentos } from "../data/segmentosService";
import { listarPlanos } from "../data/planosService";
import type { LojaComRelacoes, Plano, Segmento, StatusLoja } from "../types";

export function EmpresasPage() {
  const { notificarErro } = useToast();
  const [empresas, setEmpresas] = useState<LojaComRelacoes[]>([]);
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusLoja | "">("");
  const [filtroSegmento, setFiltroSegmento] = useState("");
  const [filtroPlano, setFiltroPlano] = useState("");
  const [wizardAberto, setWizardAberto] = useState(false);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<LojaComRelacoes | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [dadosEmpresas, dadosSegmentos, dadosPlanos] = await Promise.all([
        listarEmpresasComRelacoes(),
        listarSegmentos(),
        listarPlanos(),
      ]);
      setEmpresas(dadosEmpresas);
      setSegmentos(dadosSegmentos);
      setPlanos(dadosPlanos);
      if (empresaSelecionada) {
        const atualizada = dadosEmpresas.find((e) => e.id === empresaSelecionada.id);
        setEmpresaSelecionada(atualizada ?? null);
      }
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar empresas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return empresas.filter((e) => {
      const bateBusca = !termo || e.nome.toLowerCase().includes(termo);
      const bateStatus = !filtroStatus || e.status === filtroStatus;
      const bateSegmento = !filtroSegmento || e.segmento_id === filtroSegmento;
      const batePlano = !filtroPlano || e.planoAtual?.id === filtroPlano;
      return bateBusca && bateStatus && bateSegmento && batePlano;
    });
  }, [empresas, busca, filtroStatus, filtroSegmento, filtroPlano]);

  if (empresaSelecionada) {
    return (
      <EmpresaDetalhe
        empresa={empresaSelecionada}
        onVoltar={() => setEmpresaSelecionada(null)}
        onAtualizado={carregar}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Empresas</h1>
          <p className="mt-1 text-sm text-text-secondary">Empresas cadastradas na plataforma.</p>
        </div>
        <button
          onClick={() => setWizardAberto(true)}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Nova empresa
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as StatusLoja | "")}
          className="rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text-primary focus:border-accent"
        >
          <option value="">Todos os status</option>
          <option value="ativa">Ativa</option>
          <option value="suspensa">Suspensa</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select
          value={filtroSegmento}
          onChange={(e) => setFiltroSegmento(e.target.value)}
          className="rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text-primary focus:border-accent"
        >
          <option value="">Todos os segmentos</option>
          {segmentos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <select
          value={filtroPlano}
          onChange={(e) => setFiltroPlano(e.target.value)}
          className="rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text-primary focus:border-accent"
        >
          <option value="">Todos os planos</option>
          {planos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Empresa</th>
                <th className="px-5 py-3.5 font-medium">Responsável</th>
                <th className="px-5 py-3.5 font-medium">Segmento</th>
                <th className="px-5 py-3.5 font-medium">Plano</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={6} />}
              {!carregando &&
                empresasFiltradas.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <p className="font-medium text-text-primary">{e.nome}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {e.cidade && e.estado ? `${e.cidade}, ${e.estado}` : "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{e.gerente?.nome ?? "—"}</td>
                    <td className="px-5 py-4 text-text-secondary">{e.segmento?.nome ?? "—"}</td>
                    <td className="px-5 py-4 text-text-secondary">{e.planoAtual?.nome ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          e.status === "ativa"
                            ? "bg-success/10 text-success"
                            : e.status === "suspensa"
                              ? "bg-[#EF9F27]/10 text-[#EF9F27]"
                              : "bg-danger/10 text-danger"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setEmpresaSelecionada(e)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-accent"
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!carregando && empresasFiltradas.length === 0 && (
          <EmptyState
            icone={Building2}
            titulo={busca || filtroStatus || filtroSegmento || filtroPlano ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
            descricao={
              busca || filtroStatus || filtroSegmento || filtroPlano
                ? "Tente ajustar a busca ou os filtros."
                : "Cadastre sua primeira empresa para começar."
            }
            acao={
              !busca && !filtroStatus && !filtroSegmento && !filtroPlano
                ? { label: "Nova empresa", onClick: () => setWizardAberto(true) }
                : undefined
            }
          />
        )}
      </div>

      <NovaEmpresaWizard aberto={wizardAberto} onFechar={() => setWizardAberto(false)} onSucesso={carregar} />
    </div>
  );
}
