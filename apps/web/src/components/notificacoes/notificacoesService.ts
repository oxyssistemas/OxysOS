import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";

export type TipoNotificacao =
  | "atendimento_iniciado"
  | "atendimento_pausado"
  | "os_finalizada"
  | "os_urgente_atrasada"
  | "os_atribuida"
  | "atendimento_agendado"
  | "horario_alterado"
  | "atendimento_cancelado"
  | "os_cancelada";

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  os_id: string | null;
  agendamento_id: string | null;
  criada_em: string;
  lida_em: string | null;
}

export interface CaixaNotificacoes {
  nao_lidas: number;
  itens: Notificacao[];
}

/** O banco gera os avisos (inclusive "OS urgente atrasada") e devolve só os do usuário. */
export async function listarNotificacoes(limite = 30): Promise<CaixaNotificacoes> {
  const { data, error } = await supabase.rpc("minhas_notificacoes", { p_limite: limite });
  if (error) throw erroAmigavel("notificacoes", error, {}, "Não foi possível carregar os avisos.");
  return data as CaixaNotificacoes;
}

/** Sem ids marca todas as do usuário. */
export async function marcarNotificacoesLidas(ids?: string[]): Promise<void> {
  const { error } = await supabase.rpc("marcar_notificacoes_lidas", { p_ids: ids ?? null });
  if (error) throw erroAmigavel("notificacoes", error, {}, "Não foi possível marcar os avisos.");
}

/** "agora", "há 5 min", "há 3 h", "ontem", "12/09". */
export function tempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
