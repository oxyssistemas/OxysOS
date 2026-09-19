import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { limparDocumento, normalizarBusca } from "@oxys/shared/masks";
import { erroAmigavel } from "@/lib/erros";
import type {
  Cliente,
  ClienteListagem,
  DadosClienteForm,
  DadosEnderecoForm,
  EnderecoCliente,
  FiltrosClientes,
} from "./tipos";

export const ITENS_POR_PAGINA = 20;

/** Alteração feita por outra pessoa entre a leitura e o salvamento. */
export class ConflitoVersaoError extends Error {
  constructor() {
    super("Este cliente foi alterado por outra pessoa. Recarregue os dados antes de salvar novamente.");
    this.name = "ConflitoVersaoError";
  }
}

const MENSAGENS_RESTRICAO: Record<string, string> = {
  clientes_loja_documento_key: "Já existe um cliente com este CPF/CNPJ.",
  clientes_documento_valido: "CPF/CNPJ inválido para o tipo de cliente.",
  clientes_razao_social_pj: "Informe a razão social.",
  clientes_nome_preenchido: "Informe o nome do cliente.",
  clientes_email_valido: "E-mail inválido.",
  clientes_telefone_valido: "Telefone inválido.",
  clientes_whatsapp_valido: "WhatsApp inválido.",
  clientes_tags_limite: "Use no máximo 20 tags.",
  cliente_enderecos_cep_valido: "CEP inválido.",
  cliente_enderecos_estado_valido: "UF inválida.",
  cliente_enderecos_logradouro: "Informe o logradouro.",
  cliente_enderecos_cidade: "Informe a cidade.",
};

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("clientes", error, MENSAGENS_RESTRICAO, padrao);
}

function termoDeBusca(texto: string): string {
  const t = texto.trim();
  // documento/telefone digitado com pontuação: busca pelos caracteres sem máscara
  if (/\d/.test(t) && /^[\dA-Za-z\s.\-/()]+$/.test(t) && /[.\-/()]/.test(t)) {
    return normalizarBusca(t.replace(/[\s.\-/()]/g, ""));
  }
  return normalizarBusca(t);
}

function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export async function listarClientes(
  filtros: FiltrosClientes,
): Promise<{ clientes: ClienteListagem[]; total: number }> {
  const inicio = (filtros.pagina - 1) * ITENS_POR_PAGINA;

  let consulta = supabase
    .from("clientes")
    .select(
      "id, tipo_pessoa, nome, razao_social, documento, email, telefone, whatsapp, tags, arquivado_em, cliente_enderecos(cidade, estado)",
      { count: "exact" },
    )
    .eq("cliente_enderecos.principal", true);

  if (filtros.status === "ativos") consulta = consulta.is("arquivado_em", null);
  if (filtros.status === "arquivados") consulta = consulta.not("arquivado_em", "is", null);
  if (filtros.tipo) consulta = consulta.eq("tipo_pessoa", filtros.tipo);
  if (filtros.tag) consulta = consulta.contains("tags", [filtros.tag]);
  const termo = termoDeBusca(filtros.busca);
  if (termo) consulta = consulta.ilike("busca", `%${escaparLike(termo)}%`);

  const { data, error, count } = await consulta
    .order("nome", { ascending: true })
    .order("id", { ascending: true })
    .range(inicio, inicio + ITENS_POR_PAGINA - 1);

  if (error) {
    // página além do total (ex.: filtro mudou): o chamador volta para a página 1
    if (error.code === "PGRST103") return { clientes: [], total: count ?? 0 };
    throw erro(error, "Não foi possível carregar os clientes.");
  }
  return { clientes: (data ?? []) as ClienteListagem[], total: count ?? 0 };
}

export async function listarTagsClientes(): Promise<string[]> {
  const { data, error } = await supabase.rpc("clientes_tags");
  if (error) {
    console.error("[clientes] tags", error);
    return [];
  }
  return (data ?? []) as string[];
}

export async function obterCliente(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from("clientes")
    .select(
      "id, loja_id, tipo_pessoa, nome, documento, razao_social, nome_fantasia, email, telefone, whatsapp, observacoes, tags, criado_em, atualizado_em, arquivado_em, versao",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // id malformado na URL
    if (error.code === "22P02") return null;
    throw erro(error, "Não foi possível carregar o cliente.");
  }
  return (data as Cliente | null) ?? null;
}

function dadosParaBanco(dados: DadosClienteForm) {
  const pj = dados.tipo_pessoa === "pj";
  return {
    tipo_pessoa: dados.tipo_pessoa,
    nome: pj ? dados.nome_fantasia.trim() || dados.razao_social.trim() : dados.nome.trim(),
    documento: limparDocumento(dados.documento) || null,
    razao_social: pj ? dados.razao_social.trim() : null,
    nome_fantasia: pj ? dados.nome_fantasia.trim() || null : null,
    email: dados.email.trim() || null,
    telefone: dados.telefone.trim() || null,
    whatsapp: dados.whatsapp.trim() || null,
    observacoes: dados.observacoes.trim() || null,
    tags: dados.tags,
  };
}

