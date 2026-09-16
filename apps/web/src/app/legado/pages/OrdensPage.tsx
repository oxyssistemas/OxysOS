import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Loader2, PlayCircle, Search, Share2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { SelectField } from "@oxys/shared/components/Field";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { FotosGaleria } from "../components/FotosGaleria";
import { ObservacoesLista } from "../components/ObservacoesLista";
import { useToast } from "@oxys/shared/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import {
  listarOrdens,
  listarItensDaOS,
  listarHistoricoDaOS,
  listarFotos,
  listarObservacoes,
  atualizarStatusOS,
  iniciarReparo,
  type OrdemComRelacoes,
} from "../data/ordensService";
import { listarStatusOS, listarResponsaveis } from "../data/apoioService";
import { obterLoja, type LojaInfo } from "../data/lojaService";
import { baixarOS, compartilharOS, baixarRecibo, compartilharRecibo } from "../lib/pdf";
import type { OSFoto, OSHistoricoEntry, OSItem, OSObservacao, StatusOS, UsuarioResponsavel } from "../types";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function BadgeStatus({ status }: { status: StatusOS | null }) {
  if (!status) return <span className="text-text-muted">—</span>;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: `${status.cor ?? "#6B6B6B"}22`,
        color: status.cor ?? "#A1A1A1",
      }}
    >
      {status.nome}
    </span>
  );
}

