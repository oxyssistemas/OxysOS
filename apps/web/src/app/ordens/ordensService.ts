import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type {
  DadosItemForm,
  DadosOrdemForm,
  FiltrosOrdens,
  ItemOrdem,
  OpcaoEquipamento,
  OpcaoTecnico,
  OrdemDetalhe,
  OrdemListagem,
} from "./tipos";

export const ORDENS_POR_PAGINA = 20;

const MENSAGENS_RESTRICAO: Record<string, string> = {
  ordens_servico_titulo_tamanho: "O título deve ter até 120 caracteres.",
  ordens_servico_descricao_tamanho: "Descreva o problema ou serviço (até 5.000 caracteres).",
  ordens_servico_textos_tamanho: "Um dos textos passou do limite de caracteres.",
  ordens_servico_hora_exige_data: "Informe a data para agendar um horário.",
  ordens_servico_sla_valido: "O SLA deve ficar entre 1 e 8.760 horas.",
  ordens_servico_desconto_valido: "O desconto não pode ser negativo.",
  ordens_servico_equipamento_do_cliente_fkey: "O equipamento precisa ser do cliente da OS.",
  ordens_servico_endereco_do_cliente_fkey: "O endereço precisa ser do cliente da OS.",
  ordens_servico_endereco_somente_externo: "Atendimento na loja não usa endereço do cliente.",
  ordens_servico_tecnico_mesma_loja_fkey: "Técnico inválido.",
  os_itens_descricao_tamanho: "Descreva o item (até 200 caracteres).",
  os_itens_quantidade_valida: "A quantidade deve ser maior que zero.",
  os_itens_valor_valido: "O valor não pode ser negativo.",
};

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("ordens", error, MENSAGENS_RESTRICAO, padrao);
}

const CONFLITO = "Esta OS foi alterada por outra pessoa. Recarregue para ver a versão atual antes de salvar.";

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export async function listarOrdens(filtros: FiltrosOrdens): Promise<{ ordens: OrdemListagem[]; total: number }> {
  const { data, error } = await supabase.rpc("listar_ordens_servico", {
    p_busca: filtros.busca || null,
    p_grupo: filtros.grupo,
    p_status: filtros.status || null,
    p_prioridade: filtros.prioridade || null,
    p_tecnico: filtros.tecnico || null,
    p_tipo: filtros.tipo || null,
    p_cliente: filtros.cliente || null,
    p_equipamento: filtros.equipamento || null,
    p_sla: filtros.sla || null,
    p_ordem: filtros.ordem,
    p_pagina: filtros.pagina,
    p_por_pagina: ORDENS_POR_PAGINA,
  });
  if (error) throw erro(error, "Não foi possível carregar as ordens de serviço.");
  const resultado = data as { itens: OrdemListagem[]; total: number };
  return { ordens: resultado.itens, total: resultado.total };
}

/** null quando a OS não existe ou é de outra empresa. */
export async function obterOrdem(id: string): Promise<OrdemDetalhe | null> {
  const { data, error } = await supabase.rpc("obter_ordem_servico", { p_os_id: id });
  if (error) {
    if (error.code === "P0002" || error.code === "22P02") return null;
    throw erro(error, "Não foi possível carregar a ordem de serviço.");
  }
  return data as OrdemDetalhe;
}

// ---------------------------------------------------------------------------
// Criação e edição
// ---------------------------------------------------------------------------

/** Campos do formulário no formato da tabela. */
function camposDoFormulario(dados: DadosOrdemForm) {
  // em horas, o banco calcula a data limite a partir da abertura
  const prazo =
    dados.modo_prazo === "horas"
      ? { sla_horas: Number(dados.sla_horas) }
      : dados.modo_prazo === "data"
        ? { sla_horas: null, prazo_em: new Date(dados.prazo_data).toISOString() }
        : { sla_horas: null, prazo_em: null };
  return {
    titulo: dados.titulo.trim(),
    descricao: dados.descricao.trim(),
    objeto_atendimento: dados.objeto_atendimento.trim() || null,
    local_atendimento: dados.local_atendimento,
    cliente_endereco_id: dados.local_atendimento === "externo" ? dados.cliente_endereco_id || null : null,
    equipamento_id: dados.equipamento_id || null,
    tipo_servico_id: dados.tipo_servico_id || null,
    prioridade_id: dados.prioridade_id,
    data_agendada: dados.data_agendada || null,
    hora_agendada: dados.data_agendada && dados.hora_agendada ? dados.hora_agendada : null,
    observacoes_internas: dados.observacoes_internas.trim() || null,
    ...prazo,
  };
}

export async function criarOrdem(input: {
  lojaId: string;
  clienteId: string;
  tecnicoId: string | null;
  dados: DadosOrdemForm;
}): Promise<{ id: string; numero: string }> {
  // "prioridade": prazo nulo → o banco aplica o SLA sugerido pela prioridade
  const { data, error } = await supabase
    .from("ordens_servico")
    .insert({
      loja_id: input.lojaId,
      cliente_id: input.clienteId,
      tecnico_id: input.tecnicoId,
      ...camposDoFormulario(input.dados),
    })
    .select("id, numero")
    .single();
  if (error) throw erro(error, "Não foi possível abrir a ordem de serviço.");
  return data as { id: string; numero: string };
}

