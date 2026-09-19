import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, Archive, ArchiveRestore, ArrowLeft, ClipboardPlus, HardDrive, Pencil } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import {
  definirArquivamentoEquipamento,
  listarOsDoEquipamento,
  obterEquipamento,
  obterHistoricoEquipamento,
  type EventoHistoricoEquipamento,
  type OsDoEquipamento,
} from "./equipamentosService";
import { formatarDataCurta, type Equipamento } from "./tipos";
import { GarantiaInfo, StatusEquipamentoBadge } from "./components/Indicadores";
import { EquipamentoFormPanel } from "./components/EquipamentoFormPanel";
import { QrCodeEquipamento } from "./components/QrCodeEquipamento";

type Aba = "visao-geral" | "ordens" | "historico" | "arquivos";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const NOMES_CAMPOS: Record<string, string> = {
  cliente: "cliente",
  endereco: "endereço",
  categoria: "categoria",
  nome: "nome",
  marca: "marca",
  modelo: "modelo",
  numero_serie: "nº de série",
  data_instalacao: "data de instalação",
  garantia: "garantia",
  localizacao: "localização",
  observacoes: "observações",
  status: "situação",
};

function descreverEvento(e: EventoHistoricoEquipamento): string {
  const quem = e.usuario ?? "Sistema";
  switch (e.acao) {
    case "equipamento_cadastrado":
      return `${quem} cadastrou o equipamento`;
    case "equipamento_atualizado":
      return `${quem} alterou ${(e.campos ?? []).map((c) => NOMES_CAMPOS[c] ?? c).join(", ") || "o cadastro"}`;
    case "equipamento_arquivado":
      return `${quem} arquivou o equipamento`;
    case "equipamento_reativado":
      return `${quem} reativou o equipamento`;
    case "equipamento_codigo_regenerado":
      return `${quem} gerou um novo QR Code`;
    case "os_criada":
      return `${quem} abriu uma ordem de serviço`;
    case "os_status_alterado":
      return `${quem} alterou uma OS${e.status_novo ? ` para ${e.status_novo}` : ""}`;
    case "os_local_alterado":
      return `${quem} alterou o local de atendimento de uma OS`;
    case "os_prioridade_alterada":
      return `${quem} alterou a prioridade de uma OS`;
    case "os_tipo_servico_alterado":
      return `${quem} alterou o tipo de serviço de uma OS`;
    case "os_atualizada":
      return `${quem} editou uma OS`;
    case "os_tecnico_atribuido":
      return `${quem} atribuiu um técnico a uma OS`;
    case "os_tecnico_removido":
      return `${quem} removeu o técnico de uma OS`;
    case "os_item_adicionado":
      return `${quem} adicionou um item a uma OS`;
    case "os_item_alterado":
      return `${quem} alterou um item de uma OS`;
    case "os_item_removido":
      return `${quem} removeu um item de uma OS`;
    case "os_reparo_iniciado":
      return `${quem} iniciou o atendimento de uma OS`;
    case "os_concluida":
      return `${quem} finalizou uma OS`;
    default:
      return `${quem} registrou uma atividade`;
  }
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-text-primary">{children}</dd>
    </div>
  );
}

const vazio = <span className="text-text-muted">Não informado</span>;

