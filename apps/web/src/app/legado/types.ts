import type { CategoriaStatus } from "../configuracoes/tipos";

export type PapelUsuario = "super_admin" | "gerente" | "funcionario";

export type { CategoriaStatus };

/** Status do workflow configurável (public.status_os). */
export interface StatusOS {
  id: string;
  loja_id: string;
  chave: string;
  nome: string;
  categoria: CategoriaStatus;
  cor: string;
  ordem: number;
  ativo: boolean;
  inicial: boolean;
}

export interface Cliente {
  id: string;
  loja_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
}

export interface UsuarioResponsavel {
  id: string;
  nome: string;
  papel: PapelUsuario;
}

export type TipoItemOS = "servico" | "produto" | "peca" | "material";

export interface OSItem {
  id: string;
  os_id: string;
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

export type LocalAtendimento = "loja" | "externo";

export interface EnderecoOS {
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  estado: string;
}

export interface OrdemServico {
  id: string;
  loja_id: string;
  numero: string;
  cliente_id: string;
  status_id: string;
  responsavel_id: string | null;
  criado_por: string | null;
  codigo_aparelho: string | null;
  objeto_atendimento: string | null;
  descricao: string;
  valor_total: number;
  local_atendimento: LocalAtendimento;
  cliente_endereco_id: string | null;
  prioridade_id: string;
  tipo_servico_id: string | null;
  iniciado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface OSHistoricoEntry {
  id: string;
  os_id: string;
  usuario_id: string | null;
  status_anterior_id: string | null;
  status_novo_id: string | null;
  criado_em: string;
}

