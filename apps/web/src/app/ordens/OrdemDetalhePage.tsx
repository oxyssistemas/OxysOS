import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCcw,
  RotateCcw,
  Share2,
  UserCog,
} from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { useCompany } from "../context/CompanyContext";
import { listarStatusConfig } from "../configuracoes/configuracaoOsService";
import type { StatusOSConfig } from "../configuracoes/tipos";
import { PrioridadeBadge, StatusOSBadge } from "../configuracoes/components/Indicadores";
import { LocalAtendimentoBadge, formatarEnderecoOS } from "../legado/components/LocalAtendimento";
import { obterLoja } from "../legado/data/lojaService";
import { listarItens, obterOrdem } from "./ordensService";
import { useApoioOrdem } from "./useApoioOrdem";
import { SlaBadge } from "./components/Indicadores";
import { EditarOrdemPanel } from "./components/EditarOrdemPanel";
import { StatusOrdemPanel, type ModoStatus } from "./components/StatusOrdemPanel";
import { TecnicoOrdemPanel } from "./components/TecnicoOrdemPanel";
import { ItensOrdem } from "./abas/ItensOrdem";
import { AtendimentoOrdem } from "./abas/AtendimentoOrdem";
import { AnexosOrdem } from "./abas/AnexosOrdem";
import { ChecklistOrdem } from "./abas/ChecklistOrdem";
import { TimelineOrdem } from "./abas/TimelineOrdem";
import { documentoOS, reciboOS } from "./pdf";
import { estaEncerrada, formatarAgendamento, formatarDataHora, formatarMoeda, type OrdemDetalhe } from "./tipos";

type Aba = "resumo" | "atendimento" | "itens" | "checklist" | "arquivos" | "historico";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "atendimento", rotulo: "Atendimento" },
  { id: "itens", rotulo: "Itens" },
  { id: "checklist", rotulo: "Checklist" },
  { id: "arquivos", rotulo: "Arquivos" },
  { id: "historico", rotulo: "Linha do tempo" },
];

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-text-primary">{children}</dd>
    </div>
  );
}

const vazio = <span className="text-text-muted">Não informado</span>;

const botaoSecundario =
  "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-50";

