import { supabase, callEdgeFunction } from "@oxys/shared/supabase";
import type { Funcionario } from "../types";

export async function listarFuncionarios(lojaId: string): Promise<Funcionario[]> {
  const [{ data: usuarios, error: usuariosError }, { data: seguranca }] = await Promise.all([
    supabase
      .from("usuarios")
      .select("*")
      .eq("loja_id", lojaId)
      .eq("papel", "funcionario")
      .order("nome"),
    supabase.from("usuarios_seguranca").select("*"),
  ]);

  if (usuariosError) throw new Error(usuariosError.message);

  const codigosPorUsuario = new Map<string, string | null>(
    (seguranca ?? []).map((s) => [s.usuario_id, s.codigo_autorizacao]),
  );

  return (usuarios ?? []).map((u) => ({
    ...u,
    codigo_autorizacao: codigosPorUsuario.get(u.id) ?? null,
  })) as Funcionario[];
}

export interface CriarFuncionarioInput {
  nome: string;
  email: string;
  senha: string;
  codigo_autorizacao: string;
}

export async function criarFuncionario(input: CriarFuncionarioInput): Promise<{ sucesso: boolean }> {
  return callEdgeFunction("criar-funcionario", input);
}

export interface AtualizarFuncionarioInput {
  funcionario_id: string;
  nome: string;
  email: string;
  ativo: boolean;
  codigo_autorizacao: string;
}

export async function atualizarFuncionario(input: AtualizarFuncionarioInput): Promise<void> {
  await callEdgeFunction("atualizar-funcionario", input);
}
