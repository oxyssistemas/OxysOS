import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import { nomeCompleto, type DadosEquipeForm, type Disponibilidade, type Equipe, type MotivoAusencia, type TurnoJornada } from "./tipos";

const MENSAGENS_RESTRICAO: Record<string, string> = {
  equipes_loja_nome_key: "Já existe uma equipe com esse nome.",
  equipes_nome_tamanho: "O nome da equipe deve ter de 2 a 60 caracteres.",
  equipes_descricao_tamanho: "A descrição deve ter até 200 caracteres.",
  equipes_cor_formato: "Escolha uma cor válida.",
  tecnico_jornada_intervalo: "O fim do turno precisa ser depois do início.",
  tecnico_jornada_sem_repeticao: "Já existe um turno começando nesse horário.",
  tecnico_indisponibilidade_intervalo: "O fim do período precisa ser depois do início.",
  tecnico_indisponibilidade_observacao: "A observação deve ter até 300 caracteres.",
  ordens_servico_equipe_fkey: "Equipe inválida para esta empresa.",
};

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("equipes", error, MENSAGENS_RESTRICAO, padrao);
}

// ---------------------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------------------

export async function listarEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase.rpc("listar_equipes");
  if (error) throw erro(error, "Não foi possível carregar as equipes.");
  return (data ?? []) as Equipe[];
}

/** Cria (id null) ou atualiza com verificação de versão; os membros são substituídos. */
export async function salvarEquipe(
  id: string | null,
  versao: number | null,
  dados: DadosEquipeForm,
): Promise<string> {
  const { data, error } = await supabase.rpc("salvar_equipe", {
    p_id: id,
    p_versao: versao,
    p_dados: {
      nome: dados.nome.trim(),
      descricao: dados.descricao.trim() || null,
      cor: dados.cor,
    },
    p_membros: dados.membros,
  });
  if (error) throw erro(error, "Não foi possível salvar a equipe.");
  return data as string;
}

export async function definirEquipeAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.rpc("definir_equipe_ativa", { p_id: id, p_ativo: ativo });
  if (error) throw erro(error, ativo ? "Não foi possível reativar a equipe." : "Não foi possível desativar a equipe.");
}

export async function excluirEquipe(id: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_equipe", { p_id: id });
  if (error) throw erro(error, "Não foi possível excluir a equipe.");
}

/** Técnicos ativos para montar as equipes (a listagem paginada não serve aqui). */
export async function listarTecnicosAtivos(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from("tecnicos")
    .select("id, nome, sobrenome")
    .eq("ativo", true)
    .order("nome");
  if (error) throw erro(error, "Não foi possível carregar os técnicos.");
  return (data ?? []).map((t) => ({ id: t.id as string, nome: nomeCompleto(t as { nome: string; sobrenome: string | null }) }));
}

// ---------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------

export async function obterDisponibilidade(tecnicoId: string): Promise<Disponibilidade> {
  const { data, error } = await supabase.rpc("disponibilidade_tecnico", { p_tecnico_id: tecnicoId });
  if (error) throw erro(error, "Não foi possível carregar a disponibilidade do técnico.");
  return data as Disponibilidade;
}

/** Substitui a jornada semanal inteira do técnico. */
export async function salvarJornadaTecnico(tecnicoId: string, jornada: TurnoJornada[]): Promise<void> {
  const { error } = await supabase.rpc("salvar_jornada_tecnico", {
    p_tecnico_id: tecnicoId,
    p_jornada: jornada,
  });
  if (error) throw erro(error, "Não foi possível salvar a jornada.");
}

export async function registrarAusencia(
  tecnicoId: string,
  motivo: MotivoAusencia,
  inicio: string,
  fim: string,
  observacao: string,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_indisponibilidade", {
    p_tecnico_id: tecnicoId,
    p_motivo: motivo,
    p_inicio: new Date(inicio).toISOString(),
    p_fim: new Date(fim).toISOString(),
    p_observacao: observacao.trim() || null,
  });
  if (error) throw erro(error, "Não foi possível registrar a ausência.");
}

export async function removerAusencia(id: string): Promise<void> {
  const { error } = await supabase.rpc("remover_indisponibilidade", { p_id: id });
  if (error) throw erro(error, "Não foi possível remover a ausência.");
}
