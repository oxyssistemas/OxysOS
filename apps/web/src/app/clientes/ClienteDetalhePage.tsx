import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ClipboardPlus,
  HardDrive,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  UserX,
} from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { formatarDocumento, maskCep, maskPhone } from "@oxys/shared/masks";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import {
  definirArquivamento,
  excluirEndereco,
  listarEnderecos,
  listarOsDoCliente,
  obterCliente,
  obterHistoricoCliente,
  tornarPrincipal,
  type EventoHistoricoCliente,
  type OsDoCliente,
} from "./clientesService";
import { formatarEnderecoLinha, type Cliente, type EnderecoCliente } from "./tipos";
import { ClienteFormPanel } from "./components/ClienteFormPanel";
import { EnderecoFormPanel } from "./components/EnderecoFormPanel";
import { StatusCliente, TipoClienteBadge } from "./components/StatusCliente";

type Aba = "visao-geral" | "equipamentos" | "ordens" | "arquivos" | "historico";

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const formatoData = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

const NOMES_CAMPOS: Record<string, string> = {
  tipo: "tipo",
  nome: "nome",
  documento: "documento",
  razao_social: "razão social",
  nome_fantasia: "nome fantasia",
  email: "e-mail",
  telefone: "telefone",
  whatsapp: "WhatsApp",
  observacoes: "observações",
  tags: "tags",
};

function descreverEvento(e: EventoHistoricoCliente): string {
  const quem = e.usuario ?? "Sistema";
  switch (e.acao) {
    case "cliente_cadastrado":
      return `${quem} cadastrou o cliente`;
    case "cliente_atualizado":
      return `${quem} alterou ${(e.campos ?? []).map((c) => NOMES_CAMPOS[c] ?? c).join(", ") || "o cadastro"}`;
    case "cliente_arquivado":
      return `${quem} arquivou o cliente`;
    case "cliente_reativado":
      return `${quem} reativou o cliente`;
    case "cliente_endereco_adicionado":
      return `${quem} adicionou o endereço "${e.rotulo ?? ""}"`;
    case "cliente_endereco_atualizado":
      return `${quem} alterou o endereço "${e.rotulo ?? ""}"`;
    case "cliente_endereco_removido":
      return `${quem} removeu o endereço "${e.rotulo ?? ""}"`;
    case "os_criada":
      return `${quem} abriu uma ordem de serviço`;
    case "os_status_alterado":
      return `${quem} alterou uma OS${e.status_novo ? ` para ${e.status_novo}` : ""}`;
    case "os_reparo_iniciado":
      return `${quem} iniciou o atendimento de uma OS`;
    case "os_concluida":
      return `${quem} finalizou uma OS`;
    default:
      return `${quem} registrou uma atividade`;
  }
}

function Informacao({ icone: Icone, rotulo, children }: { icone: typeof Mail; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icone size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{rotulo}</p>
        <div className="break-words text-sm text-text-primary">{children}</div>
      </div>
    </div>
  );
}

function EmBreve({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-panel/50 px-4 py-12 text-center">
      <p className="font-display text-sm font-medium text-text-primary">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">{descricao}</p>
    </div>
  );
}

