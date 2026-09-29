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

// ---------------------------------------------------------------------------
// Equipes (fase 3 · etapa 3)
// ---------------------------------------------------------------------------

export interface MembroEquipe {
  tecnico_id: string;
  nome: string;
  ativo: boolean;
  lider: boolean;
}

export interface Equipe {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string;
  ativo: boolean;
  versao: number;
  membros: MembroEquipe[];
  /** OS que ainda não foram finalizadas nem canceladas */
  os_abertas: number;
}

export interface DadosEquipeForm {
  nome: string;
  descricao: string;
  cor: string;
  membros: { tecnico_id: string; lider: boolean }[];
}

/** Paleta das equipes: as mesmas cores usadas nos gráficos e status do portal. */
export const CORES_EQUIPE = ["#1565FF", "#D95926", "#1D9E75", "#8B5CF6", "#E4B200", "#E5484D"] as const;

export function equipeFormVazia(): DadosEquipeForm {
  return { nome: "", descricao: "", cor: CORES_EQUIPE[0], membros: [] };
}

// ---------------------------------------------------------------------------
// Disponibilidade (jornada semanal + ausências)
// ---------------------------------------------------------------------------

export interface TurnoJornada {
  /** 0 = domingo … 6 = sábado */
  dia_semana: number;
  inicio: string;
  fim: string;
}

export type MotivoAusencia = "folga" | "ferias" | "atestado" | "treinamento" | "bloqueio" | "outro";

export interface Ausencia {
  id: string;
  motivo: MotivoAusencia;
  inicio_em: string;
  fim_em: string;
  observacao: string | null;
}

export interface Disponibilidade {
  jornada: (TurnoJornada & { id: string })[];
  ausencias: Ausencia[];
}

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export const MOTIVOS_AUSENCIA: { valor: MotivoAusencia; rotulo: string }[] = [
  { valor: "folga", rotulo: "Folga" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "atestado", rotulo: "Atestado" },
  { valor: "treinamento", rotulo: "Treinamento" },
  { valor: "bloqueio", rotulo: "Bloqueio de agenda" },
  { valor: "outro", rotulo: "Outro" },
];

export function rotuloMotivo(motivo: MotivoAusencia): string {
  return MOTIVOS_AUSENCIA.find((m) => m.valor === motivo)?.rotulo ?? "Ausência";
}
