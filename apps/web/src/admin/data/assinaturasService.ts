import { supabase } from "@oxys/shared/supabase";
import { registrarLog } from "./logsService";
import type { Assinatura, EmpresaFeatureOverride, StatusAssinatura } from "../types";

export async function obterAssinaturaDaLoja(lojaId: string): Promise<Assinatura | null> {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("*")
    .eq("loja_id", lojaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Assinatura) ?? null;
}

export interface CriarAssinaturaInput {
  loja_id: string;
  plano_id: string;
  ciclo_cobranca: "mensal" | "anual";
  trial_dias: number | null;
  ator_usuario_id: string;
}

/** Para empresas criadas antes do módulo de assinaturas (sem assinatura registrada). */
export async function criarAssinatura(input: CriarAssinaturaInput): Promise<void> {
  const agora = new Date();
  const { error } = await supabase.from("assinaturas").insert({
    loja_id: input.loja_id,
    plano_id: input.plano_id,
    status: input.trial_dias ? "trial" : "active",
    ciclo_cobranca: input.ciclo_cobranca,
    trial_termina_em: input.trial_dias
      ? new Date(agora.getTime() + input.trial_dias * 86_400_000).toISOString()
      : null,
    periodo_atual_inicio: agora.toISOString(),
  });
  if (error) throw new Error(error.message);

  await registrarLog({
    ator_usuario_id: input.ator_usuario_id,
    loja_id: input.loja_id,
    acao: "assinatura_criada",
    tipo_entidade: "assinatura",
    metadados: { plano_id: input.plano_id, trial_dias: input.trial_dias },
  });
}

export interface AlterarPlanoInput {
  loja_id: string;
  plano_id: string;
  ator_usuario_id: string;
  plano_anterior_id: string | null;
}

export async function alterarPlano(input: AlterarPlanoInput): Promise<void> {
  const { error } = await supabase
    .from("assinaturas")
    .update({ plano_id: input.plano_id, atualizado_em: new Date().toISOString() })
    .eq("loja_id", input.loja_id);
  if (error) throw new Error(error.message);

  await registrarLog({
    ator_usuario_id: input.ator_usuario_id,
    loja_id: input.loja_id,
    acao: "plano_alterado",
    tipo_entidade: "assinatura",
    metadados: { de: input.plano_anterior_id, para: input.plano_id },
  });
}

export interface AlterarStatusAssinaturaInput {
  loja_id: string;
  status: StatusAssinatura;
  ator_usuario_id: string;
}

export async function alterarStatusAssinatura(input: AlterarStatusAssinaturaInput): Promise<void> {
  const campos: Record<string, unknown> = { status: input.status, atualizado_em: new Date().toISOString() };
  if (input.status === "cancelled") campos.cancelada_em = new Date().toISOString();

  const { error } = await supabase.from("assinaturas").update(campos).eq("loja_id", input.loja_id);
  if (error) throw new Error(error.message);

  await registrarLog({
    ator_usuario_id: input.ator_usuario_id,
    loja_id: input.loja_id,
    acao: "assinatura_status_alterado",
    tipo_entidade: "assinatura",
    metadados: { status: input.status },
  });
}

export async function listarOverridesDaLoja(lojaId: string): Promise<EmpresaFeatureOverride[]> {
  const { data, error } = await supabase
    .from("empresa_feature_overrides")
    .select("*")
    .eq("loja_id", lojaId);
  if (error) throw new Error(error.message);
  return (data ?? []) as EmpresaFeatureOverride[];
}

export interface DefinirOverrideInput {
  loja_id: string;
  funcionalidade_id: string;
  habilitado: boolean;
  ator_usuario_id: string;
  funcionalidade_nome: string;
}

export async function definirOverride(input: DefinirOverrideInput): Promise<void> {
  const { error } = await supabase
    .from("empresa_feature_overrides")
    .upsert(
      { loja_id: input.loja_id, funcionalidade_id: input.funcionalidade_id, habilitado: input.habilitado },
      { onConflict: "loja_id,funcionalidade_id" },
    );
  if (error) throw new Error(error.message);

  await registrarLog({
    ator_usuario_id: input.ator_usuario_id,
    loja_id: input.loja_id,
    acao: input.habilitado ? "feature_liberada" : "feature_bloqueada",
    tipo_entidade: "override",
    metadados: { funcionalidade: input.funcionalidade_nome },
  });
}

export async function removerOverride(lojaId: string, funcionalidadeId: string): Promise<void> {
  const { error } = await supabase
    .from("empresa_feature_overrides")
    .delete()
    .eq("loja_id", lojaId)
    .eq("funcionalidade_id", funcionalidadeId);
  if (error) throw new Error(error.message);
}
