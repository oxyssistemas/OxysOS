export type TipoPessoa = "pf" | "pj";

export interface Cliente {
  id: string;
  loja_id: string;
  tipo_pessoa: TipoPessoa;
  /** nome de exibição (PF: nome; PJ: nome fantasia ou razão social) */
  nome: string;
  documento: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  observacoes: string | null;
  tags: string[];
  criado_em: string;
  atualizado_em: string;
  arquivado_em: string | null;
  versao: number;
}

export interface EnderecoCliente {
  id: string;
  cliente_id: string;
  rotulo: string;
  cep: string | null;
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  estado: string;
  referencia: string | null;
  principal: boolean;
  criado_em: string;
}

export interface ClienteListagem {
  id: string;
  tipo_pessoa: TipoPessoa;
  nome: string;
  razao_social: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  tags: string[];
  arquivado_em: string | null;
  /** só o endereço principal (filtro aplicado na consulta) */
  cliente_enderecos: Pick<EnderecoCliente, "cidade" | "estado">[];
}

export type FiltroStatusCliente = "ativos" | "arquivados" | "todos";

export interface FiltrosClientes {
  busca: string;
  status: FiltroStatusCliente;
  tipo: TipoPessoa | "";
  tag: string;
  pagina: number;
}

export interface DadosClienteForm {
  tipo_pessoa: TipoPessoa;
  nome: string;
  documento: string;
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  whatsapp: string;
  observacoes: string;
  tags: string[];
}

export interface DadosEnderecoForm {
  rotulo: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string;
  principal: boolean;
}

export const ROTULOS_ENDERECO = ["Principal", "Matriz", "Filial", "Residência", "Local de instalação", "Cobrança"];

export function enderecoFormVazio(rotulo = "Principal"): DadosEnderecoForm {
  return {
    rotulo,
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    referencia: "",
    principal: false,
  };
}

export function clienteFormVazio(): DadosClienteForm {
  return {
    tipo_pessoa: "pf",
    nome: "",
    documento: "",
    razao_social: "",
    nome_fantasia: "",
    email: "",
    telefone: "",
    whatsapp: "",
    observacoes: "",
    tags: [],
  };
}

export function formatarEnderecoLinha(e: Pick<EnderecoCliente, "logradouro" | "numero" | "complemento" | "bairro">): string {
  return [
    [e.logradouro, e.numero || "s/n"].join(", "),
    e.complemento,
    e.bairro,
  ]
    .filter(Boolean)
    .join(" · ");
}
