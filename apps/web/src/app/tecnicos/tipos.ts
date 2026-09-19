export interface EspecialidadeResumo {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface Especialidade extends EspecialidadeResumo {
  /** técnicos que possuem a especialidade */
  total_tecnicos: number;
}

export interface TecnicoListagem {
  id: string;
  nome: string;
  sobrenome: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  usuario_id: string | null;
  versao: number;
  especialidades: EspecialidadeResumo[];
  /** em andamento ou pausadas */
  os_em_andamento: number;
  os_concluidas: number;
}

export interface Tecnico {
  id: string;
  nome: string;
  sobrenome: string | null;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  observacoes: string | null;
  usuario_id: string | null;
  ativo: boolean;
  desativado_em: string | null;
  criado_em: string;
  versao: number;
  especialidade_ids: string[];
}

export type FiltroStatusTecnico = "ativos" | "inativos" | "todos";

export interface FiltrosTecnicos {
  busca: string;
  status: FiltroStatusTecnico;
  especialidade: string;
  pagina: number;
}

export interface DadosTecnicoForm {
  nome: string;
  sobrenome: string;
  email: string;
  telefone: string;
  documento: string;
  observacoes: string;
  usuario_id: string;
  especialidade_ids: string[];
}

export interface UsuarioVinculavel {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export function tecnicoFormVazio(): DadosTecnicoForm {
  return {
    nome: "",
    sobrenome: "",
    email: "",
    telefone: "",
    documento: "",
    observacoes: "",
    usuario_id: "",
    especialidade_ids: [],
  };
}

export function nomeCompleto(t: { nome: string; sobrenome: string | null }): string {
  return [t.nome, t.sobrenome].filter(Boolean).join(" ");
}
