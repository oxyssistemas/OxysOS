import { supabase } from "@oxys/shared/supabase";
import type { Funcionalidade } from "../types";

export async function listarFuncionalidades(): Promise<Funcionalidade[]> {
  const { data, error } = await supabase.from("funcionalidades").select("*").order("categoria").order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as Funcionalidade[];
}

export interface FuncionalidadeInput {
  nome: string;
  key: string;
  descricao: string;
  categoria: string;
}

export async function criarFuncionalidade(input: FuncionalidadeInput): Promise<void> {
  const { error } = await supabase.from("funcionalidades").insert(input);
  if (error) throw new Error(error.message);
}

export async function atualizarFuncionalidade(id: string, input: FuncionalidadeInput): Promise<void> {
  const { error } = await supabase.from("funcionalidades").update(input).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function alternarAtivoFuncionalidade(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("funcionalidades").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
}
