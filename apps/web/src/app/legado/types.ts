export type PapelUsuario = "super_admin" | "gerente" | "funcionario";

export type CategoriaStatus =
  | "aberto"
  | "em_andamento"
  | "pausado"
  | "finalizado_sucesso"
  | "finalizado_cancelado";

export interface StatusOS {
  id: string;
  loja_id: string;
  nome: string;
  categoria: CategoriaStatus;
  cor: string | null;
  ordem: number;
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

export type TipoItemOS = "peca" | "servico";

export interface ItemOSFormulario {
  id: string; // id local, só para controle da lista no formulário
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

export interface OSItem {
  id: string;
  os_id: string;
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

export interface OrdemServico {
  id: string;
  loja_id: string;
  cliente_id: string;
  status_id: string;
  responsavel_id: string | null;
  criado_por: string | null;
  codigo_aparelho: string | null;
  objeto_atendimento: string | null;
  descricao: string;
  valor_total: number;
  iniciado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type TipoFotoOS = "antes" | "depois";

export interface OSFoto {
  id: string;
  os_id: string;
  usuario_id: string | null;
  tipo: TipoFotoOS;
  caminho: string; // caminho no bucket privado os-fotos
  observacao: string | null;
  criado_em: string;
}

export interface OSObservacao {
  id: string;
  os_id: string;
  usuario_id: string | null;
  texto: string;
  criado_em: string;
}

export interface OSHistoricoEntry {
  id: string;
  os_id: string;
  usuario_id: string | null;
  status_anterior_id: string | null;
  status_novo_id: string | null;
  criado_em: string;
}

export interface Funcionario {
  id: string;
  loja_id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  ativo: boolean;
  criado_em: string;
  codigo_autorizacao: string | null;
}
