import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Download } from "lucide-react";
import { TelaAviso } from "@/components/TelaAviso";
import { useCompany } from "../context/CompanyContext";
import { listarTiposServico } from "../configuracoes/configuracaoOsService";
import type { TipoServico } from "../configuracoes/tipos";
import { listarTecnicosAtivos } from "../ordens/ordensService";
import type { OpcaoTecnico } from "../ordens/tipos";
import { FiltroPeriodo } from "../dashboard/components/FiltroPeriodo";
import { BarrasHorizontais } from "../dashboard/components/BarrasHorizontais";
import { GraficoLinhas } from "../dashboard/components/GraficoLinhas";
import { CartaoGrafico, COR_SERIE, TabelaDados, formatoNumero } from "../dashboard/components/graficoBase";
import {
  periodoDoPreset,
  periodoPersonalizado,
  descreverPeriodo,
  dataParaInput,
  type Periodo,
  type PresetPeriodo,
} from "../dashboard/periodo";
import { baixarCsv, montarCsv, obterRelatorio } from "./relatoriosService";
import {
  formatarDuracaoHoras,
  formatarNumero,
  porcentagem,
  type FiltrosRelatorio,
  type Relatorio,
} from "./tipos";

const PRESET_PADRAO: Exclude<PresetPeriodo, "personalizado"> = "30d";

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

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const formatoDiaCompleto = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "long" });
const formatoMesCompleto = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function CartaoIndicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <p className="text-xs font-medium text-text-muted">{rotulo}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold text-text-primary">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-text-secondary">{detalhe}</p>}
    </div>
  );
}

