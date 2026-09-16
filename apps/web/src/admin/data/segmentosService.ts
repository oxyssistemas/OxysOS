import { supabase } from "@oxys/shared/supabase";
import type { Segmento } from "../types";

export async function listarSegmentos(): Promise<Segmento[]> {
  const { data, error } = await supabase.from("segmentos").select("*").order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as Segmento[];
}

export interface SegmentoInput {
  nome: string;
  slug: string;
}

export async function criarSegmento(input: SegmentoInput): Promise<void> {
  const { error } = await supabase.from("segmentos").insert(input);
  if (error) throw new Error(error.message);
}

export async function atualizarSegmento(id: string, input: SegmentoInput): Promise<void> {
  const { error } = await supabase.from("segmentos").update(input).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function alternarAtivoSegmento(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("segmentos").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listarFuncionalidadesRecomendadas(segmentoId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("segmento_funcionalidades")
    .select("funcionalidade_id")
    .eq("segmento_id", segmentoId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.funcionalidade_id as string);
}

export async function definirFuncionalidadesRecomendadas(
  segmentoId: string,
  funcionalidadeIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("segmento_funcionalidades")
    .delete()
    .eq("segmento_id", segmentoId);
  if (deleteError) throw new Error(deleteError.message);

  if (funcionalidadeIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("segmento_funcionalidades")
    .insert(funcionalidadeIds.map((funcionalidade_id) => ({ segmento_id: segmentoId, funcionalidade_id })));
  if (insertError) throw new Error(insertError.message);
}
