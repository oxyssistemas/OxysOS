import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type { AgendaPeriodo, Conflito, RespostaAgendamento, StatusAgendamento } from "./tipos";

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("agenda", error, {}, padrao);
}

export interface ConsultaAgenda {
  inicio: Date;
  /** exclusivo */
  fim: Date;
  tecnico?: string;
  equipe?: string;
  incluirCancelados?: boolean;
}

export async function carregarAgenda(consulta: ConsultaAgenda): Promise<AgendaPeriodo> {
  const { data, error } = await supabase.rpc("agenda_periodo", {
    p_inicio: consulta.inicio.toISOString(),
    p_fim: consulta.fim.toISOString(),
    p_tecnico: consulta.tecnico || null,
    p_equipe: consulta.equipe || null,
    p_incluir_cancelados: consulta.incluirCancelados ?? false,
  });
  if (error) throw erro(error, "Não foi possível carregar a agenda.");
  return data as AgendaPeriodo;
}

// ---------------------------------------------------------------------------
// Agendamento (etapa 5)
// ---------------------------------------------------------------------------

/** fuso do navegador — o banco guarda timestamptz e devolve as horas locais */
const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

export async function consultarConflitos(dados: {
  tecnico?: string;
  equipe?: string;
  inicio: Date;
  fim: Date;
  ignorar?: string;
}): Promise<Conflito[]> {
  const { data, error } = await supabase.rpc("conflitos_agendamento", {
    p_tecnico: dados.tecnico || null,
    p_equipe: dados.equipe || null,
    p_inicio: dados.inicio.toISOString(),
    p_fim: dados.fim.toISOString(),
    p_ignorar: dados.ignorar || null,
    p_fuso: FUSO,
  });
  if (error) throw erro(error, "Não foi possível verificar os conflitos da agenda.");
  return (data ?? []) as Conflito[];
}

export interface DadosAgendamento {
  osId: string;
  inicio: Date;
  fim: Date;
  tecnico?: string;
  equipe?: string;
  observacao?: string;
  forcar?: boolean;
}

export async function agendarOs(dados: DadosAgendamento): Promise<RespostaAgendamento> {
  const { data, error } = await supabase.rpc("agendar_os", {
    p_os_id: dados.osId,
    p_inicio: dados.inicio.toISOString(),
    p_fim: dados.fim.toISOString(),
    p_tecnico: dados.tecnico || null,
    p_equipe: dados.equipe || null,
    p_observacao: dados.observacao?.trim() || null,
    p_forcar: dados.forcar ?? false,
    p_fuso: FUSO,
  });
  if (error) throw erro(error, "Não foi possível agendar o atendimento.");
  return data as RespostaAgendamento;
}

export async function reagendarAgendamento(
  id: string,
  versao: number,
  dados: Omit<DadosAgendamento, "osId">,
): Promise<RespostaAgendamento> {
  const { data, error } = await supabase.rpc("reagendar_agendamento", {
    p_id: id,
    p_versao: versao,
    p_inicio: dados.inicio.toISOString(),
    p_fim: dados.fim.toISOString(),
    p_tecnico: dados.tecnico || null,
    p_equipe: dados.equipe || null,
    p_observacao: dados.observacao?.trim() || null,
    p_forcar: dados.forcar ?? false,
    p_fuso: FUSO,
  });
  if (error) throw erro(error, "Não foi possível reagendar o atendimento.");
  return data as RespostaAgendamento;
}

export async function definirStatusAgendamento(
  id: string,
  versao: number,
  status: StatusAgendamento,
  motivo?: string,
): Promise<void> {
  const { error } = await supabase.rpc("definir_status_agendamento", {
    p_id: id,
    p_versao: versao,
    p_status: status,
    p_motivo: motivo?.trim() || null,
    p_fuso: FUSO,
  });
  if (error) throw erro(error, "Não foi possível atualizar o atendimento.");
}
