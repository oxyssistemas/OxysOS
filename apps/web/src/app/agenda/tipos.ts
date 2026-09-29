export type StatusAgendamento = "agendado" | "confirmado" | "em_andamento" | "concluido" | "cancelado";

export type CategoriaStatusOs =
  | "aberto"
  | "agendado"
  | "em_andamento"
  | "pausado"
  | "finalizado_sucesso"
  | "finalizado_cancelado";

export type NivelPrioridade = "baixa" | "normal" | "alta" | "urgente";

export interface EventoAgenda {
  id: string;
  os_id: string;
  numero: string | null;
  titulo: string | null;
  descricao: string;
  /** null quando o usuário não tem acesso a clientes */
  cliente: string | null;
  tipo_servico: string | null;
  local_atendimento: "loja" | "externo";
  inicio_em: string;
  fim_em: string;
  status: StatusAgendamento;
  observacao: string | null;
  versao: number;
  tecnico: { id: string; nome: string | null } | null;
  equipe: { id: string; nome: string; cor: string } | null;
  status_os: { id: string; nome: string; cor: string; categoria: CategoriaStatusOs };
  prioridade: { id: string; nome: string; cor: string; nivel: NivelPrioridade };
}

export interface AgendaPeriodo {
  eventos: EventoAgenda[];
  /** técnicos ativos — colunas da visão por técnico, mesmo sem atendimento */
  tecnicos: { id: string; nome: string | null }[];
  equipes: { id: string; nome: string; cor: string }[];
}

export type VisaoAgenda = "dia" | "semana" | "mes" | "tecnicos" | "equipes";

export const VISOES: { valor: VisaoAgenda; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "tecnicos", rotulo: "Técnicos" },
  { valor: "equipes", rotulo: "Equipes" },
];

export const ROTULO_STATUS_AGENDAMENTO: Record<StatusAgendamento, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export interface FiltrosAgenda {
  visao: VisaoAgenda;
  /** dia de referência (yyyy-MM-dd, hora local) */
  data: string;
  tecnico: string;
  equipe: string;
  incluirCancelados: boolean;
}

// ---------------------------------------------------------------------------
// Datas — tudo no fuso do navegador; o banco guarda timestamptz
// ---------------------------------------------------------------------------

export function paraISODia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dataDoISO(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1);
}

export function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Semana de domingo a sábado, como o calendário brasileiro. */
export function inicioDaSemana(d: Date): Date {
  const inicio = inicioDoDia(d);
  inicio.setDate(inicio.getDate() - inicio.getDay());
  return inicio;
}

export function inicioDaGradeDoMes(d: Date): Date {
  return inicioDaSemana(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function somarDias(d: Date, dias: number): Date {
  const nova = new Date(d);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

/** Período carregado do banco para cada visão (fim exclusivo). */
export function periodoDaVisao(visao: VisaoAgenda, referencia: Date): { inicio: Date; fim: Date } {
  if (visao === "semana" || visao === "tecnicos" || visao === "equipes") {
    const inicio = visao === "semana" ? inicioDaSemana(referencia) : inicioDoDia(referencia);
    return { inicio, fim: somarDias(inicio, visao === "semana" ? 7 : 1) };
  }
  if (visao === "mes") {
    const inicio = inicioDaGradeDoMes(referencia);
    return { inicio, fim: somarDias(inicio, 42) };
  }
  const inicio = inicioDoDia(referencia);
  return { inicio, fim: somarDias(inicio, 1) };
}

export function rotuloDoPeriodo(visao: VisaoAgenda, referencia: Date): string {
  if (visao === "mes") {
    const texto = referencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
  if (visao === "semana") {
    const inicio = inicioDaSemana(referencia);
    const fim = somarDias(inicio, 6);
    const curto = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    return `${curto(inicio)} – ${curto(fim)} de ${fim.getFullYear()}`;
  }
  const texto = referencia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function faixaHoraria(evento: EventoAgenda): string {
  return `${horario(evento.inicio_em)} – ${horario(evento.fim_em)}`;
}

export function tituloDoEvento(evento: EventoAgenda): string {
  return evento.titulo?.trim() || evento.tipo_servico || evento.descricao;
}

/** Minutos desde a meia-noite local, limitados ao dia mostrado. */
export function minutosNoDia(iso: string, dia: Date): number {
  const data = new Date(iso);
  const base = inicioDoDia(dia).getTime();
  return Math.max(0, Math.min(24 * 60, Math.round((data.getTime() - base) / 60000)));
}

// ---------------------------------------------------------------------------
// Agendamento e conflitos (etapa 5)
// ---------------------------------------------------------------------------

export type TipoConflito = "tecnico_ocupado" | "equipe_ocupada" | "tecnico_ausente" | "fora_jornada";

export interface Conflito {
  tipo: TipoConflito;
  mensagem: string;
  agendamento_id?: string;
  os_id?: string;
  numero?: string | null;
}

export interface RespostaAgendamento {
  id: string;
  conflitos: Conflito[];
}

export const DURACOES: { minutos: number; rotulo: string }[] = [
  { minutos: 30, rotulo: "30 min" },
  { minutos: 60, rotulo: "1 hora" },
  { minutos: 90, rotulo: "1h30" },
  { minutos: 120, rotulo: "2 horas" },
  { minutos: 180, rotulo: "3 horas" },
  { minutos: 240, rotulo: "4 horas" },
  { minutos: 480, rotulo: "8 horas" },
];

export function minutosEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
}

/** yyyy-MM-ddTHH:mm local, aceito pelos inputs date/time */
export function horaLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Junta data (yyyy-MM-dd) e hora (HH:mm) locais em um Date. */
export function juntarDataHora(data: string, hora: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1, h ?? 0, m ?? 0, 0, 0);
}