async function atualizarComVersao(id: string, versao: number, campos: Record<string, unknown>, padrao: string): Promise<void> {
  const { data, error } = await supabase
    .from("ordens_servico")
    .update(campos)
    .eq("id", id)
    .eq("versao", versao)
    .select("id");
  if (error) throw erro(error, padrao);
  if (!data || data.length === 0) throw new Error(CONFLITO);
}

export function atualizarOrdem(id: string, versao: number, dados: DadosOrdemForm): Promise<void> {
  const campos = camposDoFormulario(dados);
  return atualizarComVersao(id, versao, campos, "Não foi possível salvar a ordem de serviço.");
}

export function salvarAtendimento(
  id: string,
  versao: number,
  dados: { diagnostico: string; servico_executado: string; solucao: string; observacoes_tecnicas: string },
): Promise<void> {
  return atualizarComVersao(
    id,
    versao,
    {
      diagnostico: dados.diagnostico.trim() || null,
      servico_executado: dados.servico_executado.trim() || null,
      solucao: dados.solucao.trim() || null,
      observacoes_tecnicas: dados.observacoes_tecnicas.trim() || null,
    },
    "Não foi possível salvar o atendimento.",
  );
}

export function atribuirTecnico(id: string, versao: number, tecnicoId: string | null): Promise<void> {
  return atualizarComVersao(id, versao, { tecnico_id: tecnicoId }, "Não foi possível atribuir o técnico.");
}

export function definirDesconto(id: string, versao: number, desconto: number): Promise<void> {
  return atualizarComVersao(id, versao, { desconto }, "Não foi possível aplicar o desconto.");
}

export async function alterarStatus(id: string, statusId: string, observacao: string): Promise<void> {
  const { error } = await supabase.rpc("alterar_status_os", {
    p_os_id: id,
    p_status_id: statusId,
    p_observacao: observacao.trim() || null,
  });
  if (error) throw erro(error, "Não foi possível alterar o status.");
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

export async function listarItens(osId: string): Promise<ItemOrdem[]> {
  const { data, error } = await supabase
    .from("os_itens")
    .select("id, os_id, tipo, descricao, quantidade, valor_unitario, subtotal, criado_em")
    .eq("os_id", osId)
    .order("criado_em")
    .order("id");
  if (error) throw erro(error, "Não foi possível carregar os itens.");
  return (data ?? []).map((i) => ({
    ...i,
    quantidade: Number(i.quantidade),
    valor_unitario: Number(i.valor_unitario),
    subtotal: Number(i.subtotal),
  })) as ItemOrdem[];
}

function camposItem(dados: DadosItemForm) {
  return {
    tipo: dados.tipo,
    descricao: dados.descricao.trim(),
    quantidade: Number(dados.quantidade.replace(",", ".")),
    valor_unitario: Number(dados.valor_unitario.replace(",", ".")),
  };
}

export async function criarItem(osId: string, dados: DadosItemForm): Promise<void> {
  const { error } = await supabase.from("os_itens").insert({ os_id: osId, ...camposItem(dados) });
  if (error) throw erro(error, "Não foi possível adicionar o item.");
}

export async function atualizarItem(id: string, dados: DadosItemForm): Promise<void> {
  const { error } = await supabase.from("os_itens").update(camposItem(dados)).eq("id", id);
  if (error) throw erro(error, "Não foi possível salvar o item.");
}

export async function excluirItem(id: string): Promise<void> {
  const { error } = await supabase.from("os_itens").delete().eq("id", id);
  if (error) throw erro(error, "Não foi possível remover o item.");
}

// ---------------------------------------------------------------------------
// Apoio aos formulários
// ---------------------------------------------------------------------------

export async function listarTecnicosAtivos(): Promise<OpcaoTecnico[]> {
  const { data, error } = await supabase.from("tecnicos").select("id, nome, sobrenome").eq("ativo", true).order("nome");
  if (error) throw erro(error, "Não foi possível carregar os técnicos.");
  return (data ?? []).map((t) => ({ id: t.id, nome: [t.nome, t.sobrenome].filter(Boolean).join(" ") }));
}

export async function listarEquipamentosDoCliente(clienteId: string): Promise<OpcaoEquipamento[]> {
  const { data, error } = await supabase
    .from("equipamentos")
    .select("id, nome, marca, modelo, numero_serie")
    .eq("cliente_id", clienteId)
    .is("arquivado_em", null)
    .order("nome");
  if (error) throw erro(error, "Não foi possível carregar os equipamentos do cliente.");
  return (data ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    detalhe: [[e.marca, e.modelo].filter(Boolean).join(" "), e.numero_serie && `S/N ${e.numero_serie}`].filter(Boolean).join(" · "),
  }));
}

export async function obterClienteBasico(id: string): Promise<{ id: string; nome: string } | null> {
  const { data, error } = await supabase.from("clientes").select("id, nome").eq("id", id).is("arquivado_em", null).maybeSingle();
  if (error) return null;
  return data;
}

export async function obterEquipamentoBasico(id: string): Promise<{ id: string; cliente_id: string } | null> {
  const { data, error } = await supabase.from("equipamentos").select("id, cliente_id").eq("id", id).is("arquivado_em", null).maybeSingle();
  if (error) return null;
  return data;
}
