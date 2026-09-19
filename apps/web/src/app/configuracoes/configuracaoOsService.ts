import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type {
  DadosPrioridadeForm,
  DadosStatusForm,
  DadosTipoServicoForm,
  PrioridadeOS,
  StatusOSConfig,
  TipoServico,
  UsoConfiguracaoOS,
} from "./tipos";

const MENSAGENS_RESTRICAO: Record<string, string> = {
  status_os_loja_nome_key: "Já existe um status com esse nome.",
  status_os_nome_tamanho: "O nome do status deve ter até 40 caracteres.",
  status_os_cor_formato: "Cor inválida.",
  status_os_inicial_regras: "O status inicial precisa estar ativo e na categoria Aberta.",
  prioridades_os_loja_nome_key: "Já existe uma prioridade com esse nome.",
  prioridades_os_nome_tamanho: "O nome da prioridade deve ter até 30 caracteres.",
  prioridades_os_cor_formato: "Cor inválida.",
  prioridades_os_sla_valido: "O SLA deve ficar entre 1 e 8.760 horas.",
  prioridades_os_padrao_ativa: "A prioridade padrão não pode ser desativada. Defina outra como padrão antes.",
  tipos_servico_loja_nome_key: "Já existe um tipo de serviço com esse nome.",
  tipos_servico_nome_tamanho: "O nome do tipo de serviço deve ter até 60 caracteres.",
  tipos_servico_descricao_tamanho: "A descrição deve ter até 300 caracteres.",
};

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("configuracoes-os", error, MENSAGENS_RESTRICAO, padrao);
}

const CAMPOS_STATUS = "id, chave, nome, categoria, cor, ordem, ativo, inicial";
const CAMPOS_PRIORIDADE = "id, chave, nome, nivel, cor, ordem, padrao, ativo, sla_horas";
const CAMPOS_TIPO = "id, nome, descricao, local_atendimento_padrao, ativo";

export async function obterUsoConfiguracaoOS(): Promise<UsoConfiguracaoOS> {
  const { data, error } = await supabase.rpc("uso_configuracao_os");
  if (error) throw erro(error, "Não foi possível carregar o uso das configurações.");
  return data as UsoConfiguracaoOS;
}

// ---------------------------------------------------------------------------
// Status (workflow)
// ---------------------------------------------------------------------------

export async function listarStatusConfig(): Promise<StatusOSConfig[]> {
  const { data, error } = await supabase.from("status_os").select(CAMPOS_STATUS).order("ordem").order("nome");
  if (error) throw erro(error, "Não foi possível carregar os status.");
  return (data ?? []) as StatusOSConfig[];
}

export async function criarStatus(lojaId: string, dados: DadosStatusForm): Promise<void> {
  const { error } = await supabase.from("status_os").insert({ loja_id: lojaId, ...dados });
  if (error) throw erro(error, "Não foi possível criar o status.");
}

export async function atualizarStatus(id: string, dados: DadosStatusForm): Promise<void> {
  const { error } = await supabase.from("status_os").update(dados).eq("id", id);
  if (error) throw erro(error, "Não foi possível salvar o status.");
}

export async function definirStatusAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("status_os").update({ ativo }).eq("id", id);
  if (error) throw erro(error, ativo ? "Não foi possível reativar o status." : "Não foi possível desativar o status.");
}

export async function excluirStatus(id: string): Promise<void> {
  const { error } = await supabase.from("status_os").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      console.error("[configuracoes-os] excluir status", error);
      throw new Error("Este status já foi usado em ordens de serviço. Desative-o em vez de excluir.");
    }
    throw erro(error, "Não foi possível excluir o status.");
  }
}

export async function definirStatusInicial(id: string): Promise<void> {
  const { error } = await supabase.rpc("definir_status_inicial", { p_status_id: id });
  if (error) throw erro(error, "Não foi possível definir o status inicial.");
}

export async function reordenarStatus(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc("reordenar_status_os", { p_ids: ids });
  if (error) throw erro(error, "Não foi possível reordenar os status.");
}

// ---------------------------------------------------------------------------
// Prioridades
// ---------------------------------------------------------------------------

