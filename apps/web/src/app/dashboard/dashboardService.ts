import { supabase } from "@oxys/shared/supabase";
import { fusoDoNavegador, type Periodo } from "./periodo";
import type { NivelPrioridade } from "../configuracoes/tipos";

export interface CardsDashboard {
  os_abertas: number | null;
  os_agendadas: number | null;
  os_em_andamento: number | null;
  os_pausadas: number | null;
  os_criadas_periodo: number | null;
  os_finalizadas_periodo: number | null;
  clientes_total: number | null;
  clientes_novos_periodo: number | null;
  /** null = ainda sem fonte de dados (não exibir) */
  os_atrasadas: number | null;
  os_vencendo: number | null;
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

export interface OsPorPrioridade {
  id: string;
  nome: string;
  cor: string;
  nivel: NivelPrioridade;
  total: number;
}

export interface OsPorPeriodo {
  /** AAAA-MM-DD (dia ou primeiro dia do mês) */
  inicio: string;
  criadas: number;
  finalizadas: number;
}

export interface OsPorTecnico {
  id: string | null;
  nome: string;
  total: number;
}

export interface ResumoDashboard {
  periodo: { inicio: string; fim: string; fuso: string; granularidade: "dia" | "mes" };
  cards: CardsDashboard;
  os_por_status: OsPorStatus[] | null;
  os_por_periodo: OsPorPeriodo[] | null;
  os_por_tecnico: OsPorTecnico[] | null;
  os_por_prioridade: OsPorPrioridade[] | null;
}

export type AcaoAtividade =
  | "os_criada"
  | "os_status_alterado"
  | "os_reparo_iniciado"
  | "os_concluida"
  | "os_local_alterado"
  | "os_prioridade_alterada"
  | "os_tipo_servico_alterado"
  | "os_atualizada"
  | "os_tecnico_atribuido"
  | "os_tecnico_removido"
  | "os_item_adicionado"
  | "os_item_alterado"
  | "os_item_removido"
  | "os_anexo_adicionado"
  | "os_anexo_removido"
  | "os_checklist_aplicado"
  | "os_checklist_concluido"
  | "os_checklist_removido"
  | "cliente_cadastrado"
  | "tecnico_cadastrado"
  | "equipamento_cadastrado"
  | "funcionario_criado"
  | "funcionario_atualizado"
  | "funcionario_cargo_alterado"
  | "funcionario_desativado"
  | "funcionario_reativado";

export interface ItemAtividade {
  id: string;
  acao: AcaoAtividade | string;
  criado_em: string;
  usuario: string | null;
  os: { id: string; numero: string | null; cliente: string | null } | null;
  status_novo: string | null;
  cliente: string | null;
  cliente_id: string | null;
  tecnico: string | null;
  equipamento: string | null;
  equipamento_id: string | null;
  funcionario: string | null;
  /** descrição do item em eventos de itens da OS */
  item: string | null;
  /** nome do arquivo em eventos de anexos da OS */
  arquivo: string | null;
  /** nome do checklist em eventos de checklist da OS */
  checklist: string | null;
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
