import type { CategoriaStatus, NivelPrioridade } from "../configuracoes/tipos";
import type { EnderecoOS, LocalAtendimento } from "../legado/types";

/** Espelha public.situacao_sla_os(). */
export type SituacaoSla = "sem_prazo" | "no_prazo" | "vencendo" | "atrasada" | "cumprido" | "cumprido_atraso" | "cancelada";

export const ROTULO_SLA: Record<SituacaoSla, string> = {
  sem_prazo: "Sem prazo",
  no_prazo: "No prazo",
  vencendo: "Vence em breve",
  atrasada: "Atrasada",
  cumprido: "Concluída no prazo",
  cumprido_atraso: "Concluída com atraso",
  cancelada: "Cancelada",
};

export type GrupoOrdens = "abertas" | "finalizadas" | "canceladas" | "todas";
export type OrdenacaoOrdens = "recentes" | "prazo" | "agendamento";
export type FiltroSla = "" | "atrasada" | "vencendo" | "no_prazo" | "sem_prazo";

/** Espelha o enum public.tipo_item_os. */
export type TipoItemOS = "servico" | "produto" | "peca" | "material";

export const TIPOS_ITEM: { valor: TipoItemOS; rotulo: string }[] = [
  { valor: "servico", rotulo: "Serviço" },
  { valor: "produto", rotulo: "Produto" },
  { valor: "peca", rotulo: "Peça" },
  { valor: "material", rotulo: "Material" },
];

export const ROTULO_TIPO_ITEM = Object.fromEntries(TIPOS_ITEM.map((t) => [t.valor, t.rotulo])) as Record<TipoItemOS, string>;

export interface RefNome {
  id: string;
  nome: string;
}

export interface StatusResumo {
  id: string;
  nome: string;
  cor: string;
  categoria: CategoriaStatus;
}

export interface PrioridadeResumo {
  id: string;
  nome: string;
  cor: string;
  nivel: NivelPrioridade;
}

export interface OrdemListagem {
  id: string;
  numero: string;
  titulo: string | null;
  descricao: string;
  criado_em: string;
  data_agendada: string | null;
  hora_agendada: string | null;
  prazo_em: string | null;
  concluido_em: string | null;
  sla: SituacaoSla;
  valor_total: number;
  local_atendimento: LocalAtendimento;
  cliente: RefNome;
  status: StatusResumo;
  prioridade: PrioridadeResumo | null;
  tipo_servico: RefNome | null;
  tecnico: RefNome | null;
  equipamento: RefNome | null;
}

export interface FiltrosOrdens {
  busca: string;
  grupo: GrupoOrdens;
  status: string;
  prioridade: string;
  /** id do técnico ou "sem" */
  tecnico: string;
  tipo: string;
  sla: FiltroSla;
  ordem: OrdenacaoOrdens;
  cliente: string;
  equipamento: string;
  pagina: number;
}

export interface OrdemDetalhe {
  id: string;
  loja_id: string;
  numero: string;
  titulo: string | null;
  descricao: string;
  objeto_atendimento: string | null;
  codigo_aparelho: string | null;
  local_atendimento: LocalAtendimento;
  cliente_endereco_id: string | null;
  equipamento_id: string | null;
  tipo_servico_id: string | null;
  prioridade_id: string;
  tecnico_id: string | null;
  status_id: string;
  data_agendada: string | null;
  hora_agendada: string | null;
  sla_horas: number | null;
  prazo_em: string | null;
  concluido_em: string | null;
  iniciado_em: string | null;
  observacoes_internas: string | null;
  diagnostico: string | null;
  servico_executado: string | null;
  solucao: string | null;
  observacoes_tecnicas: string | null;
  desconto: number;
  valor_total: number;
  subtotal_itens: number;
  versao: number;
  criado_em: string;
  atualizado_em: string;
  sla: SituacaoSla;
  status: StatusResumo & { chave: string };
  cliente: RefNome & { arquivado: boolean; telefone: string | null; email: string | null; documento: string | null };
  endereco: (EnderecoOS & { id: string; rotulo: string }) | null;
  equipamento: (RefNome & { marca: string | null; modelo: string | null; numero_serie: string | null }) | null;
  prioridade: (PrioridadeResumo & { sla_horas: number | null }) | null;
  tipo_servico: RefNome | null;
  tecnico: (RefNome & { ativo: boolean }) | null;
  criador: RefNome | null;
  atualizador: RefNome | null;
}

export interface ItemOrdem {
  id: string;
  os_id: string;
  tipo: TipoItemOS;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  subtotal: number;
  criado_em: string;
}

export interface DadosItemForm {
  tipo: TipoItemOS;
  descricao: string;
  quantidade: string;
  valor_unitario: string;
}

/** Como o prazo é definido no formulário. */
export type ModoPrazo = "prioridade" | "horas" | "data" | "sem";

export interface DadosOrdemForm {
  titulo: string;
  descricao: string;
  objeto_atendimento: string;
  local_atendimento: LocalAtendimento;
  cliente_endereco_id: string;
  equipamento_id: string;
  tipo_servico_id: string;
  prioridade_id: string;
  data_agendada: string;
  hora_agendada: string;
  modo_prazo: ModoPrazo;
  sla_horas: string;
  /** datetime-local (horário do navegador) */
  prazo_data: string;
  observacoes_internas: string;
}

export interface OpcaoTecnico {
  id: string;
  nome: string;
}

export interface OpcaoEquipamento {
  id: string;
  nome: string;
  detalhe: string;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

export function formatarMoeda(valor: number): string {
  return moeda.format(Number(valor) || 0);
}

export function formatarDataHora(iso: string): string {
  return dataHora.format(new Date(iso));
}

/** "AAAA-MM-DD" (sem fuso) → dd/mm/aaaa. */
export function formatarDataSimples(data: string): string {
  return dataCurta.format(new Date(`${data}T00:00:00Z`));
}

export function formatarAgendamento(data: string | null, hora: string | null): string | null {
  if (!data) return null;
  return hora ? `${formatarDataSimples(data)} às ${hora.slice(0, 5)}` : formatarDataSimples(data);
}

export const CATEGORIAS_ENCERRADAS: CategoriaStatus[] = ["finalizado_sucesso", "finalizado_cancelado"];

export function estaEncerrada(categoria: CategoriaStatus): boolean {
  return CATEGORIAS_ENCERRADAS.includes(categoria);
}

/** timestamptz → valor de <input type="datetime-local"> no horário do navegador. */
export function paraDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
