export type StatusLoja = "ativa" | "suspensa" | "cancelada";

export interface Loja {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  status: StatusLoja;
  plano: string | null;
  segmento_id: string | null;
  criado_em: string;
}

export interface Gerente {
  id: string;
  loja_id: string;
  nome: string;
  email: string;
  papel: "gerente";
  ativo: boolean;
  criado_em: string;
}

export interface Segmento {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  criado_em: string;
}

export interface Funcionalidade {
  id: string;
  nome: string;
  key: string;
  descricao: string | null;
  categoria: string;
  ativo: boolean;
  criado_em: string;
}

export interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  preco_anual: number;
  ativo: boolean;
  criado_em: string;
}

export type StatusAssinatura = "trial" | "active" | "past_due" | "suspended" | "cancelled";
export type CicloCobranca = "mensal" | "anual";

export interface Assinatura {
  id: string;
  loja_id: string;
  plano_id: string;
  status: StatusAssinatura;
  ciclo_cobranca: CicloCobranca;
  data_inicio: string;
  trial_termina_em: string | null;
  periodo_atual_inicio: string | null;
  periodo_atual_fim: string | null;
  cancelada_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface EmpresaFeatureOverride {
  id: string;
  loja_id: string;
  funcionalidade_id: string;
  habilitado: boolean;
  criado_em: string;
}

export interface LogAuditoria {
  id: string;
  ator_usuario_id: string | null;
  loja_id: string | null;
  acao: string;
  tipo_entidade: string;
  entidade_id: string | null;
  metadados: Record<string, unknown> | null;
  criado_em: string;
}

export interface LojaComRelacoes extends Loja {
  gerente: Gerente | null;
  segmento: Segmento | null;
  assinatura: Assinatura | null;
  planoAtual: Plano | null;
}