export function OrdensPage() {
  const { lojaId, usuarioId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();

  const [ordens, setOrdens] = useState<OrdemComRelacoes[]>([]);
  const [statusDisponiveis, setStatusDisponiveis] = useState<StatusOS[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioResponsavel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const [osSelecionada, setOsSelecionada] = useState<OrdemComRelacoes | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<OSItem[]>([]);
  const [historicoDetalhe, setHistoricoDetalhe] = useState<OSHistoricoEntry[]>([]);
  const [fotosDetalhe, setFotosDetalhe] = useState<OSFoto[]>([]);
  const [observacoesDetalhe, setObservacoesDetalhe] = useState<OSObservacao[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [loja, setLoja] = useState<LojaInfo | null>(null);
  const [gerandoDocumento, setGerandoDocumento] = useState<string | null>(null);

  async function carregar() {
    if (!lojaId) return;
    setCarregando(true);
    try {
      const [dadosOrdens, dadosStatus, dadosUsuarios, dadosLoja] = await Promise.all([
        listarOrdens(lojaId),
        listarStatusOS(lojaId),
        listarResponsaveis(lojaId),
        loja ? Promise.resolve(loja) : obterLoja(lojaId),
      ]);
      setOrdens(dadosOrdens);
      setStatusDisponiveis(dadosStatus);
      setUsuarios(dadosUsuarios);
      setLoja(dadosLoja);
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar ordens de serviço.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [lojaId]);

  const ordensFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ordens.filter((os) => {
      const bateBusca =
        !termo ||
        os.cliente?.nome.toLowerCase().includes(termo) ||
        os.objeto_atendimento?.toLowerCase().includes(termo) ||
        os.codigo_aparelho?.includes(termo);
      const bateStatus = !filtroStatus || os.status_id === filtroStatus;
      return bateBusca && bateStatus;
    });
  }, [ordens, busca, filtroStatus]);

  async function carregarDetalhe(osId: string) {
    const [itens, historico, fotos, observacoes] = await Promise.all([
      listarItensDaOS(osId),
      listarHistoricoDaOS(osId),
      listarFotos(osId),
      listarObservacoes(osId),
    ]);
    setItensDetalhe(itens);
    setHistoricoDetalhe(historico);
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

  async function handleMudarStatus(novoStatusId: string) {
    if (!osSelecionada || !lojaId || !usuarioId || alterandoStatus) return;
    setAlterandoStatus(true);
    try {
      await atualizarStatusOS({
        os_id: osSelecionada.id,
        loja_id: lojaId,
        usuario_id: usuarioId,
        status_anterior_id: osSelecionada.status_id,
        status_novo_id: novoStatusId,
      });
      notificarSucesso("Status atualizado.");
      const novoStatus = statusDisponiveis.find((s) => s.id === novoStatusId) ?? null;
      setOsSelecionada({ ...osSelecionada, status_id: novoStatusId, status: novoStatus });
      const historico = await listarHistoricoDaOS(osSelecionada.id);
      setHistoricoDetalhe(historico);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar o status.");
    } finally {
      setAlterandoStatus(false);
    }
  }

  async function handleIniciarReparo() {
    if (!osSelecionada || !lojaId || !usuarioId || iniciando) return;
    const statusEmAndamento = statusDisponiveis.find((s) => s.categoria === "em_andamento");
    if (!statusEmAndamento) {
      notificarErro('Nenhum status de categoria "em andamento" configurado para esta loja.');
      return;
    }
    setIniciando(true);
    try {
      await iniciarReparo({
        os_id: osSelecionada.id,
        loja_id: lojaId,
        usuario_id: usuarioId,
        status_anterior_id: osSelecionada.status_id,
        status_em_andamento_id: statusEmAndamento.id,
      });
      notificarSucesso("Reparo iniciado.");
      setOsSelecionada({
        ...osSelecionada,
        status_id: statusEmAndamento.id,
        status: statusEmAndamento,
        iniciado_em: new Date().toISOString(),
      });
      const historico = await listarHistoricoDaOS(osSelecionada.id);
      setHistoricoDetalhe(historico);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível iniciar o reparo.");
    } finally {
      setIniciando(false);
    }
  }

  function nomeUsuario(id: string | null): string {
    if (!id) return "—";
    return usuarios.find((u) => u.id === id)?.nome ?? "—";
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

  async function handleBaixarRecibo() {
    if (!osSelecionada || !loja) return;
    setGerandoDocumento("baixar-recibo");
    try {
      await baixarRecibo({ loja, os: osSelecionada, itens: itensDetalhe });
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível gerar o recibo.");
    } finally {
      setGerandoDocumento(null);
    }
  }

  async function handleCompartilharRecibo() {
    if (!osSelecionada || !loja) return;
    setGerandoDocumento("compartilhar-recibo");
    try {
      const { compartilhado } = await compartilharRecibo({ loja, os: osSelecionada, itens: itensDetalhe });
      notificarSucesso(compartilhado ? "Recibo compartilhado." : "Compartilhamento não suportado — o recibo foi baixado.");
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível compartilhar o recibo.");
    } finally {
      setGerandoDocumento(null);
    }
  }

  const podeIniciarReparo =
    osSelecionada?.status?.categoria === "aberto" || osSelecionada?.status?.categoria === "pausado";

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Ordens de serviço</h1>
        <p className="mt-1 text-sm text-text-secondary">Acompanhe e atualize as OS da loja.</p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, objeto ou código"
            aria-label="Buscar por cliente, objeto ou código"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          aria-label="Filtrar por status"
          className="rounded-lg border border-border bg-panel px-3.5 py-2.5 text-sm text-text-primary focus:border-accent sm:w-56"
        >
          <option value="">Todos os status</option>
          {statusDisponiveis.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Código</th>
                <th className="px-5 py-3.5 font-medium">Cliente</th>
                <th className="px-5 py-3.5 font-medium">Objeto</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Criada por</th>
                <th className="px-5 py-3.5 font-medium">Valor</th>
                <th className="px-5 py-3.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={7} />}
              {!carregando &&
                ordensFiltradas.map((os) => (
                  <tr key={os.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-mono text-xs text-text-secondary">
                      #{os.codigo_aparelho ?? "—"}
                    </td>
                    <td className="px-5 py-4 font-medium text-text-primary">{os.cliente?.nome ?? "—"}</td>
                    <td className="px-5 py-4 text-text-secondary">{os.objeto_atendimento ?? "—"}</td>
                    <td className="px-5 py-4">
                      <BadgeStatus status={os.status} />
                    </td>
                    <td className="px-5 py-4 text-text-secondary">{os.criador?.nome ?? "—"}</td>
                    <td className="px-5 py-4 text-text-secondary">{formatarMoeda(os.valor_total)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => abrirDetalhe(os)}
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

        {!carregando && ordensFiltradas.length === 0 && (
          <EmptyState
            icone={ClipboardList}
            titulo={busca || filtroStatus ? "Nenhuma OS encontrada" : "Nenhuma OS aberta ainda"}
            descricao={
              busca || filtroStatus
                ? "Tente ajustar a busca ou o filtro de status."
                : "Abra a primeira ordem de serviço na página \"Abrir OS\"."
            }
          />
        )}
      </div>

      <SidePanel
        aberto={!!osSelecionada}
        onFechar={() => setOsSelecionada(null)}
        titulo={osSelecionada?.cliente?.nome ?? "Detalhes da OS"}
        subtitulo={
          osSelecionada
            ? `#${osSelecionada.codigo_aparelho ?? "—"}${
                osSelecionada.objeto_atendimento ? ` · ${osSelecionada.objeto_atendimento}` : ""
              }`
            : undefined
        }
      >
        {carregandoDetalhe || !osSelecionada ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SelectField
                  id="status_detalhe"
                  label="Status"
                  value={osSelecionada.status_id}
                  onChange={(e) => handleMudarStatus(e.target.value)}
                  disabled={alterandoStatus}
                >
                  {statusDisponiveis.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </SelectField>
              </div>
              {podeIniciarReparo && (
                <button
                  onClick={handleIniciarReparo}
                  disabled={iniciando}
                  className="flex h-[42px] items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {iniciando ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
                  Iniciar reparo
                </button>
              )}
            </div>

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

              {osSelecionada.status?.categoria === "finalizado_sucesso" && (
                <>
                  <button
                    onClick={handleBaixarRecibo}
                    disabled={gerandoDocumento !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-60"
                  >
                    {gerandoDocumento === "baixar-recibo" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Baixar recibo
                  </button>
                  <button
                    onClick={handleCompartilharRecibo}
                    disabled={gerandoDocumento !== null}
                    className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-60"
                  >
                    {gerandoDocumento === "compartilhar-recibo" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Share2 size={14} />
                    )}
                    Compartilhar recibo
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Criada por</p>
                <p className="mt-1.5 text-sm text-text-primary">{osSelecionada.criador?.nome ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Responsável
                </p>
                <p className="mt-1.5 text-sm text-text-primary">
                  {osSelecionada.responsavel?.nome ?? "Sem responsável definido"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Descrição</p>
              <p className="mt-1.5 text-sm text-text-primary">{osSelecionada.descricao}</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Itens</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-muted">
                      <th className="px-3 py-2 font-medium">Descrição</th>
                      <th className="px-3 py-2 font-medium">Qtd.</th>
                      <th className="px-3 py-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensDetalhe.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-text-primary">
                          {item.descricao}
                          <span className="ml-1.5 text-xs text-text-muted">
                            ({item.tipo === "peca" ? "Peça/Produto" : "Mão de obra"})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{item.quantidade}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {formatarMoeda(item.quantidade * item.valor_unitario)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-medium text-accent">
                Total: {formatarMoeda(osSelecionada.valor_total)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Relatório fotográfico (antes / depois)
              </p>
              <FotosGaleria fotos={fotosDetalhe} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Observações
              </p>
              <ObservacoesLista observacoes={observacoesDetalhe} usuarios={usuarios} />
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Histórico
              </p>
              <ul className="flex flex-col gap-2">
                {historicoDetalhe.map((h) => (
                  <li key={h.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-text-secondary">
                    <span className="text-text-primary">{nomeUsuario(h.usuario_id)}</span> alterou
                    para{" "}
                    <span className="text-text-primary">
                      {statusDisponiveis.find((s) => s.id === h.status_novo_id)?.nome ?? "—"}
                    </span>{" "}
                    · {formatarData(h.criado_em)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
