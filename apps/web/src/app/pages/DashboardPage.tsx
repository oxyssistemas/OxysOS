import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardPlus, RefreshCw, UserPlus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import {
  obterAtividadeRecente,
  obterResumoDashboard,
  type ItemAtividade,
  type ResumoDashboard,
} from "../dashboard/dashboardService";
import {
  dataParaInput,
  periodoDoPreset,
  periodoPersonalizado,
  type Periodo,
  type PresetPeriodo,
} from "../dashboard/periodo";
import { FiltroPeriodo } from "../dashboard/components/FiltroPeriodo";
import { BarrasHorizontais } from "../dashboard/components/BarrasHorizontais";
import { GraficoLinhas } from "../dashboard/components/GraficoLinhas";
import { AtividadeRecente } from "../dashboard/components/AtividadeRecente";
import { CartaoGrafico, COR_SERIE, TabelaDados, formatoNumero } from "../dashboard/components/graficoBase";

const PRESET_PADRAO = "30d";

function periodoDaUrl(params: URLSearchParams): Periodo {
  const de = params.get("de");
  const ate = params.get("ate");
  if (de && ate) {
    const personalizado = periodoPersonalizado(de, ate);
    if (typeof personalizado !== "string") return personalizado;
  }
  const preset = params.get("periodo") as PresetPeriodo | null;
  if (preset && preset !== "personalizado" && ["hoje", "7d", "30d", "mes"].includes(preset)) {
    return periodoDoPreset(preset);
  }
  return periodoDoPreset(PRESET_PADRAO);
}

// ---------------------------------------------------------------------------

function CartaoIndicador({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <p className="text-xs font-medium text-text-muted">{rotulo}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold text-text-primary">{formatoNumero.format(valor)}</p>
      {detalhe && <p className="mt-0.5 text-xs text-text-secondary">{detalhe}</p>}
    </div>
  );
}

