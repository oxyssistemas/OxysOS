import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { normalizarBusca } from "@oxys/shared/masks";
import { erroAmigavel } from "@/lib/erros";
import type { ItemCatalogo } from "@/components/CatalogoSimplesPanel";
import type { DadosEquipamentoForm, Equipamento, EquipamentoListagem, FiltrosEquipamentos } from "./tipos";

export const EQUIPAMENTOS_POR_PAGINA = 20;

const MENSAGENS_RESTRICAO: Record<string, string> = {
  equipamentos_endereco_do_cliente_fkey: "O endereço selecionado não pertence a este cliente.",
  equipamentos_cliente_mesma_loja_fkey: "Cliente inválido.",
  equipamentos_categoria_mesma_loja_fkey: "Categoria inválida.",
  ordens_servico_equipamento_do_cliente_fkey:
    "Este equipamento possui ordens de serviço e não pode ser transferido para outro cliente.",
  equipamentos_nome_tamanho: "Informe o nome do equipamento (até 150 caracteres).",
  equipamentos_textos_tamanho: "Algum campo excedeu o tamanho permitido.",
  equipamentos_datas_validas: "Data inválida.",
  categorias_equipamento_loja_nome_key: "Já existe uma categoria com esse nome.",
  categorias_equipamento_nome_tamanho: "O nome da categoria deve ter até 60 caracteres.",
};

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("equipamentos", error, MENSAGENS_RESTRICAO, padrao);
}

const CONFLITO = "Este equipamento foi alterado por outra pessoa. Recarregue os dados antes de salvar novamente.";

// ---------------------------------------------------------------------------
// Equipamentos
// ---------------------------------------------------------------------------

export async function listarEquipamentos(
  filtros: FiltrosEquipamentos,
): Promise<{ equipamentos: EquipamentoListagem[]; total: number }> {
  const { data, error } = await supabase.rpc("listar_equipamentos", {
    p_busca: filtros.busca || null,
    p_arquivo: filtros.arquivo,
    p_status: filtros.status || null,
    p_categoria: filtros.categoria || null,
    p_cliente: filtros.cliente || null,
    p_garantia: filtros.garantia || null,
    p_pagina: filtros.pagina,
    p_por_pagina: EQUIPAMENTOS_POR_PAGINA,
  });
  if (error) throw erro(error, "Não foi possível carregar os equipamentos.");
  const resultado = data as { itens: EquipamentoListagem[]; total: number };
  return { equipamentos: resultado.itens, total: resultado.total };
}

const CAMPOS_EQUIPAMENTO = `id, cliente_id, cliente_endereco_id, categoria_id, nome, marca, modelo, numero_serie,
  data_instalacao, garantia_ate, localizacao, observacoes, status, codigo_publico, criado_em, arquivado_em, versao,
  cliente:clientes!equipamentos_cliente_mesma_loja_fkey(id, nome, arquivado_em),
  categoria:categorias_equipamento!equipamentos_categoria_mesma_loja_fkey(id, nome, ativo),
  endereco:cliente_enderecos!equipamentos_endereco_do_cliente_fkey(id, rotulo, logradouro, numero, complemento, bairro, cidade, estado)`;

export async function obterEquipamento(id: string): Promise<Equipamento | null> {
  const { data, error } = await supabase.from("equipamentos").select(CAMPOS_EQUIPAMENTO).eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw erro(error, "Não foi possível carregar o equipamento.");
  }
  return (data as unknown as Equipamento | null) ?? null;
}

function dadosParaBanco(d: DadosEquipamentoForm) {
  return {
    cliente_id: d.cliente?.id,
    cliente_endereco_id: d.cliente_endereco_id || null,
    categoria_id: d.categoria_id || null,
    nome: d.nome.trim(),
    marca: d.marca.trim() || null,
    modelo: d.modelo.trim() || null,
    numero_serie: d.numero_serie.trim() || null,
    data_instalacao: d.data_instalacao || null,
    garantia_ate: d.garantia_ate || null,
    localizacao: d.localizacao.trim() || null,
    observacoes: d.observacoes.trim() || null,
    status: d.status,
  };
}

export async function criarEquipamento(lojaId: string, dados: DadosEquipamentoForm): Promise<string> {
  const { data, error } = await supabase
    .from("equipamentos")
    .insert({ ...dadosParaBanco(dados), loja_id: lojaId })
    .select("id")
    .single();
  if (error) throw erro(error, "Não foi possível cadastrar o equipamento. Tente novamente.");
  return (data as { id: string }).id;
}

export async function atualizarEquipamento(id: string, versao: number, dados: DadosEquipamentoForm): Promise<void> {
  const { data, error } = await supabase
    .from("equipamentos")
    .update(dadosParaBanco(dados))
    .eq("id", id)
    .eq("versao", versao)
    .select("id");
  if (error) throw erro(error, "Não foi possível salvar o equipamento. Tente novamente.");
  if (!data || data.length === 0) throw new Error(CONFLITO);
}