function TabelaTop({
  titulo,
  colunas,
  linhas,
  vazio,
}: {
  titulo: string;
  colunas: string[];
  linhas: { chave: string; celulas: (string | number)[]; link?: string }[];
  vazio: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-display text-sm font-semibold text-text-primary">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">{vazio}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {colunas.map((coluna, i) => (
                  <th
                    key={coluna}
                    scope="col"
                    className={`py-2 text-xs font-medium uppercase tracking-wide text-text-muted ${i > 0 ? "text-right" : ""}`}
                  >
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.chave} className="border-b border-border last:border-0">
                  {linha.celulas.map((celula, i) => (
                    <td key={i} className={`py-2 ${i > 0 ? "text-right tabular-nums text-text-secondary" : "text-text-primary"}`}>
                      {i === 0 && linha.link ? (
                        <Link to={linha.link} className="hover:text-accent">
                          {celula}
                        </Link>
                      ) : (
                        celula
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** /app/reports — números da operação no período (reports.view). */
export function RelatoriosPage() {
  const { hasFeature } = useCompany();
  const [params, setParams] = useSearchParams();
  const periodo = useMemo(() => periodoDaUrl(params), [params]);
  const filtros: FiltrosRelatorio = {
    tecnicoId: params.get("tecnico") ?? "",
    tipoId: params.get("tipo") ?? "",
  };

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tecnicos, setTecnicos] = useState<OpcaoTecnico[] | null>(null);
  const [tipos, setTipos] = useState<TipoServico[] | null>(null);
  const requisicaoAtual = useRef(0);

  const carregar = useCallback(async (p: Periodo, f: FiltrosRelatorio) => {
    const id = ++requisicaoAtual.current;
    setCarregando(true);
    setErro(null);
    try {
      const dados = await obterRelatorio(p, f);
      if (id === requisicaoAtual.current) setRelatorio(dados);
    } catch (e) {
      if (id === requisicaoAtual.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar o relatório.");
    } finally {
      if (id === requisicaoAtual.current) setCarregando(false);
    }
  }, []);

  const chave = `${periodo.inicio.getTime()}-${periodo.fim.getTime()}-${filtros.tecnicoId}-${filtros.tipoId}`;
  useEffect(() => {
    carregar(periodo, filtros);
    // recarrega quando período ou filtros mudam
  }, [chave, carregar]);

  // cadastros dos filtros: quem não tem acesso a eles simplesmente não vê o filtro
  useEffect(() => {
    listarTiposServico()
      .then(setTipos)
      .catch(() => setTipos([]));
    if (!hasFeature("technicians")) {
      setTecnicos([]);
      return;
    }
    listarTecnicosAtivos()
      .then(setTecnicos)
      .catch(() => setTecnicos([]));
  }, [hasFeature]);

  function alterarPeriodo(novo: Periodo) {
    const p = new URLSearchParams(params);
    if (novo.preset === "personalizado") {
      p.set("periodo", "personalizado");
      p.set("de", dataParaInput(novo.inicio));
      p.set("ate", dataParaInput(new Date(novo.fim.getTime() - 86_400_000)));
    } else {
      p.set("periodo", novo.preset);
      p.delete("de");
      p.delete("ate");
    }
    setParams(p, { replace: true });
  }

  function alterarFiltro(chaveFiltro: "tecnico" | "tipo", valor: string) {
    const p = new URLSearchParams(params);
    if (valor) p.set(chaveFiltro, valor);
    else p.delete(chaveFiltro);
    setParams(p, { replace: true });
  }

  const porMes = relatorio?.periodo.granularidade === "mes";
  const serie = relatorio?.os_por_periodo ?? [];
  const rotulosSerie = serie.map((p) => {
    const d = dataLocal(p.inicio);
    return porMes ? `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : `${String(d.getDate()).padStart(2, "0")} ${MESES_CURTOS[d.getMonth()]}`;
  });
  const rotulosSerieCompletos = serie.map((p) =>
    porMes ? formatoMesCompleto.format(dataLocal(p.inicio)) : formatoDiaCompleto.format(dataLocal(p.inicio)),
  );

  function exportar() {
    if (!relatorio) return;
    const r = relatorio.resumo;
    const linhas: (string | number | null)[][] = [
      ["Relatório de ordens de serviço"],
      ["Período", descreverPeriodo(periodo)],
      [],
      ["Resumo", "Valor"],
      ["OS criadas", r.criadas],
      ["Em aberto", r.em_aberto],
      ["Finalizadas", r.finalizadas],
      ["Canceladas", r.canceladas],
      ["Tempo médio de atendimento (h)", r.tempo_medio_horas ?? "sem amostra suficiente"],
      ["OS no cálculo do tempo médio", r.amostra_tempo_total],
      ["Finalizadas com prazo", r.com_prazo],
      ["No prazo", r.no_prazo],
      ["Com atraso", r.com_atraso],
      [],
      [porMes ? "Mês" : "Dia", "Criadas", "Finalizadas"],
      ...serie.map((p, i) => [rotulosSerieCompletos[i], p.criadas, p.finalizadas]),
      [],
      ["Status", "OS"],
      ...relatorio.os_por_status.map((s) => [s.nome, s.total]),
      [],
      ["Prioridade", "OS"],
      ...relatorio.os_por_prioridade.map((p) => [p.nome, p.total]),
      [],
      ["Técnico", "OS", "Finalizadas", "Tempo médio (h)"],
      ...relatorio.os_por_tecnico.map((t) => [t.nome, t.total, t.finalizadas, t.tempo_medio_horas ?? ""]),
    ];
    if (relatorio.clientes) {
      linhas.push([], ["Cliente", "OS", "Finalizadas"], ...relatorio.clientes.map((c) => [c.nome, c.total, c.finalizadas]));
    }
    if (relatorio.equipamentos) {
      linhas.push([], ["Equipamento", "Cliente", "Chamados"], ...relatorio.equipamentos.map((e) => [e.nome, e.cliente ?? "", e.total]));
    }
    const de = dataParaInput(periodo.inicio);
    const ate = dataParaInput(new Date(periodo.fim.getTime() - 86_400_000));
    baixarCsv(`relatorio-os-${de}-a-${ate}.csv`, montarCsv(linhas));
  }

  if (erro && !relatorio) {
    return (
      <TelaAviso
        icone={AlertTriangle}
        tom="perigo"
        titulo="Não foi possível carregar o relatório"
        descricao={erro}
        acoes={
          <button
            onClick={() => carregar(periodo, filtros)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Tentar novamente
          </button>
        }
      />
    );
  }

  const r = relatorio?.resumo;
  const semDados = !!relatorio && r?.criadas === 0;

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Relatórios</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Números das ordens de serviço no período — {descreverPeriodo(periodo)}
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={!relatorio}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" /> Exportar CSV
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <FiltroPeriodo periodo={periodo} onAlterar={alterarPeriodo} />
        <div className="flex flex-wrap gap-2">
          {tecnicos !== null && tecnicos.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Técnico
              <select
                value={filtros.tecnicoId}
                onChange={(e) => alterarFiltro("tecnico", e.target.value)}
                className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                <option value="">Todos</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tipos !== null && tipos.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Tipo de serviço
              <select
                value={filtros.tipoId}
                onChange={(e) => alterarFiltro("tipo", e.target.value)}
                className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                <option value="">Todos</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {erro && relatorio && (
        <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-text-primary">
          {erro}
        </p>
      )}

      {carregando && !relatorio ? (
        <div className="mt-5 animate-pulse" aria-hidden="true">
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
      ) : relatorio && r ? (
        <div className={`mt-5 flex flex-col gap-4 ${carregando ? "opacity-60" : ""}`} aria-busy={carregando}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <CartaoIndicador rotulo="OS criadas" valor={formatarNumero(r.criadas)} detalhe="no período" />
            <CartaoIndicador rotulo="Finalizadas" valor={formatarNumero(r.finalizadas)} detalhe={porcentagem(r.finalizadas, r.criadas) + " das criadas"} />
            <CartaoIndicador rotulo="Canceladas" valor={formatarNumero(r.canceladas)} detalhe={porcentagem(r.canceladas, r.criadas) + " das criadas"} />
            <CartaoIndicador rotulo="Em aberto" valor={formatarNumero(r.em_aberto)} detalhe="ainda não encerradas" />
            <CartaoIndicador
              rotulo="Tempo médio"
              valor={formatarDuracaoHoras(r.tempo_medio_horas)}
              detalhe={
                r.tempo_medio_horas === null
                  ? `precisa de ${relatorio.amostra_minima} OS finalizadas`
                  : `da abertura à conclusão · ${formatarNumero(r.amostra_tempo_total)} OS`
              }
            />
          </div>

          {r.com_prazo > 0 && (
            <section className="rounded-xl border border-border bg-panel p-5">
              <h2 className="font-display text-sm font-semibold text-text-primary">Cumprimento de prazo</h2>
              <p className="mt-1 text-xs text-text-muted">
                Entre as {formatarNumero(r.com_prazo)} OS finalizadas que tinham prazo definido.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-6">
                <p className="text-sm text-text-secondary">
                  <span className="font-display text-xl font-semibold text-success">{porcentagem(r.no_prazo, r.com_prazo)}</span>{" "}
                  no prazo ({formatarNumero(r.no_prazo)})
                </p>
                <p className="text-sm text-text-secondary">
                  <span className="font-display text-xl font-semibold text-danger">{porcentagem(r.com_atraso, r.com_prazo)}</span>{" "}
                  com atraso ({formatarNumero(r.com_atraso)})
                </p>
                {r.tempo_execucao_medio_horas !== null && (
                  <p className="text-sm text-text-secondary">
                    Tempo médio de execução:{" "}
                    <span className="font-medium text-text-primary">{formatarDuracaoHoras(r.tempo_execucao_medio_horas)}</span>
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CartaoGrafico
              className="lg:col-span-2"
              titulo="OS por período"
              descricao={`Criadas e finalizadas por ${porMes ? "mês" : "dia"}`}
              vazio={serie.every((p) => p.criadas === 0 && p.finalizadas === 0)}
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
                descricaoAcessivel={`${formatoNumero.format(r.criadas)} OS criadas e ${formatoNumero.format(r.finalizadas)} finalizadas no período`}
                series={[
                  { id: "criadas", nome: "Criadas", cor: COR_SERIE.primaria, valores: serie.map((p) => p.criadas) },
                  { id: "finalizadas", nome: "Finalizadas", cor: COR_SERIE.secundaria, valores: serie.map((p) => p.finalizadas) },
                ]}
              />
            </CartaoGrafico>

            <CartaoGrafico
              titulo="OS por status"
              descricao="OS criadas no período, pelo status atual"
              vazio={relatorio.os_por_status.every((s) => s.total === 0)}
              tabela={<TabelaDados colunas={["Status", "OS"]} linhas={relatorio.os_por_status.map((s) => [s.nome, s.total])} />}
            >
              <BarrasHorizontais
                unidade={{ singular: "OS", plural: "OS" }}
                itens={relatorio.os_por_status.map((s) => ({ id: s.id, rotulo: s.nome, valor: s.total, marcador: s.cor }))}
              />
            </CartaoGrafico>

            <CartaoGrafico
              titulo="OS por técnico"
              descricao="Inclui as OS sem técnico atribuído"
              vazio={relatorio.os_por_tecnico.length === 0}
              tabela={
                <TabelaDados
                  colunas={["Técnico", "OS", "Finalizadas", "Tempo médio"]}
                  linhas={relatorio.os_por_tecnico.map((t) => [
                    t.nome,
                    t.total,
                    t.finalizadas,
                    formatarDuracaoHoras(t.tempo_medio_horas),
                  ])}
                />
              }
            >
              <BarrasHorizontais
                unidade={{ singular: "OS", plural: "OS" }}
                itens={relatorio.os_por_tecnico.map((t) => ({ id: t.id ?? "sem-tecnico", rotulo: t.nome, valor: t.total }))}
              />
            </CartaoGrafico>

            <CartaoGrafico
              titulo="OS por prioridade"
              vazio={relatorio.os_por_prioridade.every((p) => p.total === 0)}
              tabela={
                <TabelaDados colunas={["Prioridade", "OS"]} linhas={relatorio.os_por_prioridade.map((p) => [p.nome, p.total])} />
              }
            >
              <BarrasHorizontais
                unidade={{ singular: "OS", plural: "OS" }}
                itens={relatorio.os_por_prioridade.map((p) => ({ id: p.id, rotulo: p.nome, valor: p.total, marcador: p.cor }))}
              />
            </CartaoGrafico>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {relatorio.clientes && (
              <TabelaTop
                titulo="Clientes com mais OS"
                colunas={["Cliente", "OS", "Finalizadas"]}
                vazio="Nenhuma OS no período."
                linhas={relatorio.clientes.map((c) => ({
                  chave: c.id,
                  celulas: [c.nome, formatarNumero(c.total), formatarNumero(c.finalizadas)],
                  link: `/app/customers/${c.id}`,
                }))}
              />
            )}
            {relatorio.equipamentos && (
              <TabelaTop
                titulo="Equipamentos com mais chamados"
                colunas={["Equipamento", "Cliente", "Chamados"]}
                vazio="Nenhuma OS com equipamento no período."
                linhas={relatorio.equipamentos.map((e) => ({
                  chave: e.id,
                  celulas: [e.nome, e.cliente ?? "—", formatarNumero(e.total)],
                  link: `/app/assets/${e.id}`,
                }))}
              />
            )}
          </div>

          {semDados && (
            <p className="text-center text-sm text-text-muted">
              Nenhuma OS criada neste período. Ajuste o período ou os filtros acima.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