export function ClienteDetalhePage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { company, can, hasFeature } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [cliente, setCliente] = useState<Cliente | null | undefined>(undefined);
  const [enderecos, setEnderecos] = useState<EnderecoCliente[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [enderecoForm, setEnderecoForm] = useState<{ aberto: boolean; endereco?: EnderecoCliente }>({ aberto: false });
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [enderecoExcluir, setEnderecoExcluir] = useState<EnderecoCliente | null>(null);
  const [processando, setProcessando] = useState(false);

  const [ordens, setOrdens] = useState<{ ordens: OsDoCliente[]; total: number } | null>(null);
  const [historico, setHistorico] = useState<EventoHistoricoCliente[] | null>(null);

  const verOs = hasFeature("service_orders") && can("service_orders.view");
  const verEquipamentos = hasFeature("assets");

  const abasDisponiveis: { id: Aba; label: string }[] = [
    { id: "visao-geral", label: "Visão geral" },
    ...(verEquipamentos ? [{ id: "equipamentos" as Aba, label: "Equipamentos" }] : []),
    ...(verOs ? [{ id: "ordens" as Aba, label: "Ordens de serviço" }] : []),
    { id: "arquivos", label: "Arquivos" },
    { id: "historico", label: "Histórico" },
  ];
  const abaParam = params.get("aba") as Aba | null;
  const aba: Aba = abasDisponiveis.some((a) => a.id === abaParam) ? (abaParam as Aba) : "visao-geral";

  const carregarCliente = useCallback(async () => {
    setErro(null);
    try {
      const [c, e] = await Promise.all([obterCliente(id), listarEnderecos(id)]);
      setCliente(c);
      setEnderecos(e);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar o cliente.");
    }
  }, [id]);

  useEffect(() => {
    setCliente(undefined);
    setOrdens(null);
    setHistorico(null);
    carregarCliente();
  }, [carregarCliente]);

  useEffect(() => {
    if (!cliente) return;
    if (aba === "ordens" && ordens === null) {
      listarOsDoCliente(cliente.id)
        .then(setOrdens)
        .catch((err) => notificarErro(err instanceof Error ? err.message : "Erro ao carregar OS."));
    }
    if (aba === "historico") {
      // recarrega a cada nova versão do cliente (edições geram eventos)
      obterHistoricoCliente(cliente.id)
        .then(setHistorico)
        .catch((err) => notificarErro(err instanceof Error ? err.message : "Erro ao carregar histórico."));
    }
  }, [aba, cliente?.id, cliente?.versao]);

  function trocarAba(nova: Aba) {
    const p = new URLSearchParams(params);
    if (nova === "visao-geral") p.delete("aba");
    else p.set("aba", nova);
    setParams(p, { replace: true });
  }

  async function alternarArquivamento() {
    if (!cliente) return;
    setProcessando(true);
    const arquivar = !cliente.arquivado_em;
    try {
      await definirArquivamento(cliente.id, cliente.versao, arquivar);
      notificarSucesso(arquivar ? "Cliente arquivado." : "Cliente reativado.");
      setConfirmarArquivo(false);
      await carregarCliente();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
      setConfirmarArquivo(false);
      await carregarCliente();
    } finally {
      setProcessando(false);
    }
  }

  async function handleTornarPrincipal(endereco: EnderecoCliente) {
    try {
      await tornarPrincipal(endereco.id);
      notificarSucesso(`"${endereco.rotulo}" agora é o endereço principal.`);
      setEnderecos(await listarEnderecos(id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível alterar.");
    }
  }

  async function handleExcluirEndereco() {
    if (!enderecoExcluir) return;
    setProcessando(true);
    try {
      await excluirEndereco(enderecoExcluir.id);
      notificarSucesso("Endereço excluído.");
      setEnderecoExcluir(null);
      setEnderecos(await listarEnderecos(id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível excluir.");
      setEnderecoExcluir(null);
    } finally {
      setProcessando(false);
    }
  }

  if (erro) {
    return (
      <TelaAviso
        icone={AlertTriangle}
        tom="perigo"
        titulo="Não foi possível carregar o cliente"
        descricao={erro}
        acoes={
          <button onClick={carregarCliente} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
            Tentar novamente
          </button>
        }
      />
    );
  }
  if (cliente === undefined) return <TelaCarregando />;
  if (cliente === null) {
    return (
      <TelaAviso
        icone={UserX}
        titulo="Cliente não encontrado"
        descricao="O cliente não existe ou você não tem acesso a ele."
        acoes={
          <Link to="/app/customers" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
            Voltar para clientes
          </Link>
        }
      />
    );
  }

  const arquivado = !!cliente.arquivado_em;
  const telefone = cliente.telefone || cliente.whatsapp;
  const podeEditar = can("customers.edit") && !arquivado;

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/app/customers" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} aria-hidden="true" /> Clientes
      </Link>

      {/* Cabeçalho */}
      <header className="mt-4 rounded-xl border border-border bg-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TipoClienteBadge tipo={cliente.tipo_pessoa} />
              <StatusCliente arquivado={arquivado} />
            </div>
            <h1 className="mt-2 break-words font-display text-2xl font-semibold text-text-primary">{cliente.nome}</h1>
            {cliente.tipo_pessoa === "pj" && cliente.razao_social && cliente.razao_social !== cliente.nome && (
              <p className="mt-0.5 text-sm text-text-secondary">{cliente.razao_social}</p>
            )}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
              {cliente.documento && (
                <span className="tabular-nums">
                  {cliente.tipo_pessoa === "pf" ? "CPF" : "CNPJ"} {formatarDocumento(cliente.documento, cliente.tipo_pessoa)}
                </span>
              )}
              {telefone && <span>{maskPhone(telefone)}</span>}
            </p>
            {arquivado && (
              <p className="mt-2 text-xs text-text-muted">
                Arquivado em {formatoDataHora.format(new Date(cliente.arquivado_em as string))}. As OS existentes continuam disponíveis.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {podeEditar && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
              >
                <Pencil size={16} aria-hidden="true" /> Editar
              </button>
            )}
            {!arquivado && hasFeature("service_orders") && can("service_orders.create") && (
              <Link
                to={`/app/service-orders/new?cliente=${cliente.id}`}
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <ClipboardPlus size={16} aria-hidden="true" /> Nova OS
              </Link>
            )}
            {!arquivado && verEquipamentos && can("assets.create") && (
              <button
                disabled
                title="Disponível quando o módulo de equipamentos for ativado"
                className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted"
              >
                <HardDrive size={16} aria-hidden="true" /> Adicionar equipamento
                <span className="sr-only">(em breve)</span>
              </button>
            )}
            {can("customers.archive") && (
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

      {/* Abas */}
      <div role="tablist" aria-label="Seções do cliente" className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {abasDisponiveis.map((a) => (
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
        {(["contracts", "finance"] as const)
          .filter((f) => hasFeature(f))
          .map((f) => (
            <span
              key={f}
              aria-disabled="true"
              className="-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm text-text-muted"
            >
              {f === "contracts" ? "Contratos" : "Financeiro"}
              <span className="rounded-full border border-border px-1.5 text-[10px] uppercase">Em breve</span>
            </span>
          ))}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="mt-5">
        {aba === "visao-geral" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-1">
              <h2 className="font-display text-sm font-semibold text-text-primary">Contato</h2>
              <div className="mt-4 flex flex-col gap-4">
                <Informacao icone={Mail} rotulo="E-mail">
                  {cliente.email ? (
                    <a href={`mailto:${cliente.email}`} className="hover:text-accent">
                      {cliente.email}
                    </a>
                  ) : (
                    <span className="text-text-muted">Não informado</span>
                  )}
                </Informacao>
                <Informacao icone={Phone} rotulo="Telefone">
                  {cliente.telefone ? maskPhone(cliente.telefone) : <span className="text-text-muted">Não informado</span>}
                </Informacao>
                <Informacao icone={MessageCircle} rotulo="WhatsApp">
                  {cliente.whatsapp ? maskPhone(cliente.whatsapp) : <span className="text-text-muted">Não informado</span>}
                </Informacao>
              </div>

              {cliente.tags.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs text-text-muted">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cliente.tags.map((t) => (
                      <Link
                        key={t}
                        to={`/app/customers?tag=${encodeURIComponent(t)}`}
                        className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary"
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {cliente.observacoes && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs text-text-muted">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{cliente.observacoes}</p>
                </div>
              )}

              <p className="mt-5 border-t border-border pt-4 text-xs text-text-muted">
                Cliente desde {formatoData.format(new Date(cliente.criado_em))}
              </p>
            </section>

            <section className="rounded-xl border border-border bg-panel p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-sm font-semibold text-text-primary">
                  Endereços <span className="font-normal text-text-muted">({enderecos.length})</span>
                </h2>
                {podeEditar && (
                  <button
                    onClick={() => setEnderecoForm({ aberto: true })}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  >
                    <Plus size={14} aria-hidden="true" /> Adicionar endereço
                  </button>
                )}
              </div>

              {enderecos.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">Nenhum endereço cadastrado.</p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {enderecos.map((e) => (
                    <li key={e.id} className="flex flex-col rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          <MapPin size={14} className="text-text-muted" aria-hidden="true" />
                          {e.rotulo}
                        </p>
                        {e.principal && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2 py-0.5 text-[11px] font-medium text-accent">
                            <Star size={10} aria-hidden="true" /> Principal
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">{formatarEnderecoLinha(e)}</p>
                      <p className="text-sm text-text-secondary">
                        {e.cidade}/{e.estado}
                        {e.cep && ` · CEP ${maskCep(e.cep)}`}
                      </p>
                      {e.referencia && <p className="mt-1 text-xs text-text-muted">Ref.: {e.referencia}</p>}
                      {podeEditar && (
                        <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3 text-xs">
                          <button onClick={() => setEnderecoForm({ aberto: true, endereco: e })} className="font-medium text-text-secondary hover:text-text-primary">
                            Editar
                          </button>
                          {!e.principal && (
                            <button onClick={() => handleTornarPrincipal(e)} className="font-medium text-text-secondary hover:text-text-primary">
                              Tornar principal
                            </button>
                          )}
                          <button
                            onClick={() => setEnderecoExcluir(e)}
                            className="ml-auto flex items-center gap-1 font-medium text-text-muted hover:text-danger"
                            aria-label={`Excluir endereço ${e.rotulo}`}
                          >
                            <Trash2 size={12} aria-hidden="true" /> Excluir
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {aba === "equipamentos" && (
          <EmBreve
            titulo="Equipamentos do cliente"
            descricao="Os equipamentos vinculados a este cliente aparecerão aqui quando o módulo de equipamentos for ativado."
          />
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
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <p className="font-display text-sm font-medium text-text-primary">Nenhuma ordem de serviço.</p>
                {!arquivado && can("service_orders.create") && (
                  <Link
                    to={`/app/service-orders/new?cliente=${cliente.id}`}
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    <Plus size={16} aria-hidden="true" /> Criar primeira OS
                  </Link>
                )}
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {ordens.ordens.map((os) => (
                    <li key={os.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text-primary">{os.objeto_atendimento || os.descricao}</p>
                        <p className="text-xs text-text-muted">
                          {formatoDataHora.format(new Date(os.criado_em))}
                          {os.codigo_aparelho && ` · Código ${os.codigo_aparelho}`}
                        </p>
                      </div>
                      {os.status && (
                        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary sm:self-auto">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: os.status.cor ?? "#6B6B6B" }} aria-hidden="true" />
                          {os.status.nome}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-text-muted">
                  <span>
                    {ordens.ordens.length < ordens.total
                      ? `Mostrando as ${ordens.ordens.length} mais recentes de ${ordens.total}`
                      : `${ordens.total} ${ordens.total === 1 ? "ordem" : "ordens"}`}
                  </span>
                  <Link to="/app/service-orders" className="font-medium text-accent hover:text-accent-hover">
                    Ver todas as OS
                  </Link>
                </div>
              </>
            )}
          </section>
        )}

        {aba === "arquivos" && (
          <EmBreve
            titulo="Arquivos do cliente"
            descricao="Contratos, fotos e documentos do cliente poderão ser anexados aqui quando o módulo de anexos for ativado."
          />
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
      </div>

      <ClienteFormPanel
        aberto={editando}
        cliente={cliente}
        onFechar={() => setEditando(false)}
        onSalvo={() => {
          setEditando(false);
          carregarCliente();
        }}
      />

      {company && (
        <EnderecoFormPanel
          aberto={enderecoForm.aberto}
          lojaId={company.id}
          clienteId={cliente.id}
          endereco={enderecoForm.endereco}
          primeiroEndereco={enderecos.length === 0}
          onFechar={() => setEnderecoForm({ aberto: false })}
          onSalvo={async () => {
            setEnderecoForm({ aberto: false });
            setEnderecos(await listarEnderecos(cliente.id));
          }}
        />
      )}

      <ConfirmDialog
        aberto={confirmarArquivo}
        titulo={arquivado ? "Reativar cliente?" : "Arquivar cliente?"}
        descricao={
          arquivado
            ? `${cliente.nome} voltará a aparecer na lista de clientes ativos e poderá receber novas OS.`
            : `${cliente.nome} deixará de aparecer na lista de ativos e não poderá receber novas OS. Nenhum dado será apagado e as OS existentes continuam disponíveis.`
        }
        textoConfirmar={arquivado ? "Reativar" : "Arquivar"}
        processando={processando}
        onConfirmar={alternarArquivamento}
        onCancelar={() => setConfirmarArquivo(false)}
      />

      <ConfirmDialog
        aberto={!!enderecoExcluir}
        tom="perigo"
        titulo="Excluir endereço?"
        descricao={
          enderecoExcluir?.principal
            ? `"${enderecoExcluir.rotulo}" é o endereço principal. Outro endereço passará a ser o principal.`
            : `O endereço "${enderecoExcluir?.rotulo}" será removido do cadastro.`
        }
        textoConfirmar="Excluir"
        processando={processando}
        onConfirmar={handleExcluirEndereco}
        onCancelar={() => setEnderecoExcluir(null)}
      />
    </div>
  );
}
