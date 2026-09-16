import { supabase } from "@oxys/shared/supabase";
import type { StatusOS, UsuarioResponsavel } from "../types";

export async function listarStatusOS(lojaId: string): Promise<StatusOS[]> {
  const { data, error } = await supabase
    .from("status_os")
    .select("*")
    .eq("loja_id", lojaId)
    .order("ordem");
  if (error) throw new Error(error.message);
  return (data ?? []) as StatusOS[];
}

export interface NovoStatusInput {
  loja_id: string;
  nome: string;
  categoria: StatusOS["categoria"];
  cor: string;
  ordem: number;
}

export async function criarStatusOS(input: NovoStatusInput): Promise<void> {
  const { error } = await supabase.from("status_os").insert(input);
  if (error) throw new Error(error.message);
}

export interface AtualizarStatusInput {
  id: string;
  nome: string;
  categoria: StatusOS["categoria"];
  cor: string;
}

export async function atualizarStatusOS(input: AtualizarStatusInput): Promise<void> {
  const { id, ...campos } = input;
  const { error } = await supabase.from("status_os").update(campos).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function excluirStatusOS(id: string): Promise<void> {
  const { error } = await supabase.from("status_os").delete().eq("id", id);
  if (error) {
    if (error.message.includes("foreign key") || error.code === "23503") {
      throw new Error("Não é possível excluir: existem ordens de serviço usando esse status.");
    }
    throw new Error(error.message);
  }
}

export async function reordenarStatusOS(itens: { id: string; ordem: number }[]): Promise<void> {
  await Promise.all(
    itens.map((item) => supabase.from("status_os").update({ ordem: item.ordem }).eq("id", item.id)),
  );
}

export async function listarResponsaveis(lojaId: string): Promise<UsuarioResponsavel[]> {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, papel")
    .eq("loja_id", lojaId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as UsuarioResponsavel[];
}
