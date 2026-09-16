import { supabase } from "@oxys/shared/supabase";
import { fusoDoNavegador, type Periodo } from "./periodo";

export interface CardsDashboard {
  os_abertas: number | null;
  os_em_andamento: number | null;
  os_pausadas: number | null;
  os_criadas_periodo: number | null;
  os_finalizadas_periodo: number | null;
  clientes_total: number | null;
  clientes_novos_periodo: number | null;
  /** null = ainda sem fonte de dados (não exibir) */
  os_atrasadas: number | null;
  tecnicos_ativos: number | null;
  equipamentos: number | null;
  faturamento_periodo: number | null;
}

export interface OsPorStatus {
  id: string;
  nome: string;
  cor: string | null;
  categoria: string;
  total: number;
}

export interface OsPorPeriodo {
  /** AAAA-MM-DD (dia ou primeiro dia do mês) */
  inicio: string;
  criadas: number;
  finalizadas: number;
}

export interface OsPorResponsavel {
  id: string | null;
  nome: string;
  total: number;
}

export interface ResumoDashboard {
  periodo: { inicio: string; fim: string; fuso: string; granularidade: "dia" | "mes" };
  cards: CardsDashboard;
  os_por_status: OsPorStatus[] | null;
  os_por_periodo: OsPorPeriodo[] | null;
  os_por_responsavel: OsPorResponsavel[] | null;
  os_por_prioridade: null;
}

export type AcaoAtividade =
  | "os_criada"
  | "os_status_alterado"
  | "os_reparo_iniciado"
  | "os_concluida"
  | "cliente_cadastrado"
  | "funcionario_criado";

export interface ItemAtividade {
  id: string;
  acao: AcaoAtividade | string;
  criado_em: string;
  usuario: string | null;
  os: { id: string; cliente: string | null } | null;
  status_novo: string | null;
  cliente: string | null;
  cliente_id: string | null;
  funcionario: string | null;
}

function erroAmigavel(contexto: string, error: unknown): Error {
  console.error(`[dashboard] ${contexto}`, error);
  return new Error("Não foi possível carregar o dashboard. Tente novamente.");
}

export async function obterResumoDashboard(periodo: Periodo): Promise<ResumoDashboard> {
  const { data, error } = await supabase.rpc("dashboard_resumo", {
    p_inicio: periodo.inicio.toISOString(),
    p_fim: periodo.fim.toISOString(),
    p_fuso: fusoDoNavegador(),
  });
  if (error) throw erroAmigavel("resumo", error);
  return data as ResumoDashboard;
}

export async function obterAtividadeRecente(limite = 12): Promise<ItemAtividade[]> {
  const { data, error } = await supabase.rpc("dashboard_atividade", { p_limite: limite });
  if (error) throw erroAmigavel("atividade", error);
  return (data ?? []) as ItemAtividade[];
}
