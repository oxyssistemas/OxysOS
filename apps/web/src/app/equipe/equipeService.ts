import type { PostgrestError } from "@supabase/supabase-js";
import { callEdgeFunction, supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type { ChavePermissao } from "../types";
import type { CargosPermissoes, DadosCargoForm, DadosUsuarioForm, UsuarioEquipe } from "./tipos";

const MENSAGENS_RESTRICAO: Record<string, string> = {
  cargos_loja_nome_key: "Já existe um cargo com esse nome.",
  cargos_nome_tamanho: "O nome do cargo deve ter de 2 a 60 caracteres.",
  cargos_descricao_tamanho: "A descrição deve ter até 200 caracteres.",
  usuarios_nome_tamanho: "O nome deve ter de 2 a 80 caracteres.",
};

function erro(error: PostgrestError, padrao: string): Error {
  const amigavel = erroAmigavel("equipe", error, MENSAGENS_RESTRICAO, padrao);
  if (error.code === "P0002" && /^[A-ZÀ-Ú][^\n]{5,200}\.$/.test(error.message)) return new Error(error.message);
  return amigavel;
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

export async function listarEquipe(): Promise<UsuarioEquipe[]> {
  const { data, error } = await supabase.rpc("listar_equipe");
  if (error) throw erro(error, "Não foi possível carregar a equipe.");
  return (data ?? []) as UsuarioEquipe[];
}

/** Cria o login na empresa (papel funcionario) pela função de servidor. */
export async function criarUsuario(dados: DadosUsuarioForm): Promise<void> {
  await callEdgeFunction("criar-funcionario", {
    nome: dados.nome,
    email: dados.email,
    senha: dados.senha,
    cargo_id: dados.cargo_id,
  });
}

/** E-mail e senha ficam no servidor (auth); nome, cargo e situação têm função própria. */
export async function alterarAcesso(usuarioId: string, dados: { email?: string; senha?: string }): Promise<void> {
  await callEdgeFunction("atualizar-funcionario", { usuario_id: usuarioId, ...dados });
}

export async function renomearUsuario(usuarioId: string, nome: string): Promise<void> {
  const { error } = await supabase.rpc("renomear_usuario_equipe", { p_usuario_id: usuarioId, p_nome: nome });
  if (error) throw erro(error, "Não foi possível alterar o nome.");
}

export async function definirCargoUsuario(usuarioId: string, cargoId: string): Promise<void> {
  const { error } = await supabase.rpc("definir_cargo_usuario", { p_usuario_id: usuarioId, p_cargo_id: cargoId });
  if (error) throw erro(error, "Não foi possível alterar o cargo.");
}

export async function definirUsuarioAtivo(usuarioId: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.rpc("definir_usuario_ativo", { p_usuario_id: usuarioId, p_ativo: ativo });
  if (error) throw erro(error, ativo ? "Não foi possível reativar o usuário." : "Não foi possível desativar o usuário.");
}

// ---------------------------------------------------------------------------
// Cargos e permissões
// ---------------------------------------------------------------------------

export async function listarCargosPermissoes(): Promise<CargosPermissoes> {
  const { data, error } = await supabase.rpc("listar_cargos_permissoes");
  if (error) throw erro(error, "Não foi possível carregar os cargos.");
  return data as CargosPermissoes;
}

export async function salvarCargo(id: string | null, versao: number | null, dados: DadosCargoForm): Promise<string> {
  const { data, error } = await supabase.rpc("salvar_cargo", {
    p_id: id,
    p_versao: versao,
    p_dados: { nome: dados.nome, descricao: dados.descricao },
    p_permissoes: dados.permissoes as ChavePermissao[],
  });
  if (error) throw erro(error, "Não foi possível salvar o cargo.");
  return data as string;
}

export async function definirCargoAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.rpc("definir_cargo_ativo", { p_id: id, p_ativo: ativo });
  if (error) throw erro(error, ativo ? "Não foi possível reativar o cargo." : "Não foi possível desativar o cargo.");
}

export async function excluirCargo(id: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_cargo", { p_id: id });
  if (error) throw erro(error, "Não foi possível excluir o cargo.");
}
