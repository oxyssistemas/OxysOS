import type { NivelPrioridade } from "../configuracoes/tipos";

export interface ResumoRelatorio {
  criadas: number;
  em_aberto: number;
  finalizadas: number;
  canceladas: number;
  /** quantas OS entraram no cálculo do tempo médio */
  amostra_tempo_total: number;
  /** null quando a amostra é menor que `amostra_minima` */
  tempo_medio_horas: number | null;
  amostra_tempo_execucao: number;
  tempo_execucao_medio_horas: number | null;
  /** finalizadas que tinham prazo definido */
  com_prazo: number;
  no_prazo: number;
  com_atraso: number;
}

export interface PontoPeriodo {
  /** AAAA-MM-DD (dia ou primeiro dia do mês) */
  inicio: string;
  criadas: number;
  finalizadas: number;
}

export interface LinhaStatus {
  id: string;
  nome: string;
  cor: string | null;
  categoria: string;
  total: number;
}

export interface LinhaPrioridade {
  id: string;
  nome: string;
  cor: string;
  nivel: NivelPrioridade;
  total: number;
}

export interface LinhaTecnico {
  id: string | null;
  nome: string;
  total: number;
  finalizadas: number;
  tempo_medio_horas: number | null;
}

export interface LinhaCliente {
  id: string;
  nome: string;
  total: number;
  finalizadas: number;
}

export interface LinhaEquipamento {
  id: string;
  nome: string;
  cliente: string | null;
  total: number;
}

export interface Relatorio {
  periodo: { inicio: string; fim: string; fuso: string; granularidade: "dia" | "mes" };
  filtros: { tecnico_id: string | null; tipo_servico_id: string | null };
  /** mínimo de OS para o tempo médio ser exibido */
  amostra_minima: number;
  resumo: ResumoRelatorio;
  os_por_periodo: PontoPeriodo[];
  os_por_status: LinhaStatus[];
  os_por_prioridade: LinhaPrioridade[];
  os_por_tecnico: LinhaTecnico[];
  /** null = empresa sem o módulo de clientes (ou sem permissão) */
  clientes: LinhaCliente[] | null;
  /** null = empresa sem o módulo de equipamentos (ou sem permissão) */
  equipamentos: LinhaEquipamento[] | null;
}

export interface FiltrosRelatorio {
  tecnicoId: string;
  tipoId: string;
}

const numero = new Intl.NumberFormat("pt-BR");

export function formatarNumero(valor: number): string {
  return numero.format(valor);
}

/** 32 h vira "1 d 8 h"; menos de 1 h vira minutos. */
export function formatarDuracaoHoras(horas: number | null): string {
  if (horas === null) return "—";
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 24) return `${numero.format(Number(horas.toFixed(1)))} h`;
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas - dias * 24);
  return resto === 0 ? `${dias} d` : `${dias} d ${resto} h`;
}

export function porcentagem(parte: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((parte / total) * 100)}%`;
}
