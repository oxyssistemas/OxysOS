import type { CategoriaStatusOs, NivelPrioridade, StatusAgendamento } from "../agenda/tipos";

export type SituacaoTecnico =
  | "disponivel"
  | "ocupado"
  | "em_atendimento"
  | "ausente"
  | "fora_jornada"
  | "offline";

export type SituacaoSla = "atrasada" | "vencendo" | "no_prazo" | "sem_prazo";

export interface OsNaoAtribuida {
  os_id: string;
  numero: string | null;
  titulo: string | null;
  descricao: string;
  /** null quando o usuário não tem acesso a clientes */
  cliente: string | null;
  local_atendimento: "loja" | "externo";
  tipo_servico: { id: string; nome: string } | null;
  prioridade: { id: string; nome: string; cor: string; nivel: NivelPrioridade };
  status: { id: string; nome: string; cor: string; categoria: CategoriaStatusOs };
  sla: SituacaoSla;
  prazo_em: string | null;
  criado_em: string;
  /** já agendada, mas ainda sem responsável */
  agendado_em: string | null;
  aguardando_minutos: number;
}

export interface AtendimentoDoDia {
  id: string;
  os_id: string;
  numero: string | null;
  titulo: string;
  inicio_em: string;
  fim_em: string;
  status: StatusAgendamento;
  prioridade_cor: string;
}

export interface TecnicoDespacho {
  id: string;
  nome: string | null;
  tem_login: boolean;
  situacao: SituacaoTecnico;
  especialidades: string[];
  atendimentos_dia: number;
  minutos_dia: number;
  os_abertas: number;
  agenda: AtendimentoDoDia[];
}

export interface EquipeDespacho {
  id: string;
  nome: string;
  cor: string;
  atendimentos_dia: number;
}

export interface PainelDespacho {
  dia: string;
  nao_atribuidas: OsNaoAtribuida[];
  tecnicos: TecnicoDespacho[];
  equipes: EquipeDespacho[];
}

export interface SugestaoTecnico {
  tecnico_id: string;
  nome: string | null;
  pontuacao: number;
  livre: boolean;
  especialidade_ok: boolean;
  minutos_no_dia: number;
  motivos: string[];
}

export const ROTULO_SITUACAO: Record<SituacaoTecnico, string> = {
  disponivel: "Disponível",
  ocupado: "Ocupado",
  em_atendimento: "Em atendimento",
  ausente: "Ausente",
  fora_jornada: "Fora da jornada",
  offline: "Offline",
};

/** Cores do chip de situação (as de status/prioridade continuam vindo do banco). */
export const CLASSE_SITUACAO: Record<SituacaoTecnico, string> = {
  disponivel: "border-success/30 bg-success/10 text-success",
  ocupado: "border-accent/30 bg-accent-muted text-accent",
  em_atendimento: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  ausente: "border-border bg-white/5 text-text-muted",
  fora_jornada: "border-border bg-white/5 text-text-muted",
  offline: "border-border bg-white/5 text-text-muted",
};

export const ROTULO_SLA: Record<SituacaoSla, string> = {
  atrasada: "Atrasada",
  vencendo: "Vencendo",
  no_prazo: "No prazo",
  sem_prazo: "Sem prazo",
};

export const CLASSE_SLA: Record<SituacaoSla, string> = {
  atrasada: "border-danger/30 bg-danger/10 text-danger",
  vencendo: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  no_prazo: "border-border bg-white/5 text-text-secondary",
  sem_prazo: "border-border bg-white/5 text-text-muted",
};

export function esperaHumana(minutos: number): string {
  if (minutos < 60) return `${Math.max(0, minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function cargaHumana(minutos: number): string {
  if (minutos === 0) return "sem horas agendadas";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min agendados`;
  return resto === 0 ? `${horas}h agendadas` : `${horas}h${String(resto).padStart(2, "0")} agendadas`;
}

export function tituloDaOs(os: OsNaoAtribuida): string {
  return os.titulo?.trim() || os.tipo_servico?.nome || os.descricao;
}
