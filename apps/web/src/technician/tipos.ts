import type { ResumoFinalizacao } from "@/app/ordens/tiposExecucao";

export type SituacaoPortalTecnico =
  | "liberado"
  | "sem_sessao"
  | "sem_acesso"
  | "sem_feature"
  | "sem_tecnico"
  | "sem_permissao";

/** Permissões de campo que o portal usa (o banco confere de novo em cada ação). */
export type PermissaoCampo =
  | "technician.jobs.view"
  | "technician.jobs.start"
  | "technician.jobs.pause"
  | "technician.jobs.complete"
  | "checklists.fill"
  | "attachments.upload"
  | "service_orders.add_material"
  | "service_orders.sign"
  | "service_orders.view";

export interface TurnoTecnico {
  dia_semana: number;
  inicio: string;
  fim: string;
}

export interface ContextoTecnico {
  situacao: SituacaoPortalTecnico;
  usuario?: { id: string; nome: string; email: string; cargo: string | null };
  empresa?: { id: string; nome: string };
  tecnico?: { id: string; nome: string | null; telefone: string | null; especialidades: string[] };
  equipes?: { id: string; nome: string; cor: string }[];
  jornada?: TurnoTecnico[];
  /** o mesmo login também abre o /app quando o cargo permite */
  acesso_portal_empresa?: boolean;
  /** o plano tem offline_mode: o portal guarda cópias e a fila de alterações */
  offline?: boolean;
  permissoes?: PermissaoCampo[];
}

export interface ProximoAtendimento {
  agendamento_id: string;
  os_id: string;
  numero: string | null;
  titulo: string;
  cliente: string;
  tipo_servico: string | null;
  local_atendimento: "loja" | "externo";
  inicio_em: string;
  fim_em: string;
  status: "agendado" | "confirmado" | "em_andamento" | "concluido" | "cancelado";
  status_os: { nome: string; cor: string; categoria: string };
  prioridade: { nome: string; cor: string; nivel: "baixa" | "normal" | "alta" | "urgente" };
}

export interface HomeTecnico {
  hoje: { total: number; urgentes: number; concluidos: number; em_andamento: number };
  proximo: ProximoAtendimento | null;
  proximos_dias: number;
}

export const DIAS_SEMANA_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

