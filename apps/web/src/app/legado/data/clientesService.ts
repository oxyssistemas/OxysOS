import { supabase } from "@oxys/shared/supabase";
import type { Cliente } from "../types";

export async function listarClientes(lojaId: string): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("loja_id", lojaId)
    .is("arquivado_em", null)
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as Cliente[];
}

export interface NovoClienteInput {
  loja_id: string;
  nome: string;
  telefone: string;
  email: string;
}

export async function criarCliente(input: NovoClienteInput): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      loja_id: input.loja_id,
      nome: input.nome,
      telefone: input.telefone || null,
      email: input.email || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Cliente;
}

export interface AtualizarClienteInput {
  id: string;
  nome: string;
  telefone: string;
  email: string;
}

export async function atualizarCliente(input: AtualizarClienteInput): Promise<void> {
  const { error } = await supabase
    .from("clientes")
    .update({
      nome: input.nome,
      telefone: input.telefone || null,
      email: input.email || null,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
}