function EsqueletoDashboard() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-xl border border-border bg-panel" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[320px] rounded-xl border border-border bg-panel lg:col-span-2" />
        <div className="h-[320px] rounded-xl border border-border bg-panel" />
      </div>
    </div>
  );
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "16 ago" — curto para o eixo X */
const formatoDia = { format: (d: Date) => `${String(d.getDate()).padStart(2, "0")} ${MESES_CURTOS[d.getMonth()]}` };
/** "ago/26" */
const formatoMes = { format: (d: Date) => `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` };
const formatoDiaCompleto = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "long" });
const formatoMesCompleto = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { company, subscription, currentUser, can } = useCompany();
  const [params, setParams] = useSearchParams();
  const periodo = useMemo(() => periodoDaUrl(params), [params]);

  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [atividade, setAtividade] = useState<ItemAtividade[] | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const requisicaoAtual = useRef(0);

  const carregarResumo = useCallback(async (p: Periodo) => {
    const id = ++requisicaoAtual.current;
    setAtualizando(true);
    setErro(null);
    try {
      const dados = await obterResumoDashboard(p);
      if (id === requisicaoAtual.current) setResumo(dados);
    } catch (e) {
      if (id === requisicaoAtual.current) setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      if (id === requisicaoAtual.current) setAtualizando(false);
    }
  }, []);

  const carregarAtividade = useCallback(async () => {
    try {
      setAtividade(await obterAtividadeRecente(12));
    } catch {
      setAtividade([]);
    }
  }, []);

  const chavePeriodo = `${periodo.inicio.getTime()}-${periodo.fim.getTime()}`;
  useEffect(() => {
    carregarResumo(periodo);
    // recarrega só quando os limites mudam
  }, [chavePeriodo, carregarResumo]);

  useEffect(() => {
    carregarAtividade();
  }, [carregarAtividade]);

  function alterarPeriodo(novo: Periodo) {
    if (novo.preset === "personalizado") {
      setParams({ de: dataParaInput(novo.inicio), ate: dataParaInput(new Date(novo.fim.getTime() - 86_400_000)) });
    } else {
      setParams(novo.preset === PRESET_PADRAO ? {} : { periodo: novo.preset });
    }
  }

  const primeiroNome = currentUser?.nome.split(" ")[0] ?? "";
  const cards = resumo?.cards;
  const serie = resumo?.os_por_periodo ?? null;
  const porMes = resumo?.periodo.granularidade === "mes";
  const totalCriadasPeriodo = serie?.reduce((s, p) => s + p.criadas, 0) ?? 0;
  const totalFinalizadasPeriodo = serie?.reduce((s, p) => s + p.finalizadas, 0) ?? 0;
  const semOsAtivas =
    cards && cards.os_abertas === 0 && !cards.os_agendadas && cards.os_em_andamento === 0 && cards.os_pausadas === 0 && totalCriadasPeriodo === 0;

  const rotulosSerie = (serie ?? []).map((p) =>
    periodo.preset === "hoje" ? "Hoje" : porMes ? formatoMes.format(dataLocal(p.inicio)) : formatoDia.format(dataLocal(p.inicio)),
  );
  const rotulosSerieCompletos = (serie ?? []).map((p) =>
    porMes ? formatoMesCompleto.format(dataLocal(p.inicio)) : formatoDiaCompleto.format(dataLocal(p.inicio)),
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-semibold text-text-primary">Olá, {primeiroNome}</h1>
        <p className="text-sm text-text-secondary">
          {company?.nome}
          {subscription?.plano && <span className="text-text-muted"> · Plano {subscription.plano.nome}</span>}
        </p>
      </div>

      <div className="mt-6">
        <FiltroPeriodo periodo={periodo} onAlterar={alterarPeriodo} />
      </div>

      {erro && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary"
        >
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1">{erro}</span>
          <button
            onClick={() => carregarResumo(periodo)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
          >
            <RefreshCw size={12} aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      )}

      {!resumo && !erro ? (
        <div className="mt-6">
          <EsqueletoDashboard />
        </div>
      ) : resumo ? (
        <div
          className={`mt-6 flex flex-col gap-4 transition-opacity duration-200 ${atualizando ? "opacity-60" : ""}`}
          aria-busy={atualizando}
        >
          {semOsAtivas && (can("service_orders.create") || can("customers.create")) && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-5 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-display text-sm font-semibold text-text-primary">Nenhuma ordem de serviço em aberto</p>
                <p className="mt-0.5 text-sm text-text-secondary">
                  Os indicadores são atualizados conforme sua equipe registra atendimentos.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can("customers.create") && (
                  <Link
                    to="/app/customers"
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5"
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    Cadastrar cliente
                  </Link>
                )}
                {can("service_orders.create") && (
                  <Link
                    to="/app/service-orders/new"
                    className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    <ClipboardPlus size={16} aria-hidden="true" />
                    Criar OS
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Indicadores: só métricas com fonte real (null = oculto) */}
          {cards && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {cards.os_abertas !== null && <CartaoIndicador rotulo="OS abertas" valor={cards.os_abertas} detalhe="no momento" />}
              {cards.os_agendadas !== null && (
                <CartaoIndicador rotulo="OS agendadas" valor={cards.os_agendadas} detalhe="no momento" />
              )}
              {cards.os_em_andamento !== null && (
                <CartaoIndicador
                  rotulo="OS em andamento"
                  valor={cards.os_em_andamento}
                  detalhe={cards.os_pausadas ? `${formatoNumero.format(cards.os_pausadas)} pausadas` : "no momento"}
                />
              )}
              {cards.os_atrasadas !== null && (
                <CartaoIndicador
                  rotulo="OS atrasadas"
                  valor={cards.os_atrasadas}
                  detalhe={cards.os_vencendo ? `${formatoNumero.format(cards.os_vencendo)} vencem em breve` : "fora do prazo"}
                />
              )}
              {cards.os_criadas_periodo !== null && (
                <CartaoIndicador rotulo="OS criadas" valor={cards.os_criadas_periodo} detalhe="no período" />
              )}
              {cards.os_finalizadas_periodo !== null && (
                <CartaoIndicador rotulo="OS finalizadas" valor={cards.os_finalizadas_periodo} detalhe="no período" />
              )}
              {cards.clientes_total !== null && (
                <CartaoIndicador
                  rotulo="Clientes"
                  valor={cards.clientes_total}
                  detalhe={
                    cards.clientes_novos_periodo
                      ? `+${formatoNumero.format(cards.clientes_novos_periodo)} no período`
                      : "cadastrados"
                  }
                />
              )}
              {cards.tecnicos_ativos !== null && <CartaoIndicador rotulo="Técnicos ativos" valor={cards.tecnicos_ativos} />}
              {cards.equipamentos !== null && <CartaoIndicador rotulo="Equipamentos" valor={cards.equipamentos} />}
            </div>
          )}

          {serie && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <CartaoGrafico
                className="lg:col-span-2"
                titulo="OS por período"
                descricao={`Criadas e finalizadas por ${porMes ? "mês" : "dia"}`}
                vazio={totalCriadasPeriodo === 0 && totalFinalizadasPeriodo === 0}
                mensagemVazio="Nenhuma OS criada ou finalizada no período."
                tabela={
                  <TabelaDados
                    colunas={[porMes ? "Mês" : "Dia", "Criadas", "Finalizadas"]}
                    linhas={serie.map((p, i) => [rotulosSerieCompletos[i], p.criadas, p.finalizadas])}
                  />
                }
              >
                <GraficoLinhas
                  rotulos={rotulosSerie}
                  rotulosCompletos={rotulosSerieCompletos}
                  descricaoAcessivel={`OS criadas e finalizadas: ${formatoNumero.format(totalCriadasPeriodo)} criadas e ${formatoNumero.format(totalFinalizadasPeriodo)} finalizadas no período`}
                  series={[
                    { id: "criadas", nome: "Criadas", cor: COR_SERIE.primaria, valores: serie.map((p) => p.criadas) },
                    {
                      id: "finalizadas",
                      nome: "Finalizadas",
                      cor: COR_SERIE.secundaria,
                      valores: serie.map((p) => p.finalizadas),
                    },
                  ]}
                />
              </CartaoGrafico>

              {resumo.os_por_status && (
                <CartaoGrafico
                  titulo="OS por status"
                  descricao="OS criadas no período, pelo status atual"
                  vazio={resumo.os_por_status.every((s) => s.total === 0)}
                  mensagemVazio="Nenhuma OS criada no período."
                  tabela={<TabelaDados colunas={["Status", "OS"]} linhas={resumo.os_por_status.map((s) => [s.nome, s.total])} />}
                >
                  <BarrasHorizontais
                    unidade={{ singular: "OS", plural: "OS" }}
                    itens={resumo.os_por_status.map((s) => ({ id: s.id, rotulo: s.nome, valor: s.total, marcador: s.cor }))}
                  />
                </CartaoGrafico>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {resumo.os_por_tecnico && (
              <CartaoGrafico
                titulo="OS por técnico"
                descricao="OS criadas no período"
                vazio={resumo.os_por_tecnico.length === 0}
                mensagemVazio="Nenhuma OS criada no período."
                tabela={
                  <TabelaDados colunas={["Técnico", "OS"]} linhas={resumo.os_por_tecnico.map((r) => [r.nome, r.total])} />
                }
              >
                <BarrasHorizontais
                  unidade={{ singular: "OS", plural: "OS" }}
                  itens={resumo.os_por_tecnico.map((r) => ({ id: r.id ?? "sem-tecnico", rotulo: r.nome, valor: r.total }))}
                />
              </CartaoGrafico>
            )}

            {resumo.os_por_prioridade && (
              <CartaoGrafico
                titulo="OS por prioridade"
                descricao="OS criadas no período"
                vazio={resumo.os_por_prioridade.every((p) => p.total === 0)}
                mensagemVazio="Nenhuma OS criada no período."
                tabela={
                  <TabelaDados colunas={["Prioridade", "OS"]} linhas={resumo.os_por_prioridade.map((p) => [p.nome, p.total])} />
                }
              >
                <BarrasHorizontais
                  unidade={{ singular: "OS", plural: "OS" }}
                  itens={resumo.os_por_prioridade.map((p) => ({ id: p.id, rotulo: p.nome, valor: p.total, marcador: p.cor }))}
                />
              </CartaoGrafico>
            )}

            <CartaoGrafico
              titulo="Atividade recente"
              vazio={atividade !== null && atividade.length === 0}
              mensagemVazio="Nenhuma atividade registrada ainda."
              className={resumo.os_por_tecnico ? "" : "lg:col-span-3"}
            >
              {atividade === null ? (
                <div className="flex flex-col gap-3" aria-hidden="true">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : (
                <AtividadeRecente itens={atividade} />
              )}
            </CartaoGrafico>
          </div>
        </div>
      ) : null}
    </div>
  );
}