export function saudacao(agora = new Date()): string {
  const h = agora.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

export function horario(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function diaRelativo(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diferenca = Math.round((dia(data) - dia(hoje)) / 86400000);
  if (diferenca === 0) return "hoje";
  if (diferenca === 1) return "amanhã";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------------
// Agenda do técnico (etapa 8)
// ---------------------------------------------------------------------------

export type GrupoAgendaTecnico = "hoje" | "proximos" | "concluidos";

export const GRUPOS_AGENDA: { valor: GrupoAgendaTecnico; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "proximos", rotulo: "Próximos" },
  { valor: "concluidos", rotulo: "Concluídos" },
];

export interface EnderecoAtendimento {
  rotulo: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  referencia: string | null;
  resumo: string | null;
}

export interface CardAgendaTecnico {
  agendamento_id: string;
  os_id: string;
  numero: string | null;
  titulo: string;
  cliente: string;
  endereco: EnderecoAtendimento | null;
  local_atendimento: "loja" | "externo";
  tipo_servico: string | null;
  inicio_em: string;
  fim_em: string;
  status: "agendado" | "confirmado" | "em_andamento" | "concluido" | "cancelado";
  estado_campo: EstadoCampo;
  da_equipe: boolean;
  status_os: { nome: string; cor: string; categoria: string };
  prioridade: { nome: string; cor: string; nivel: "baixa" | "normal" | "alta" | "urgente" };
}

export interface AtendimentoTecnico {
  agendamento: {
    id: string;
    inicio_em: string;
    fim_em: string;
    status: CardAgendaTecnico["status"];
    observacao: string | null;
    estado_campo: EstadoCampo;
    equipe: { nome: string; cor: string } | null;
  };
  os: {
    id: string;
    numero: string | null;
    titulo: string | null;
    problema: string;
    objeto: string | null;
    local_atendimento: "loja" | "externo";
    tipo_servico: string | null;
    prazo_em: string | null;
    status: { nome: string; cor: string; categoria: string };
    prioridade: { nome: string; cor: string; nivel: string };
  };
  cliente: { id: string; nome: string; telefone: string | null; email: string | null };
  endereco: EnderecoAtendimento | null;
  equipamento: {
    id: string;
    nome: string;
    marca: string | null;
    modelo: string | null;
    numero_serie: string | null;
    localizacao: string | null;
    codigo: string | null;
  } | null;
  apontamento_aberto: ApontamentoAberto | null;
  tempos: TemposAtendimento;
}

export const ROTULO_STATUS_ATENDIMENTO: Record<CardAgendaTecnico["status"], string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Link de rota no app de mapas do celular (sem serviço próprio de roteirização). */
export function linkDaRota(endereco: EnderecoAtendimento | null): string | null {
  const alvo = endereco?.resumo ?? endereco?.cep;
  if (!alvo) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(alvo)}`;
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ---------------------------------------------------------------------------
// Fluxo de campo (etapa 9)
// ---------------------------------------------------------------------------

export type EstadoCampo =
  | "nao_iniciado"
  | "em_deslocamento"
  | "no_local"
  | "em_atendimento"
  | "pausado"
  | "finalizado";

export type MotivoPausa = "almoco" | "aguardando_cliente" | "aguardando_peca" | "problema_tecnico" | "outro";

export const MOTIVOS_PAUSA: { valor: MotivoPausa; rotulo: string }[] = [
  { valor: "almoco", rotulo: "Almoço" },
  { valor: "aguardando_cliente", rotulo: "Aguardando cliente" },
  { valor: "aguardando_peca", rotulo: "Aguardando peça" },
  { valor: "problema_tecnico", rotulo: "Problema técnico" },
  { valor: "outro", rotulo: "Outro" },
];

export const ROTULO_ESTADO_CAMPO: Record<EstadoCampo, string> = {
  nao_iniciado: "Não iniciado",
  em_deslocamento: "Em deslocamento",
  no_local: "No local",
  em_atendimento: "Em atendimento",
  pausado: "Pausado",
  finalizado: "Finalizado",
};

export const CLASSE_ESTADO_CAMPO: Record<EstadoCampo, string> = {
  nao_iniciado: "border-border bg-white/5 text-text-muted",
  em_deslocamento: "border-accent/30 bg-accent-muted text-accent",
  no_local: "border-accent/30 bg-accent-muted text-accent",
  em_atendimento: "border-success/30 bg-success/10 text-success",
  pausado: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  finalizado: "border-border bg-white/5 text-text-secondary",
};

export interface ApontamentoAberto {
  id: string;
  tipo: "deslocamento" | "atendimento" | "pausa";
  inicio_em: string;
  motivo: MotivoPausa | null;
}

export interface TemposAtendimento {
  deslocamento_min: number;
  atendimento_min: number;
  pausa_min: number;
}

export function rotuloMotivoPausa(motivo: MotivoPausa | null | undefined): string {
  return MOTIVOS_PAUSA.find((m) => m.valor === motivo)?.rotulo ?? "Pausa";
}

/** "1h05" / "12 min" a partir de minutos inteiros. */
export function duracao(minutos: number): string {
  if (minutos < 60) return `${Math.max(0, minutos)} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/** Cronômetro do relógio aberto, em minutos. */
export function minutosDesde(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

// ---------------------------------------------------------------------------
// Horas do atendimento (etapa 10)
// ---------------------------------------------------------------------------

export type TipoApontamento = "deslocamento" | "atendimento" | "pausa";

export const TIPOS_APONTAMENTO: { valor: TipoApontamento; rotulo: string }[] = [
  { valor: "atendimento", rotulo: "Atendimento" },
  { valor: "deslocamento", rotulo: "Deslocamento" },
  { valor: "pausa", rotulo: "Pausa" },
];

export const ROTULO_TIPO_APONTAMENTO = Object.fromEntries(
  TIPOS_APONTAMENTO.map((t) => [t.valor, t.rotulo]),
) as Record<TipoApontamento, string>;

export interface ApontamentoTecnico {
  id: string;
  tipo: TipoApontamento;
  tecnico: string;
  meu: boolean;
  inicio_em: string;
  fim_em: string | null;
  duracao_min: number;
  aberto: boolean;
  motivo: MotivoPausa | null;
  observacao: string | null;
  origem: "automatico" | "manual";
  ajustado: boolean;
}

export interface HorasAtendimento {
  totais: TemposAtendimento & { trabalhado_min: number };
  pode_ajustar: boolean;
  apontamentos: ApontamentoTecnico[];
}

/** ISO → valor de <input type="datetime-local"> no fuso do aparelho. */
export function paraCampoDataHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Valor do <input type="datetime-local"> → ISO com fuso. */
export function deCampoDataHora(valor: string): string | null {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Resumo do §40 no portal, com o estado da visita e o que o cargo pode fazer. */
export interface FinalizacaoAtendimento extends ResumoFinalizacao {
  agendamento_id: string;
  estado_campo: EstadoCampo;
  /** registrar o diagnóstico (technician.jobs.start, OS aberta) */
  pode_registrar: boolean;
  /** finalizar (technician.jobs.complete, atendimento iniciado, OS aberta) */
  pode_finalizar: boolean;
}