export async function listarPrioridades(): Promise<PrioridadeOS[]> {
  const { data, error } = await supabase.from("prioridades_os").select(CAMPOS_PRIORIDADE).order("ordem").order("nome");
  if (error) throw erro(error, "Não foi possível carregar as prioridades.");
  return (data ?? []) as PrioridadeOS[];
}

function camposPrioridade(dados: DadosPrioridadeForm) {
  return { nome: dados.nome, nivel: dados.nivel, cor: dados.cor, sla_horas: dados.sla_horas ? Number(dados.sla_horas) : null };
}

export async function criarPrioridade(lojaId: string, dados: DadosPrioridadeForm): Promise<void> {
  const { error } = await supabase.from("prioridades_os").insert({ loja_id: lojaId, ...camposPrioridade(dados) });
  if (error) throw erro(error, "Não foi possível criar a prioridade.");
}

export async function atualizarPrioridade(id: string, dados: DadosPrioridadeForm): Promise<void> {
  const { error } = await supabase.from("prioridades_os").update(camposPrioridade(dados)).eq("id", id);
  if (error) throw erro(error, "Não foi possível salvar a prioridade.");
}

export async function definirPrioridadeAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("prioridades_os").update({ ativo }).eq("id", id);
  if (error) throw erro(error, ativo ? "Não foi possível reativar a prioridade." : "Não foi possível desativar a prioridade.");
}

export async function excluirPrioridade(id: string): Promise<void> {
  const { error } = await supabase.from("prioridades_os").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      console.error("[configuracoes-os] excluir prioridade", error);
      throw new Error("Esta prioridade já foi usada em ordens de serviço. Desative-a em vez de excluir.");
    }
    throw erro(error, "Não foi possível excluir a prioridade.");
  }
}

export async function definirPrioridadePadrao(id: string): Promise<void> {
  const { error } = await supabase.rpc("definir_prioridade_padrao", { p_prioridade_id: id });
  if (error) throw erro(error, "Não foi possível definir a prioridade padrão.");
}

export async function reordenarPrioridades(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc("reordenar_prioridades_os", { p_ids: ids });
  if (error) throw erro(error, "Não foi possível reordenar as prioridades.");
}

// ---------------------------------------------------------------------------
// Tipos de serviço
// ---------------------------------------------------------------------------

export async function listarTiposServico(): Promise<TipoServico[]> {
  const { data, error } = await supabase.from("tipos_servico").select(CAMPOS_TIPO).order("nome");
  if (error) throw erro(error, "Não foi possível carregar os tipos de serviço.");
  return (data ?? []) as TipoServico[];
}

function normalizarTipo(dados: DadosTipoServicoForm) {
  return {
    nome: dados.nome,
    descricao: dados.descricao.trim() || null,
    local_atendimento_padrao: dados.local_atendimento_padrao || null,
  };
}

export async function criarTipoServico(lojaId: string, dados: DadosTipoServicoForm): Promise<void> {
  const { error } = await supabase.from("tipos_servico").insert({ loja_id: lojaId, ...normalizarTipo(dados) });
  if (error) throw erro(error, "Não foi possível criar o tipo de serviço.");
}

export async function atualizarTipoServico(id: string, dados: DadosTipoServicoForm): Promise<void> {
  const { error } = await supabase.from("tipos_servico").update(normalizarTipo(dados)).eq("id", id);
  if (error) throw erro(error, "Não foi possível salvar o tipo de serviço.");
}

export async function definirTipoServicoAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("tipos_servico").update({ ativo }).eq("id", id);
  if (error) throw erro(error, ativo ? "Não foi possível reativar o tipo." : "Não foi possível desativar o tipo.");
}

export async function excluirTipoServico(id: string): Promise<void> {
  const { error } = await supabase.from("tipos_servico").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      console.error("[configuracoes-os] excluir tipo", error);
      throw new Error("Este tipo já foi usado em ordens de serviço. Desative-o em vez de excluir.");
    }
    throw erro(error, "Não foi possível excluir o tipo de serviço.");
  }
}
