import { supabase } from "@oxys/shared/supabase";
import type { Plano } from "../types";

export async function listarPlanos(): Promise<Plano[]> {
  const { data, error } = await supabase.from("planos").select("*").order("preco_mensal");
  if (error) throw new Error(error.message);
  return (data ?? []) as Plano[];
}

export interface PlanoInput {
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual: number;
}

export async function criarPlano(input: PlanoInput): Promise<Plano> {
  const { data, error } = await supabase.from("planos").insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Plano;
}

export async function atualizarPlano(id: string, input: PlanoInput): Promise<void> {
  const { error } = await supabase.from("planos").update(input).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function alternarAtivoPlano(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("planos").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicarPlano(plano: Plano): Promise<Plano> {
  const novo = await criarPlano({
    nome: `${plano.nome} (cópia)`,
    descricao: plano.descricao ?? "",
    preco_mensal: plano.preco_mensal,
    preco_anual: plano.preco_anual,
  });

  const funcionalidadeIds = await listarFuncionalidadesDoPlano(plano.id);
  await definirFuncionalidadesDoPlano(novo.id, funcionalidadeIds);

  return novo;
}

export async function listarFuncionalidadesDoPlano(planoId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("plano_funcionalidades")
    .select("funcionalidade_id")
    .eq("plano_id", planoId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.funcionalidade_id as string);
}

export async function definirFuncionalidadesDoPlano(
  planoId: string,
  funcionalidadeIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("plano_funcionalidades")
    .delete()
    .eq("plano_id", planoId);
  if (deleteError) throw new Error(deleteError.message);

  if (funcionalidadeIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("plano_funcionalidades")
    .insert(funcionalidadeIds.map((funcionalidade_id) => ({ plano_id: planoId, funcionalidade_id })));
  if (insertError) throw new Error(insertError.message);
}
