import { supabase } from "@oxys/shared/supabase";
import type { LogAuditoria } from "../types";

export async function listarLogs(limite = 100): Promise<LogAuditoria[]> {
  const { data, error } = await supabase
    .from("logs_auditoria")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as LogAuditoria[];
}

export async function listarLogsDaLoja(lojaId: string): Promise<LogAuditoria[]> {
  const { data, error } = await supabase
    .from("logs_auditoria")
    .select("*")
    .eq("loja_id", lojaId)
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LogAuditoria[];
}

export interface RegistrarLogInput {
  ator_usuario_id: string;
  loja_id?: string | null;
  acao: string;
  tipo_entidade: string;
  entidade_id?: string | null;
  metadados?: Record<string, unknown>;
}

export async function registrarLog(input: RegistrarLogInput): Promise<void> {
  await supabase.from("logs_auditoria").insert({
    ator_usuario_id: input.ator_usuario_id,
    loja_id: input.loja_id ?? null,
    acao: input.acao,
    tipo_entidade: input.tipo_entidade,
    entidade_id: input.entidade_id ?? null,
    metadados: input.metadados ?? null,
  });
}