export async function definirArquivamentoEquipamento(id: string, versao: number, arquivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("equipamentos")
    .update({ arquivado_em: arquivar ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("versao", versao)
    .select("id");
  if (error) throw erro(error, arquivar ? "Não foi possível arquivar o equipamento." : "Não foi possível reativar o equipamento.");
  if (!data || data.length === 0) throw new Error(CONFLITO);
}

export async function regenerarCodigoEquipamento(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("regenerar_codigo_equipamento", { p_equipamento_id: id });
  if (error) throw erro(error, "Não foi possível gerar um novo código.");
  return data as string;
}

export async function equipamentoPorCodigo(codigo: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("equipamento_por_codigo", { p_codigo: codigo });
  if (error) throw erro(error, "Não foi possível ler o código.");
  return (data as string | null) ?? null;
}

export interface EventoHistoricoEquipamento {
  id: string;
  acao: string;
  criado_em: string;
  usuario: string | null;
  campos: string[] | null;
  status_novo: string | null;
}

export async function obterHistoricoEquipamento(id: string): Promise<EventoHistoricoEquipamento[]> {
  const { data, error } = await supabase.rpc("equipamento_historico", { p_equipamento_id: id, p_limite: 100 });
  if (error) throw erro(error, "Não foi possível carregar o histórico.");
  return (data ?? []) as EventoHistoricoEquipamento[];
}

export interface OsDoEquipamento {
  id: string;
  numero: string;
  titulo: string | null;
  criado_em: string;
  descricao: string;
  status: { nome: string; cor: string | null } | null;
}

export async function listarOsDoEquipamento(id: string, limite = 20): Promise<{ ordens: OsDoEquipamento[]; total: number }> {
  const { data, error, count } = await supabase
    .from("ordens_servico")
    .select("id, numero, titulo, criado_em, descricao, status:status_os!ordens_servico_status_id_fkey(nome, cor)", { count: "exact" })
    .eq("equipamento_id", id)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw erro(error, "Não foi possível carregar as ordens de serviço.");
  return { ordens: (data ?? []) as unknown as OsDoEquipamento[], total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Apoio ao formulário
// ---------------------------------------------------------------------------

export interface ClienteOpcao {
  id: string;
  nome: string;
  documento: string | null;
  tipo_pessoa: "pf" | "pj";
}

/** Clientes ativos para o seletor (busca no servidor, poucos resultados). */
export async function buscarClientesAtivos(termo: string): Promise<ClienteOpcao[]> {
  let consulta = supabase
    .from("clientes")
    .select("id, nome, documento, tipo_pessoa")
    .is("arquivado_em", null)
    .order("nome")
    .limit(20);
  const t = normalizarBusca(termo);
  if (t) consulta = consulta.ilike("busca", `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await consulta;
  if (error) throw erro(error, "Não foi possível buscar clientes.");
  return (data ?? []) as ClienteOpcao[];
}

export interface EnderecoOpcao {
  id: string;
  rotulo: string;
  logradouro: string;
  numero: string | null;
  cidade: string;
  estado: string;
  principal: boolean;
}

export async function listarEnderecosDoCliente(clienteId: string): Promise<EnderecoOpcao[]> {
  const { data, error } = await supabase
    .from("cliente_enderecos")
    .select("id, rotulo, logradouro, numero, cidade, estado, principal")
    .eq("cliente_id", clienteId)
    .order("principal", { ascending: false })
    .order("rotulo");
  if (error) throw erro(error, "Não foi possível carregar os endereços do cliente.");
  return (data ?? []) as EnderecoOpcao[];
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export async function listarCategorias(): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase
    .from("categorias_equipamento")
    .select("id, nome, ativo, equipamentos!equipamentos_categoria_mesma_loja_fkey(count)")
    .order("nome");
  if (error) throw erro(error, "Não foi possível carregar as categorias.");
  return (data ?? []).map((c) => {
    const contagem = c.equipamentos as unknown as { count: number }[];
    return { id: c.id, nome: c.nome, ativo: c.ativo, total_uso: contagem[0]?.count ?? 0 };
  });
}

export async function criarCategoria(lojaId: string, nome: string): Promise<ItemCatalogo> {
  const { data, error } = await supabase
    .from("categorias_equipamento")
    .insert({ loja_id: lojaId, nome: nome.trim() })
    .select("id, nome, ativo")
    .single();
  if (error) throw erro(error, "Não foi possível criar a categoria.");
  return { ...(data as { id: string; nome: string; ativo: boolean }), total_uso: 0 };
}

export async function renomearCategoria(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from("categorias_equipamento").update({ nome: nome.trim() }).eq("id", id);
  if (error) throw erro(error, "Não foi possível renomear a categoria.");
}

export async function definirCategoriaAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from("categorias_equipamento").update({ ativo }).eq("id", id);
  if (error) throw erro(error, "Não foi possível atualizar a categoria.");
}

export async function excluirCategoria(id: string): Promise<void> {
  const { error } = await supabase.from("categorias_equipamento").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      console.error("[equipamentos]", error);
      throw new Error("Categoria em uso por equipamentos. Desative-a em vez de excluir.");
    }
    throw erro(error, "Não foi possível excluir a categoria.");
  }
}
