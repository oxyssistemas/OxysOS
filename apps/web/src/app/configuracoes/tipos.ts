import type { LocalAtendimento } from "../legado/types";
import type { TipoItemChecklist } from "../ordens/tiposExecucao";

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
  /** requisitos para finalizar a OS (§39); o checklist obrigatório vale sempre */
  exige_diagnostico: boolean;
  exige_assinatura: boolean;
  exige_materiais: boolean;
  fotos_minimas: number;
}

/** "diagnóstico, 2 fotos, assinatura" — o que o tipo exige para finalizar. */
export function resumoRequisitosTipo(t: Pick<TipoServico, "exige_diagnostico" | "exige_assinatura" | "exige_materiais" | "fotos_minimas">): string[] {
  const itens: string[] = [];
  if (t.exige_diagnostico) itens.push("diagnóstico");
  if (t.fotos_minimas > 0) itens.push(t.fotos_minimas === 1 ? "1 foto" : `${t.fotos_minimas} fotos`);
  if (t.exige_assinatura) itens.push("assinatura");
  if (t.exige_materiais) itens.push("materiais");
  return itens;
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
  exige_diagnostico: boolean;
  exige_assinatura: boolean;
  exige_materiais: boolean;
  fotos_minimas: number;
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

// ---------------------------------------------------------------------------
// Sugestões de checklist por segmento (§29 e §30)
// ---------------------------------------------------------------------------

export interface SugestaoChecklist {
  nome: string;
  /** slugs de public.segmentos; vazio = serve para qualquer segmento */
  segmentos: string[];
  /** usa tipo de item que só existe com a feature advanced_checklists */
  avancado?: boolean;
  itens: {
    rotulo: string;
    tipo: TipoItemChecklist;
    obrigatorio?: boolean;
    opcoes?: string[];
    unidade?: string;
    valor_min?: string;
    valor_max?: string;
  }[];
}

/**
 * Modelos prontos oferecidos conforme o segmento da empresa. Nada é criado
 * sozinho: só entram no banco quando alguém clica (§64).
 */
export const SUGESTOES_CHECKLIST: SugestaoChecklist[] = [
  {
    nome: "Instalação de CFTV",
    segmentos: ["seguranca-eletronica"],
    itens: [
      { rotulo: "Câmera fixada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Cabeamento testado", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Imagem validada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Gravação funcionando", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Acesso remoto configurado", tipo: "checkbox" },
      { rotulo: "Foto da instalação", tipo: "foto" },
    ],
  },
  {
    nome: "Manutenção de alarme",
    segmentos: ["seguranca-eletronica"],
    itens: [
      { rotulo: "Central testada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Sensores testados", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Bateria", tipo: "selecao", opcoes: ["Boa", "Trocada", "Substituir em breve"] },
      { rotulo: "Sirene funcionando", tipo: "checkbox" },
      { rotulo: "Observações", tipo: "texto" },
    ],
  },
  {
    nome: "Controle de acesso",
    segmentos: ["seguranca-eletronica", "automacao"],
    itens: [
      { rotulo: "Leitora testada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Cadastros conferidos", tipo: "checkbox" },
      { rotulo: "Fechadura/trava testada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Botoeira e saída de emergência", tipo: "checkbox" },
    ],
  },
  {
    nome: "Instalação de split",
    segmentos: ["ar-condicionado", "refrigeracao"],
    avancado: true,
    itens: [
      { rotulo: "Unidades fixadas e niveladas", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Vácuo realizado", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Teste de vazamento", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Dreno testado", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Temperatura de insuflamento", tipo: "medicao", unidade: "°C", valor_min: "8", valor_max: "16" },
      { rotulo: "Foto da instalação", tipo: "foto" },
    ],
  },
  {
    nome: "Higienização de ar-condicionado",
    segmentos: ["ar-condicionado", "refrigeracao"],
    itens: [
      { rotulo: "Filtros lavados", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Serpentina higienizada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Bandeja e dreno limpos", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Foto antes", tipo: "foto" },
      { rotulo: "Foto depois", tipo: "foto" },
    ],
  },
  {
    nome: "Manutenção preventiva",
    segmentos: ["ar-condicionado", "refrigeracao", "eletrica", "manutencao-predial"],
    avancado: true,
    itens: [
      { rotulo: "Inspeção visual sem avarias", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Tensão da rede", tipo: "medicao", unidade: "V", valor_min: "200", valor_max: "240" },
      { rotulo: "Corrente do equipamento", tipo: "medicao", unidade: "A" },
      { rotulo: "Limpeza realizada", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Próxima revisão", tipo: "data" },
    ],
  },
  {
    nome: "Manutenção de computador",
    segmentos: ["ti", "assistencia-tecnica"],
    itens: [
      { rotulo: "Backup conferido com o cliente", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Limpeza interna", tipo: "checkbox" },
      { rotulo: "Sistema atualizado", tipo: "checkbox" },
      { rotulo: "Antivírus verificado", tipo: "checkbox" },
      { rotulo: "Estado do disco", tipo: "selecao", opcoes: ["Bom", "Atenção", "Substituir"] },
    ],
  },
  {
    nome: "Instalação de rede",
    segmentos: ["ti", "telecom"],
    itens: [
      { rotulo: "Pontos certificados", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Rack organizado e identificado", tipo: "checkbox" },
      { rotulo: "Wi-Fi testado em todos os ambientes", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Velocidade medida", tipo: "numero" },
      { rotulo: "Foto do rack", tipo: "foto" },
    ],
  },
  {
    nome: "Atendimento em servidor",
    segmentos: ["ti"],
    itens: [
      { rotulo: "Backup validado", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Serviços conferidos", tipo: "checkbox", obrigatorio: true },
      { rotulo: "Espaço em disco conferido", tipo: "checkbox" },
      { rotulo: "Janela de manutenção combinada", tipo: "texto" },
    ],
  },
  {
    nome: "Visita técnica",
    segmentos: [],
    itens: [
      { rotulo: "Problema reproduzido", tipo: "checkbox" },
      { rotulo: "Diagnóstico", tipo: "texto", obrigatorio: true },
      { rotulo: "Local deixado limpo", tipo: "checkbox" },
      { rotulo: "Foto do atendimento", tipo: "foto" },
    ],
  },
];