export function EquipamentoDetalhePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { can, hasFeature } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [equipamento, setEquipamento] = useState<Equipamento | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [ordens, setOrdens] = useState<{ ordens: OsDoEquipamento[]; total: number } | null>(null);
  const [historico, setHistorico] = useState<EventoHistoricoEquipamento[] | null>(null);

  const verOs = hasFeature("service_orders") && can("service_orders.view");
  const abas: { id: Aba; label: string }[] = [
    { id: "visao-geral", label: "Visão geral" },
    ...(verOs ? [{ id: "ordens" as Aba, label: "Ordens de serviço" }] : []),
    ...(can("assets.view") ? [{ id: "historico" as Aba, label: "Histórico" }] : []),
    { id: "arquivos", label: "Arquivos" },
  ];
  const abaParam = params.get("aba") as Aba | null;
  const aba: Aba = abas.some((a) => a.id === abaParam) ? (abaParam as Aba) : "visao-geral";

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setEquipamento(await obterEquipamento(id));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar o equipamento.");
    }
  }, [id]);

  useEffect(() => {
    setEquipamento(undefined);
    setOrdens(null);
    setHistorico(null);
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!equipamento) return;
    if (aba === "ordens" && ordens === null) {
      listarOsDoEquipamento(equipamento.id)
        .then(setOrdens)
        .catch((err) => notificarErro(err instanceof Error ? err.message : "Erro ao carregar OS."));
    }
    if (aba === "historico") {
      // recarrega a cada nova versão (edições geram eventos)
      obterHistoricoEquipamento(equipamento.id)
        .then(setHistorico)
        .catch((err) => notificarErro(err instanceof Error ? err.message : "Erro ao carregar histórico."));
    }
  }, [aba, equipamento?.id, equipamento?.versao]);

  function trocarAba(nova: Aba) {
    const p = new URLSearchParams(params);
    if (nova === "visao-geral") p.delete("aba");
    else p.set("aba", nova);
    setParams(p, { replace: true });
  }

  async function alternarArquivamento() {
    if (!equipamento) return;
    const arquivar = !equipamento.arquivado_em;
    setProcessando(true);
    try {
      await definirArquivamentoEquipamento(equipamento.id, equipamento.versao, arquivar);
      notificarSucesso(arquivar ? "Equipamento arquivado." : "Equipamento reativado.");
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setProcessando(false);
      setConfirmarArquivo(false);
      carregar();
    }
  }

  if (erro) {
    return (
      <TelaAviso
        icone={AlertTriangle}
        tom="perigo"
        titulo="Não foi possível carregar o equipamento"
        descricao={erro}
        acoes={
          <button onClick={carregar} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
            Tentar novamente
          </button>
        }
      />
    );
  }
  if (equipamento === undefined) return <TelaCarregando />;
  if (equipamento === null) {
    return (
      <TelaAviso
        icone={HardDrive}
        titulo="Equipamento não encontrado"
        descricao="O equipamento não existe ou você não tem acesso a ele."
        acoes={
          <Link to="/app/assets" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
            Voltar para equipamentos
          </Link>
        }
      />
    );
  }

  const arquivado = !!equipamento.arquivado_em;
  const modelo = [equipamento.marca, equipamento.modelo].filter(Boolean).join(" ");
  const endereco = equipamento.endereco;

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/app/assets" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} aria-hidden="true" /> Equipamentos
      </Link>

      <header className="mt-4 rounded-xl border border-border bg-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {equipamento.categoria && (
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  {equipamento.categoria.nome}
                </span>
              )}
              <StatusEquipamentoBadge status={equipamento.status} arquivado={arquivado} />
            </div>
            <h1 className="mt-2 break-words font-display text-2xl font-semibold text-text-primary">{equipamento.nome}</h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
              {equipamento.cliente && (
                <Link to={`/app/customers/${equipamento.cliente.id}`} className="hover:text-accent">
                  {equipamento.cliente.nome}
                </Link>
              )}
              {modelo && <span>{modelo}</span>}
              {equipamento.numero_serie && <span>S/N {equipamento.numero_serie}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {verOs && can("service_orders.create") && !arquivado && (
              <Link
                to={`/app/service-orders/new?equipamento=${equipamento.id}`}
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <ClipboardPlus size={16} aria-hidden="true" /> Abrir OS
              </Link>
            )}
            {can("assets.edit") && !arquivado && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
              >
                <Pencil size={16} aria-hidden="true" /> Editar
              </button>
            )}
            {can("assets.archive") && (
              <button
                onClick={() => setConfirmarArquivo(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
              >
                {arquivado ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                {arquivado ? "Reativar" : "Arquivar"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div role="tablist" aria-label="Seções do equipamento" className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {abas.map((a) => (
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
            {a.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="mt-5">
        {aba === "visao-geral" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-2">
              <h2 className="font-display text-sm font-semibold text-text-primary">Dados do equipamento</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Dado rotulo="Cliente">
                  {equipamento.cliente ? (
                    <Link to={`/app/customers/${equipamento.cliente.id}`} className="hover:text-accent">
                      {equipamento.cliente.nome}
                    </Link>
                  ) : (
                    vazio
                  )}
                </Dado>
                <Dado rotulo="Local">
                  {endereco ? (
                    <>
                      {endereco.rotulo}
                      <span className="block text-xs text-text-secondary">
                        {[endereco.logradouro, endereco.numero || "s/n"].join(", ")}
                        {endereco.bairro && ` · ${endereco.bairro}`} · {endereco.cidade}/{endereco.estado}
                      </span>
                    </>
                  ) : (
                    vazio
                  )}
                </Dado>
                <Dado rotulo="Localização no local">{equipamento.localizacao ?? vazio}</Dado>
                <Dado rotulo="Categoria">{equipamento.categoria?.nome ?? vazio}</Dado>
                <Dado rotulo="Marca">{equipamento.marca ?? vazio}</Dado>
                <Dado rotulo="Modelo">{equipamento.modelo ?? vazio}</Dado>
                <Dado rotulo="Número de série">{equipamento.numero_serie ?? vazio}</Dado>
                <Dado rotulo="Instalação">
                  {equipamento.data_instalacao ? formatarDataCurta(equipamento.data_instalacao) : vazio}
                </Dado>
                <Dado rotulo="Garantia">
                  <GarantiaInfo garantiaAte={equipamento.garantia_ate} />
                </Dado>
                <Dado rotulo="Situação">
                  <StatusEquipamentoBadge status={equipamento.status} arquivado={arquivado} />
                </Dado>
              </dl>
              {equipamento.observacoes && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs text-text-muted">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{equipamento.observacoes}</p>
                </div>
              )}
            </section>

            <QrCodeEquipamento
              equipamentoId={equipamento.id}
              codigo={equipamento.codigo_publico}
              nome={equipamento.nome}
              cliente={equipamento.cliente?.nome ?? ""}
              podeRegenerar={can("assets.edit") && !arquivado}
              onRegenerado={carregar}
            />
          </div>
        )}

        {aba === "ordens" && (
          <section className="overflow-hidden rounded-xl border border-border bg-panel">
            {ordens === null ? (
              <div className="flex flex-col gap-2 p-5" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
                ))}
              </div>
            ) : ordens.total === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-text-muted">Nenhuma ordem de serviço para este equipamento.</p>
            ) : (
              <ul className="divide-y divide-border">
                {ordens.ordens.map((os) => (
                  <li key={os.id}>
                    <Link
                      to={`/app/service-orders/${os.id}`}
                      className="flex flex-col gap-1 px-5 py-3.5 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-primary">
                          <span className="mr-2 font-mono text-xs text-accent">{os.numero}</span>
                          {os.titulo || os.descricao}
                        </p>
                        <p className="text-xs text-text-muted">{formatoDataHora.format(new Date(os.criado_em))}</p>
                      </div>
                      {os.status && (
                        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary sm:self-auto">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: os.status.cor ?? "#6B6B6B" }} aria-hidden="true" />
                          {os.status.nome}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === "historico" && (
          <section className="rounded-xl border border-border bg-panel p-5">
            {historico === null ? (
              <div className="flex flex-col gap-3" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
                ))}
              </div>
            ) : historico.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-muted">Nenhum evento registrado.</p>
            ) : (
              <ol className="flex flex-col">
                {historico.map((evento, i) => (
                  <li key={evento.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < historico.length - 1 && (
                      <span className="absolute left-[5px] top-4 h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden="true" />
                    )}
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-border bg-panel" aria-hidden="true" />
                    <div>
                      <p className="text-sm text-text-primary">{descreverEvento(evento)}</p>
                      <time dateTime={evento.criado_em} className="text-xs text-text-muted">
                        {formatoDataHora.format(new Date(evento.criado_em))}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {aba === "arquivos" && (
          <div className="rounded-xl border border-dashed border-border bg-panel/50 px-4 py-12 text-center">
            <p className="font-display text-sm font-medium text-text-primary">Arquivos do equipamento</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
              Manuais, fotos e laudos poderão ser anexados aqui quando o módulo de anexos for ativado.
            </p>
          </div>
        )}
      </div>

      <EquipamentoFormPanel
        aberto={editando}
        equipamentoId={equipamento.id}
        onFechar={() => setEditando(false)}
        onSalvo={() => {
          setEditando(false);
          carregar();
        }}
      />

      <ConfirmDialog
        aberto={confirmarArquivo}
        titulo={arquivado ? "Reativar equipamento?" : "Arquivar equipamento?"}
        descricao={
          arquivado
            ? `${equipamento.nome} voltará a aparecer na lista de ativos e poderá receber ordens de serviço.`
            : `${equipamento.nome} sairá da lista de ativos e não poderá receber novas ordens de serviço. O histórico e as OS existentes são preservados.`
        }
        textoConfirmar={arquivado ? "Reativar" : "Arquivar"}
        processando={processando}
        onConfirmar={alternarArquivamento}
        onCancelar={() => setConfirmarArquivo(false)}
      />
    </div>
  );
}
