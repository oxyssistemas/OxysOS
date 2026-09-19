import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, Loader2, Wrench } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { EmptyState } from "@oxys/shared/components/EstadosLista";
import { LocalAtendimentoBadge, formatarEnderecoOS } from "../components/LocalAtendimento";
import { useToast } from "@oxys/shared/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { ROTULO_TIPO_ITEM } from "../../ordens/tipos";
import { AnexosOrdem } from "../../ordens/abas/AnexosOrdem";
import { TimelineOrdem } from "../../ordens/abas/TimelineOrdem";
import {
  listarOrdens,
  listarItensDaOS,
  concluirOS,
  type OrdemComRelacoes,
} from "../data/ordensService";
import { listarStatusOS } from "../data/apoioService";
import type { OSItem, StatusOS } from "../types";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function tempoDecorrido(iso: string | null): string {
  if (!iso) return "—";
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h ${minutos % 60}min`;
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}

export function ExecucaoPage() {
  const { lojaId } = useAuth();
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [emExecucao, setEmExecucao] = useState<OrdemComRelacoes[]>([]);
  const [statusDisponiveis, setStatusDisponiveis] = useState<StatusOS[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [osSelecionada, setOsSelecionada] = useState<OrdemComRelacoes | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<OSItem[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [concluindo, setConcluindo] = useState(false);

  async function carregar() {
    if (!lojaId) return;
    setCarregando(true);
    try {
      const [todasOrdens, dadosStatus] = await Promise.all([listarOrdens(lojaId), listarStatusOS(lojaId)]);
      setEmExecucao(todasOrdens.filter((os) => os.status?.categoria === "em_andamento"));
      setStatusDisponiveis(dadosStatus);
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar OS em execução.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [lojaId]);

  async function carregarDetalhe(osId: string) {
    setItensDetalhe(await listarItensDaOS(osId));
  }

  async function abrirDetalhe(os: OrdemComRelacoes) {
    setOsSelecionada(os);
    setCarregandoDetalhe(true);
    try {
      await carregarDetalhe(os.id);
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar detalhes da OS.");
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function handleConcluir() {
    if (!osSelecionada || concluindo) return;
    const ativosFinalizados = statusDisponiveis.filter((s) => s.ativo && s.categoria === "finalizado_sucesso");
    const statusConcluido = ativosFinalizados.find((s) => s.chave === "finalizada") ?? ativosFinalizados[0];
    if (!statusConcluido) {
      notificarErro('Nenhum status de categoria "finalizado (sucesso)" configurado para esta loja.');
      return;
    }
    setConcluindo(true);
    try {
      await concluirOS({ os_id: osSelecionada.id, status_concluido_id: statusConcluido.id });
      notificarSucesso("OS concluída com sucesso.");
      setOsSelecionada(null);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir a OS.");
    } finally {
      setConcluindo(false);
    }
  }

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Execução</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Ordens de serviço em andamento no momento.
        </p>
      </div>

      {carregando ? (
        <div className="mt-10 flex justify-center">
          <Loader2 size={22} className="animate-spin text-accent" />
        </div>
      ) : emExecucao.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-panel">
          <EmptyState
            icone={Wrench}
            titulo="Nenhuma OS em execução"
            descricao='Mude uma OS para um status "em andamento" para ela aparecer aqui.'
          />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {emExecucao.map((os) => (
            <button
              key={os.id}
              onClick={() => abrirDetalhe(os)}
              className="flex flex-col gap-2 rounded-xl border border-border bg-panel p-4 text-left transition-colors hover:border-accent/50"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-text-muted">{os.numero}</span>
                <span className="inline-flex items-center gap-1 text-xs text-accent">
                  <Wrench size={12} />
                  {tempoDecorrido(os.iniciado_em)}
                </span>
              </div>
              <p className="font-medium text-text-primary">{os.cliente?.nome ?? "—"}</p>
              <p className="text-sm text-text-secondary">{os.objeto_atendimento ?? "Sem descrição do objeto"}</p>
              <div className="flex flex-col gap-1">
                <LocalAtendimentoBadge local={os.local_atendimento} />
                {os.endereco && <p className="text-xs text-text-muted">{formatarEnderecoOS(os.endereco)}</p>}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Responsável: {os.responsavel?.nome ?? "não definido"}
              </p>
            </button>
          ))}
        </div>
      )}

      <SidePanel
        aberto={!!osSelecionada}
        onFechar={() => setOsSelecionada(null)}
        titulo={osSelecionada?.cliente?.nome ?? "OS em execução"}
        subtitulo={osSelecionada?.numero}
      >
        {carregandoDetalhe || !osSelecionada ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {can("service_orders.finish") && (
              <button
                onClick={handleConcluir}
                disabled={concluindo}
                className="flex items-center justify-center gap-2 rounded-lg bg-success/15 px-4 py-2.5 text-sm font-medium text-success transition-colors hover:bg-success/25 disabled:opacity-60"
              >
                {concluindo ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Concluir OS
              </button>
            )}

            <Link
              to={`/app/service-orders/${osSelecionada.id}`}
              className="flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5"
            >
              <ExternalLink size={14} aria-hidden="true" /> Abrir OS completa (itens, atendimento e PDF)
            </Link>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Descrição</p>
              <p className="mt-1.5 text-sm text-text-primary">{osSelecionada.descricao}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Itens</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <tbody>
                    {itensDetalhe.map((item) => (
                      <tr key={item.id} className="border-b border-border text-xs last:border-0">
                        <td className="px-3 py-2 text-text-primary">
                          {item.descricao}{" "}
                          <span className="text-text-muted">
                            ({ROTULO_TIPO_ITEM[item.tipo]})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-text-secondary">
                          {formatarMoeda(item.quantidade * item.valor_unitario)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {lojaId && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Arquivos</p>
                <AnexosOrdem osId={osSelecionada.id} lojaId={lojaId} podeEditar={can("service_orders.edit")} />
              </div>
            )}

            <TimelineOrdem osId={osSelecionada.id} podeComentar={can("service_orders.edit")} chave={osSelecionada.id} />
          </div>
        )}
      </SidePanel>
    </div>
  );
}
