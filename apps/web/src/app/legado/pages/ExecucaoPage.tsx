import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Share2, Wrench } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { EmptyState } from "@oxys/shared/components/EstadosLista";
import { FotosGaleria } from "../components/FotosGaleria";
import { ObservacoesLista } from "../components/ObservacoesLista";
import { useToast } from "@oxys/shared/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import {
  listarOrdens,
  listarItensDaOS,
  listarFotos,
  listarObservacoes,
  concluirOS,
  adicionarFoto,
  adicionarObservacao,
  type OrdemComRelacoes,
} from "../data/ordensService";
import { listarStatusOS, listarResponsaveis } from "../data/apoioService";
import { obterLoja, type LojaInfo } from "../data/lojaService";
import { baixarOS, compartilharOS } from "../lib/pdf";
import type { OSFoto, OSItem, OSObservacao, StatusOS, TipoFotoOS, UsuarioResponsavel } from "../types";

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
  const { lojaId, usuarioId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();

  const [emExecucao, setEmExecucao] = useState<OrdemComRelacoes[]>([]);
  const [statusDisponiveis, setStatusDisponiveis] = useState<StatusOS[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioResponsavel[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [osSelecionada, setOsSelecionada] = useState<OrdemComRelacoes | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<OSItem[]>([]);
  const [fotosDetalhe, setFotosDetalhe] = useState<OSFoto[]>([]);
  const [observacoesDetalhe, setObservacoesDetalhe] = useState<OSObservacao[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [loja, setLoja] = useState<LojaInfo | null>(null);
  const [gerandoDocumento, setGerandoDocumento] = useState<string | null>(null);

  async function carregar() {
    if (!lojaId) return;
    setCarregando(true);
    try {
      const [todasOrdens, dadosStatus, dadosUsuarios, dadosLoja] = await Promise.all([
        listarOrdens(lojaId),
        listarStatusOS(lojaId),
        listarResponsaveis(lojaId),
        loja ? Promise.resolve(loja) : obterLoja(lojaId),
      ]);
      setEmExecucao(todasOrdens.filter((os) => os.status?.categoria === "em_andamento"));
      setStatusDisponiveis(dadosStatus);
      setUsuarios(dadosUsuarios);
      setLoja(dadosLoja);
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
    const [itens, fotos, observacoes] = await Promise.all([
      listarItensDaOS(osId),
      listarFotos(osId),
      listarObservacoes(osId),
    ]);
    setItensDetalhe(itens);
    setFotosDetalhe(fotos);
    setObservacoesDetalhe(observacoes);
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
    if (!osSelecionada || !lojaId || !usuarioId || concluindo) return;
    const statusConcluido = statusDisponiveis.find((s) => s.categoria === "finalizado_sucesso");
    if (!statusConcluido) {
      notificarErro('Nenhum status de categoria "finalizado (sucesso)" configurado para esta loja.');
      return;
    }
    setConcluindo(true);
    try {
      await concluirOS({
        os_id: osSelecionada.id,
        loja_id: lojaId,
        usuario_id: usuarioId,
        status_anterior_id: osSelecionada.status_id,
        status_concluido_id: statusConcluido.id,
      });
      notificarSucesso("OS concluída com sucesso.");
      setOsSelecionada(null);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir a OS.");
    } finally {
      setConcluindo(false);
    }
  }

  async function handleAdicionarFoto(arquivo: File, tipo: TipoFotoOS) {
    if (!osSelecionada || !lojaId || !usuarioId) return;
    try {
      await adicionarFoto({ loja_id: lojaId, os_id: osSelecionada.id, usuario_id: usuarioId, tipo, arquivo });
      notificarSucesso("Foto adicionada.");
      setFotosDetalhe(await listarFotos(osSelecionada.id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    }
  }

  async function handleAdicionarObservacao(texto: string) {
    if (!osSelecionada || !usuarioId) return;
    try {
      await adicionarObservacao({ os_id: osSelecionada.id, usuario_id: usuarioId, texto });
      notificarSucesso("Observação adicionada.");
      setObservacoesDetalhe(await listarObservacoes(osSelecionada.id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível adicionar a observação.");
    }
  }

  async function handleBaixarOS() {
    if (!osSelecionada || !loja) return;
    setGerandoDocumento("baixar-os");
    try {
      await baixarOS({ loja, os: osSelecionada, itens: itensDetalhe });
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF da OS.");
    } finally {
      setGerandoDocumento(null);
    }
  }

  async function handleCompartilharOS() {
    if (!osSelecionada || !loja) return;
    setGerandoDocumento("compartilhar-os");
    try {
      const { compartilhado } = await compartilharOS({ loja, os: osSelecionada, itens: itensDetalhe });
      notificarSucesso(compartilhado ? "OS compartilhada." : "Compartilhamento não suportado — o PDF foi baixado.");
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível compartilhar a OS.");
    } finally {
      setGerandoDocumento(null);
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
            descricao='Inicie o reparo de uma OS na página "Ordens de serviço" para ela aparecer aqui.'
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
                <span className="font-mono text-xs text-text-muted">#{os.codigo_aparelho ?? "—"}</span>
                <span className="inline-flex items-center gap-1 text-xs text-accent">
                  <Wrench size={12} />
                  {tempoDecorrido(os.iniciado_em)}
                </span>
              </div>
              <p className="font-medium text-text-primary">{os.cliente?.nome ?? "—"}</p>
              <p className="text-sm text-text-secondary">{os.objeto_atendimento ?? "Sem descrição do objeto"}</p>
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
        subtitulo={osSelecionada ? `#${osSelecionada.codigo_aparelho ?? "—"}` : undefined}
      >
        {carregandoDetalhe || !osSelecionada ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <button
              onClick={handleConcluir}
              disabled={concluindo}
              className="flex items-center justify-center gap-2 rounded-lg bg-success/15 px-4 py-2.5 text-sm font-medium text-success transition-colors hover:bg-success/25 disabled:opacity-60"
            >
              {concluindo ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Concluir OS
            </button>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleBaixarOS}
                disabled={gerandoDocumento !== null}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-60"
              >
                {gerandoDocumento === "baixar-os" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                Baixar OS
              </button>
              <button
                onClick={handleCompartilharOS}
                disabled={gerandoDocumento !== null}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-60"
              >
                {gerandoDocumento === "compartilhar-os" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Share2 size={14} />
                )}
                Compartilhar OS
              </button>
            </div>

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
                            ({item.tipo === "peca" ? "Peça/Produto" : "Mão de obra"})
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

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Fotos (antes / depois)
              </p>
              <FotosGaleria
                fotos={fotosDetalhe}
                permiteAdicionar
                onAdicionar={(arquivo, tipo) => handleAdicionarFoto(arquivo, tipo)}
              />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Observações
              </p>
              <ObservacoesLista
                observacoes={observacoesDetalhe}
                usuarios={usuarios}
                permiteAdicionar
                onAdicionar={handleAdicionarObservacao}
              />
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