function enderecoParaBanco(dados: DadosEnderecoForm) {
  return {
    rotulo: dados.rotulo.trim(),
    cep: dados.cep.replace(/\D/g, "") || null,
    logradouro: dados.logradouro.trim(),
    numero: dados.numero.trim() || null,
    complemento: dados.complemento.trim() || null,
    bairro: dados.bairro.trim() || null,
    cidade: dados.cidade.trim(),
    estado: dados.estado,
    referencia: dados.referencia.trim() || null,
  };
}

/** Cliente + endereço principal (opcional) na mesma transação. */
export async function criarCliente(dados: DadosClienteForm, endereco: DadosEnderecoForm | null): Promise<string> {
  const { data, error } = await supabase.rpc("criar_cliente", {
    p_cliente: dadosParaBanco(dados),
    p_endereco: endereco ? enderecoParaBanco(endereco) : null,
  });
  if (error) throw erro(error, "Não foi possível cadastrar o cliente. Tente novamente.");
  return data as string;
}

/** Salva somente se ninguém alterou o cliente desde a leitura (versão). */
export async function atualizarCliente(id: string, versao: number, dados: DadosClienteForm): Promise<void> {
  const { data, error } = await supabase
    .from("clientes")
    .update(dadosParaBanco(dados))
    .eq("id", id)
    .eq("versao", versao)
    .select("id");
  if (error) throw erro(error, "Não foi possível salvar o cliente. Tente novamente.");
  if (!data || data.length === 0) throw new ConflitoVersaoError();
}

export async function definirArquivamento(id: string, versao: number, arquivar: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("clientes")
    .update({ arquivado_em: arquivar ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("versao", versao)
    .select("id");
  if (error) {
    throw erro(error, arquivar ? "Não foi possível arquivar o cliente." : "Não foi possível reativar o cliente.");
  }
  if (!data || data.length === 0) throw new ConflitoVersaoError();
}

// ---------------------------------------------------------------------------
// Endereços
// ---------------------------------------------------------------------------

export async function listarEnderecos(clienteId: string): Promise<EnderecoCliente[]> {
  const { data, error } = await supabase
    .from("cliente_enderecos")
    .select("id, cliente_id, rotulo, cep, logradouro, numero, complemento, bairro, cidade, estado, referencia, principal, criado_em")
    .eq("cliente_id", clienteId)
    .order("principal", { ascending: false })
    .order("criado_em", { ascending: true });
  if (error) throw erro(error, "Não foi possível carregar os endereços.");
  return (data ?? []) as EnderecoCliente[];
}

export async function criarEndereco(lojaId: string, clienteId: string, dados: DadosEnderecoForm): Promise<void> {
  const { error } = await supabase.from("cliente_enderecos").insert({
    ...enderecoParaBanco(dados),
    loja_id: lojaId,
    cliente_id: clienteId,
    principal: dados.principal,
  });
  if (error) throw erro(error, "Não foi possível adicionar o endereço.");
}

export async function atualizarEndereco(id: string, dados: DadosEnderecoForm, eraPrincipal: boolean): Promise<void> {
  const { error } = await supabase
    .from("cliente_enderecos")
    .update({ ...enderecoParaBanco(dados), principal: eraPrincipal || dados.principal })
    .eq("id", id);
  if (error) throw erro(error, "Não foi possível salvar o endereço.");
}

export async function tornarPrincipal(id: string): Promise<void> {
  const { error } = await supabase.from("cliente_enderecos").update({ principal: true }).eq("id", id);
  if (error) throw erro(error, "Não foi possível definir o endereço principal.");
}

export async function excluirEndereco(id: string): Promise<void> {
  const { error } = await supabase.from("cliente_enderecos").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      console.error("[clientes]", error);
      throw new Error("Este endereço está em uso e não pode ser excluído.");
    }
    throw erro(error, "Não foi possível excluir o endereço.");
  }
}

// ---------------------------------------------------------------------------
// Relacionamentos do cliente
// ---------------------------------------------------------------------------

export interface OsDoCliente {
  id: string;
  numero: string;
  titulo: string | null;
  criado_em: string;
  descricao: string;
  objeto_atendimento: string | null;
  status: { nome: string; cor: string | null; categoria: string } | null;
}

export async function listarOsDoCliente(clienteId: string, limite = 20): Promise<{ ordens: OsDoCliente[]; total: number }> {
  const { data, error, count } = await supabase
    .from("ordens_servico")
    .select(
      "id, numero, titulo, criado_em, descricao, objeto_atendimento, status:status_os!ordens_servico_status_id_fkey(nome, cor, categoria)",
      { count: "exact" },
    )
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw erro(error, "Não foi possível carregar as ordens de serviço.");
  return { ordens: (data ?? []) as unknown as OsDoCliente[], total: count ?? 0 };
}

export interface EventoHistoricoCliente {
  id: string;
  acao: string;
  criado_em: string;
  usuario: string | null;
  campos: string[] | null;
  rotulo: string | null;
  status_novo: string | null;
}

export async function obterHistoricoCliente(clienteId: string): Promise<EventoHistoricoCliente[]> {
  const { data, error } = await supabase.rpc("cliente_historico", { p_cliente_id: clienteId, p_limite: 100 });
  if (error) throw erro(error, "Não foi possível carregar o histórico.");
  return (data ?? []) as EventoHistoricoCliente[];
}
