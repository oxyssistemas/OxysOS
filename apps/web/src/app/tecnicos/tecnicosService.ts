import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type {
  DadosTecnicoForm,
  Especialidade,
  FiltrosTecnicos,
  Tecnico,
  TecnicoListagem,
  UsuarioVinculavel,
} from "./tipos";

export const TECNICOS_POR_PAGINA = 20;

const MENSAGENS_RESTRICAO: Record<string, string> = {
  tecnicos_loja_email_key: "Já existe um técnico com este e-mail.",
  tecnicos_loja_documento_key: "Já existe um técnico com este CPF.",
  tecnicos_loja_usuario_key: "Este usuário já está vinculado a outro técnico.",
  tecnicos_usuario_mesma_loja_fkey: "Usuário inválido para esta empresa.",
  tecnicos_documento_valido: "CPF inválido.",
  tecnicos_email_valido: "E-mail inválido.",
  tecnicos_telefone_valido: "Telefone inválido.",
  tecnicos_nome_tamanho: "Informe o nome do técnico.",
  especialidades_loja_nome_key: "Já existe uma especialidade com esse nome.",
  especialidades_nome_tamanho: "O nome da especialidade deve ter até 60 caracteres.",
  tecnico_especialidades_especialidade_fkey: "Especialidade inválida ou em uso.",
};

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("tecnicos", error, MENSAGENS_RESTRICAO, padrao);
}

// ---------------------------------------------------------------------------
// Técnicos
// ---------------------------------------------------------------------------

export async function listarTecnicos(filtros: FiltrosTecnicos): Promise<{ tecnicos: TecnicoListagem[]; total: number }> {
  const { data, error } = await supabase.rpc("listar_tecnicos", {
    p_busca: filtros.busca || null,
    p_status: filtros.status,
    p_especialidade: filtros.especialidade || null,
    p_pagina: filtros.pagina,
    p_por_pagina: TECNICOS_POR_PAGINA,
  });
  if (error) throw erro(error, "Não foi possível carregar os técnicos.");
  const resultado = data as { itens: TecnicoListagem[]; total: number };
  return { tecnicos: resultado.itens, total: resultado.total };
}

export async function obterTecnico(id: string): Promise<Tecnico | null> {
  const { data, error } = await supabase
    .from("tecnicos")
    .select(
      "id, nome, sobrenome, email, telefone, documento, observacoes, usuario_id, ativo, desativado_em, criado_em, versao, tecnico_especialidades(especialidade_id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw erro(error, "Não foi possível carregar o técnico.");
  if (!data) return null;
  const { tecnico_especialidades, ...tecnico } = data as Omit<Tecnico, "especialidade_ids"> & {
    tecnico_especialidades: { especialidade_id: string }[];
  };
  return { ...tecnico, especialidade_ids: tecnico_especialidades.map((te) => te.especialidade_id) };
}

/** Cria (id null) ou atualiza com verificação de versão; especialidades na mesma transação. */
export async function salvarTecnico(
  id: string | null,
  versao: number | null,
  dados: DadosTecnicoForm,
): Promise<string> {
  const { data, error } = await supabase.rpc("salvar_tecnico", {
    p_id: id,
    p_versao: versao,
    p_dados: {
      nome: dados.nome.trim(),
      sobrenome: dados.sobrenome.trim() || null,
      email: dados.email.trim() || null,
      telefone: dados.telefone.trim() || null,
      documento: dados.documento.replace(/\D/g, "") || null,
      observacoes: dados.observacoes.trim() || null,
      usuario_id: dados.usuario_id || null,
    },
    p_especialidades: dados.especialidade_ids,
  });
  if (error) throw erro(error, "Não foi possível salvar o técnico. Tente novamente.");
  return data as string;
}

export async function definirTecnicoAtivo(id: string, versao: number, ativo: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("tecnicos")
    .update({ ativo })
    .eq("id", id)
    .eq("versao", versao)
    .select("id");
  if (error) throw erro(error, ativo ? "Não foi possível reativar o técnico." : "Não foi possível desativar o técnico.");
  if (!data || data.length === 0) {
    throw new Error("Este técnico foi alterado por outra pessoa. Recarregue a lista e tente novamente.");
  }
}

export async function listarUsuariosVinculaveis(): Promise<{ usuarios: UsuarioVinculavel[]; vinculados: Map<string, string> }> {
  const [usuarios, vinculos] = await Promise.all([
    supabase.from("usuarios").select("id, nome, email, ativo").order("nome"),
    supabase.from("tecnicos").select("id, usuario_id").not("usuario_id", "is", null),
  ]);
  if (usuarios.error) throw erro(usuarios.error, "Não foi possível carregar a equipe.");
  if (vinculos.error) throw erro(vinculos.error, "Não foi possível carregar a equipe.");
  return {
    usuarios: (usuarios.data ?? []) as UsuarioVinculavel[],
    // usuario_id → tecnico_id
    vinculados: new Map((vinculos.data ?? []).map((v) => [v.usuario_id as string, v.id as string])),
  };
}

// ---------------------------------------------------------------------------
// Especialidades
// ---------------------------------------------------------------------------

export async function listarEspecialidades(): Promise<Especialidade[]> {
  const { data, error } = await supabase
    .from("especialidades")
    .select("id, nome, ativo, tecnico_especialidades(count)")
    .order("nome");
  if (error) throw erro(error, "Não foi possível carregar as especialidades.");
  return (data ?? []).map((e) => {
    const contagem = e.tecnico_especialidades as unknown as { count: number }[];
    return { id: e.id, nome: e.nome, ativo: e.ativo, total_tecnicos: contagem[0]?.count ?? 0 };
  });
}

export async function criarEspecialidade(lojaId: string, nome: string): Promise<Especialidade> {
  const { data, error } = await supabase
    .from("especialidades")
    .insert({ loja_id: lojaId, nome: nome.trim() })
    .select("id, nome, ativo")
    .single();
  if (error) throw erro(error, "Não foi possível criar a especialidade.");
  return { ...(data as { id: string; nome: string; ativo: boolean }), total_tecnicos: 0 };
}

export async function renomearEspecialidade(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from("especialidades").update({ nome: nome.trim() }).eq("id", id);
  if (error) throw erro(error, "Não foi possível renomear a especialidade.");
}

export async function definirEspecialidadeAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("especialidades").update({ ativo }).eq("id", id);
  if (error) throw erro(error, "Não foi possível atualizar a especialidade.");
}

export async function excluirEspecialidade(id: string): Promise<void> {
  const { error } = await supabase.from("especialidades").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      console.error("[tecnicos]", error);
      throw new Error("Especialidade em uso por técnicos. Desative-a em vez de excluir.");
    }
    throw erro(error, "Não foi possível excluir a especialidade.");
  }
}