export function OrdemDetalhePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { can, company } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const { apoio } = useApoioOrdem();

  const [ordem, setOrdem] = useState<OrdemDetalhe | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusOSConfig[]>([]);
  const [editando, setEditando] = useState(false);
  const [modoStatus, setModoStatus] = useState<ModoStatus | null>(null);
  const [tecnicoAberto, setTecnicoAberto] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);

  const abaParam = params.get("aba") as Aba | null;
  const aba: Aba = ABAS.some((a) => a.id === abaParam) ? (abaParam as Aba) : "resumo";

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setOrdem(await obterOrdem(id));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar a ordem de serviço.");
    }
  }, [id]);

  useEffect(() => {
    setOrdem(undefined);
    carregar();
  }, [carregar]);

  useEffect(() => {
    listarStatusConfig().then(setStatus).catch(() => setStatus([]));
  }, []);

  function trocarAba(nova: Aba) {
    const p = new URLSearchParams(params);
    if (nova === "resumo") p.delete("aba");
    else p.set("aba", nova);
    setParams(p, { replace: true });
  }

  async function gerarPdf(tipo: "os" | "recibo", compartilhar: boolean) {
    if (!ordem || !company) return;
    setGerando(`${tipo}-${compartilhar}`);
    try {
      const [loja, itens] = await Promise.all([obterLoja(company.id), listarItens(ordem.id)]);
      const r = tipo === "os" ? await documentoOS({ loja, ordem, itens }, compartilhar) : await reciboOS({ loja, ordem, itens }, compartilhar);
      if (compartilhar) notificarSucesso(r.compartilhado ? "Documento compartilhado." : "Compartilhamento indisponível: o PDF foi baixado.");
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerando(null);
    }
  }

  if (erro) {
    return (
      <TelaAviso
        icone={AlertTriangle}
        tom="perigo"
        titulo="Não foi possível carregar a ordem de serviço"
        descricao={erro}
        acoes={
          <button onClick={carregar} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
            Tentar novamente
          </button>
        }
      />
    );
  }
  if (ordem === undefined) return <TelaCarregando />;
  if (ordem === null) {
    return (
      <TelaAviso
        icone={ClipboardList}
        titulo="Ordem de serviço não encontrada"
        descricao="A OS não existe ou você não tem acesso a ela."
        acoes={
          <Link to="/app/service-orders" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
            Voltar para ordens de serviço
          </Link>
        }
      />
    );
  }

  const encerrada = estaEncerrada(ordem.status.categoria);
  const finalizada = ordem.status.categoria === "finalizado_sucesso";
  const podeEditar = can("service_orders.edit") && !encerrada;
  const podeReabrir =
    encerrada && (finalizada ? can("service_orders.finish") : can("service_orders.cancel")) && can("service_orders.edit");
  const podeTrocarStatus = !encerrada && (can("service_orders.edit") || can("service_orders.finish") || can("service_orders.cancel"));
  const agendamento = formatarAgendamento(ordem.data_agendada, ordem.hora_agendada);
  const recarregar = () => carregar();

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/app/service-orders" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} aria-hidden="true" /> Ordens de serviço
      </Link>

      <header className="mt-4 rounded-xl border border-border bg-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-accent">{ordem.numero}</span>
              <StatusOSBadge nome={ordem.status.nome} cor={ordem.status.cor} />
              {ordem.prioridade && <PrioridadeBadge nome={ordem.prioridade.nome} cor={ordem.prioridade.cor} nivel={ordem.prioridade.nivel} />}
              <SlaBadge sla={ordem.sla} prazo={ordem.prazo_em} />
            </div>
            <h1 className="mt-2 break-words font-display text-2xl font-semibold text-text-primary">{ordem.titulo || ordem.descricao}</h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
              <Link to={`/app/customers/${ordem.cliente.id}`} className="hover:text-accent">
                {ordem.cliente.nome}
              </Link>
              {ordem.equipamento && (
                <Link to={`/app/assets/${ordem.equipamento.id}`} className="hover:text-accent">
                  {ordem.equipamento.nome}
                </Link>
              )}
              <span>{ordem.tecnico ? `Técnico: ${ordem.tecnico.nome}` : "Sem técnico"}</span>
              <span>{agendamento ? `Agendada: ${agendamento}` : `Aberta em ${formatarDataHora(ordem.criado_em)}`}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {podeEditar && (
              <button onClick={() => setEditando(true)} className={botaoSecundario}>
                <Pencil size={16} aria-hidden="true" /> Editar
              </button>
            )}
            {can("service_orders.assign") && !encerrada && apoio?.tecnicos && (
              <button onClick={() => setTecnicoAberto(true)} className={botaoSecundario}>
                <UserCog size={16} aria-hidden="true" /> Atribuir técnico
              </button>
            )}
            {podeTrocarStatus && (
              <button onClick={() => setModoStatus("alterar")} className={botaoSecundario}>
                <RefreshCcw size={16} aria-hidden="true" /> Alterar status
              </button>
            )}
            {podeReabrir && (
              <button onClick={() => setModoStatus("alterar")} className={botaoSecundario}>
                <RotateCcw size={16} aria-hidden="true" /> Reabrir
              </button>
            )}
            {!encerrada && can("service_orders.cancel") && (
              <button onClick={() => setModoStatus("cancelar")} className={`${botaoSecundario} hover:text-danger`}>
                <Ban size={16} aria-hidden="true" /> Cancelar
              </button>
            )}
            {!encerrada && can("service_orders.finish") && (
              <button
                onClick={() => setModoStatus("finalizar")}
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <CheckCircle2 size={16} aria-hidden="true" /> Finalizar
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <button onClick={() => gerarPdf("os", false)} disabled={gerando !== null} className={botaoSecundario}>
            {gerando === "os-false" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            PDF da OS
          </button>
          <button onClick={() => gerarPdf("os", true)} disabled={gerando !== null} className={botaoSecundario}>
            {gerando === "os-true" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Share2 size={15} aria-hidden="true" />}
            Compartilhar
          </button>
          {finalizada && (
            <button onClick={() => gerarPdf("recibo", false)} disabled={gerando !== null} className={botaoSecundario}>
              {gerando === "recibo-false" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileText size={15} aria-hidden="true" />}
              Recibo
            </button>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Seções da ordem de serviço" className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            id={`aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls={`painel-${a.id}`}
            onClick={() => trocarAba(a.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              aba === a.id ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="mt-5">
        {aba === "resumo" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-2">
              <h2 className="font-display text-sm font-semibold text-text-primary">Problema relatado</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{ordem.descricao}</p>
              <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <Dado rotulo="Tipo de serviço">{ordem.tipo_servico?.nome ?? vazio}</Dado>
                <Dado rotulo="Prioridade">
                  {ordem.prioridade ? (
                    <PrioridadeBadge nome={ordem.prioridade.nome} cor={ordem.prioridade.cor} nivel={ordem.prioridade.nivel} />
                  ) : (
                    vazio
                  )}
                </Dado>
                <Dado rotulo="Cliente">
                  <Link to={`/app/customers/${ordem.cliente.id}`} className="hover:text-accent">
                    {ordem.cliente.nome}
                  </Link>
                  {(ordem.cliente.telefone || ordem.cliente.email) && (
                    <span className="block text-xs text-text-secondary">
                      {[ordem.cliente.telefone, ordem.cliente.email].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </Dado>
                <Dado rotulo="Local do atendimento">
                  <LocalAtendimentoBadge local={ordem.local_atendimento} />
                  {ordem.endereco && (
                    <span className="mt-1 block text-xs text-text-secondary">
                      {ordem.endereco.rotulo} · {formatarEnderecoOS(ordem.endereco)}
                    </span>
                  )}
                </Dado>
                <Dado rotulo="Equipamento">
                  {ordem.equipamento ? (
                    <>
                      <Link to={`/app/assets/${ordem.equipamento.id}`} className="hover:text-accent">
                        {ordem.equipamento.nome}
                      </Link>
                      <span className="block text-xs text-text-secondary">
                        {[[ordem.equipamento.marca, ordem.equipamento.modelo].filter(Boolean).join(" "), ordem.equipamento.numero_serie && `S/N ${ordem.equipamento.numero_serie}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </>
                  ) : (
                    vazio
                  )}
                </Dado>
                <Dado rotulo="Objeto do atendimento">{ordem.objeto_atendimento ?? vazio}</Dado>
                <Dado rotulo="Técnico">{ordem.tecnico?.nome ?? <span className="text-text-muted">Sem técnico</span>}</Dado>
                <Dado rotulo="Data e horário">{agendamento ?? <span className="text-text-muted">Sem agendamento</span>}</Dado>
                <Dado rotulo="SLA">
                  <SlaBadge sla={ordem.sla} prazo={ordem.prazo_em} />
                  {ordem.sla_horas && <span className="mt-1 block text-xs text-text-secondary">{ordem.sla_horas} h a partir da abertura</span>}
                </Dado>
                {ordem.codigo_aparelho && <Dado rotulo="Código do aparelho (legado)">#{ordem.codigo_aparelho}</Dado>}
              </dl>
              {ordem.observacoes_internas && (
                <div className="mt-5 rounded-lg border border-border bg-white/[0.02] p-3">
                  <p className="text-xs text-text-muted">Observações internas</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{ordem.observacoes_internas}</p>
                </div>
              )}
            </section>

            <aside className="flex flex-col gap-4">
              <section className="rounded-xl border border-border bg-panel p-5">
                <h2 className="font-display text-sm font-semibold text-text-primary">Valores</h2>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                  <dt className="text-text-muted">Itens</dt>
                  <dd className="text-right tabular-nums text-text-secondary">{formatarMoeda(ordem.subtotal_itens)}</dd>
                  <dt className="text-text-muted">Desconto</dt>
                  <dd className="text-right tabular-nums text-text-secondary">− {formatarMoeda(ordem.desconto)}</dd>
                  <dt className="font-medium text-text-primary">Total</dt>
                  <dd className="text-right font-display font-semibold tabular-nums text-text-primary">{formatarMoeda(ordem.valor_total)}</dd>
                </dl>
              </section>
              <section className="rounded-xl border border-border bg-panel p-5">
                <h2 className="font-display text-sm font-semibold text-text-primary">Registro</h2>
                <dl className="mt-3 flex flex-col gap-3">
                  <Dado rotulo="Aberta em">
                    {formatarDataHora(ordem.criado_em)}
                    {ordem.criador && <span className="block text-xs text-text-secondary">por {ordem.criador.nome}</span>}
                  </Dado>
                  {ordem.iniciado_em && <Dado rotulo="Atendimento iniciado">{formatarDataHora(ordem.iniciado_em)}</Dado>}
                  {ordem.concluido_em && <Dado rotulo={finalizada ? "Finalizada em" : "Encerrada em"}>{formatarDataHora(ordem.concluido_em)}</Dado>}
                  <Dado rotulo="Última alteração">
                    {formatarDataHora(ordem.atualizado_em)}
                    {ordem.atualizador && <span className="block text-xs text-text-secondary">por {ordem.atualizador.nome}</span>}
                  </Dado>
                </dl>
              </section>
            </aside>
          </div>
        )}

        {aba === "atendimento" && (
          <AtendimentoOrdem ordem={ordem} podeEditar={can("service_orders.edit")} onSalvo={recarregar} />
        )}

        {aba === "itens" && <ItensOrdem ordem={ordem} podeEditar={podeEditar} onAlterado={recarregar} />}

        {aba === "checklist" && company && (
          <ChecklistOrdem ordem={ordem} lojaId={company.id} podeEditar={podeEditar} encerrada={encerrada} />
        )}

        {aba === "arquivos" && company && <AnexosOrdem osId={ordem.id} lojaId={company.id} podeEditar={can("service_orders.edit")} />}

        {aba === "historico" && (
          <TimelineOrdem osId={ordem.id} podeComentar={can("service_orders.edit")} chave={`${ordem.versao}-${ordem.status_id}`} />
        )}
      </div>

      <EditarOrdemPanel aberto={editando} ordem={ordem} apoio={apoio} onFechar={() => setEditando(false)} onSalvo={() => (setEditando(false), recarregar())} />

      <StatusOrdemPanel
        modo={modoStatus}
        ordem={ordem}
        status={status}
        onFechar={() => setModoStatus(null)}
        onConcluido={() => {
          setModoStatus(null);
          recarregar();
        }}
      />

      {apoio?.tecnicos && (
        <TecnicoOrdemPanel
          aberto={tecnicoAberto}
          ordem={ordem}
          tecnicos={apoio.tecnicos}
          onFechar={() => setTecnicoAberto(false)}
          onConcluido={() => {
            setTecnicoAberto(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}
