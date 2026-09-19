import type { LocalAtendimento } from "../legado/types";

/** Espelha o enum public.categoria_status: regras do sistema usam só a categoria. */
export type CategoriaStatus =
  | "aberto"
  | "agendado"
  | "em_andamento"
  | "pausado"
  | "finalizado_sucesso"
  | "finalizado_cancelado";

export const CATEGORIAS_STATUS: { valor: CategoriaStatus; rotulo: string; descricao: string }[] = [
  { valor: "aberto", rotulo: "Aberta", descricao: "Recebida, em triagem ou aguardando algo antes de começar." },
  { valor: "agendado", rotulo: "Agendada", descricao: "Com data marcada para o atendimento." },
  { valor: "em_andamento", rotulo: "Em andamento", descricao: "Técnico a caminho ou executando o serviço." },
  { valor: "pausado", rotulo: "Pausada", descricao: "Parada temporariamente (ex.: aguardando peça)." },
  { valor: "finalizado_sucesso", rotulo: "Finalizada", descricao: "Serviço concluído. Exige permissão para finalizar." },
  { valor: "finalizado_cancelado", rotulo: "Cancelada", descricao: "Encerrada sem execução. Exige permissão para cancelar." },
];

export const ROTULO_CATEGORIA_STATUS = Object.fromEntries(
  CATEGORIAS_STATUS.map((c) => [c.valor, c.rotulo]),
) as Record<CategoriaStatus, string>;

export const CATEGORIAS_FINAIS: CategoriaStatus[] = ["finalizado_sucesso", "finalizado_cancelado"];

/** O banco exige ao menos um status ativo nestas categorias (iniciar, finalizar, cancelar). */
export const CATEGORIAS_ESSENCIAIS: CategoriaStatus[] = ["aberto", "em_andamento", "finalizado_sucesso", "finalizado_cancelado"];

/** Espelha o enum public.nivel_prioridade. */
export type NivelPrioridade = "baixa" | "normal" | "alta" | "urgente";

export const NIVEIS_PRIORIDADE: { valor: NivelPrioridade; rotulo: string }[] = [
  { valor: "baixa", rotulo: "Baixa" },
  { valor: "normal", rotulo: "Normal" },
  { valor: "alta", rotulo: "Alta" },
  { valor: "urgente", rotulo: "Urgente" },
];

export const ROTULO_NIVEL_PRIORIDADE = Object.fromEntries(
  NIVEIS_PRIORIDADE.map((n) => [n.valor, n.rotulo]),
) as Record<NivelPrioridade, string>;

export interface StatusOSConfig {
  id: string;
  chave: string;
  nome: string;
  categoria: CategoriaStatus;
  cor: string;
  ordem: number;
  ativo: boolean;
  inicial: boolean;
}

export interface PrioridadeOS {
  id: string;
  chave: string;
  nome: string;
  nivel: NivelPrioridade;
  cor: string;
  ordem: number;
  padrao: boolean;
  ativo: boolean;
  /** prazo sugerido para OS com esta prioridade */
  sla_horas: number | null;
}

export interface TipoServico {
  id: string;
  nome: string;
  descricao: string | null;
  local_atendimento_padrao: LocalAtendimento | null;
  ativo: boolean;
}

/** id → quantidade de OS (status inclui o histórico, que também impede a exclusão). */
export interface UsoConfiguracaoOS {
  status: Record<string, number>;
  status_os_atuais: Record<string, number>;
  prioridades: Record<string, number>;
  tipos: Record<string, number>;
}

export interface DadosStatusForm {
  nome: string;
  categoria: CategoriaStatus;
  cor: string;
}

export interface DadosPrioridadeForm {
  nome: string;
  nivel: NivelPrioridade;
  cor: string;
  /** texto do campo; vazio = sem SLA */
  sla_horas: string;
}

export interface DadosTipoServicoForm {
  nome: string;
  descricao: string;
  local_atendimento_padrao: LocalAtendimento | "";
}

/** Cores legíveis sobre o tema escuro. */
export const CORES_CONFIGURACAO = [
  "#378ADD",
  "#1565FF",
  "#7F77DD",
  "#D4537E",
  "#E24B4A",
  "#EF9F27",
  "#BA7517",
  "#639922",
  "#1D9E75",
  "#5DCAA5",
  "#888780",
  "#B4B2A9",
];

export const COR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Exemplos oferecidos quando a empresa ainda não tem o tipo (só entram se o usuário clicar). */
export const SUGESTOES_TIPOS_SERVICO: { nome: string; local: LocalAtendimento | null }[] = [
  { nome: "Instalação", local: "externo" },
  { nome: "Manutenção", local: null },
  { nome: "Manutenção preventiva", local: null },
  { nome: "Manutenção corretiva", local: null },
  { nome: "Visita técnica", local: "externo" },
  { nome: "Configuração", local: null },
  { nome: "Retirada", local: null },
  { nome: "Troca", local: null },
];
