/** Tipos de anexos, linha do tempo e checklists da OS (espelham as funções do banco). */

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

/** Espelha public.tipo_anexo_os ("video" já existe no banco, mas ainda não é aceito). */
export type TipoAnexo = "foto" | "documento" | "video";

/** Espelha public.momento_foto_os — a categoria da evidência (§31). */
export type MomentoFoto = "antes" | "durante" | "depois" | "problema" | "equipamento" | "outros";

export const MOMENTOS_FOTO: { valor: MomentoFoto; rotulo: string }[] = [
  { valor: "antes", rotulo: "Antes" },
  { valor: "durante", rotulo: "Durante" },
  { valor: "depois", rotulo: "Depois" },
  { valor: "problema", rotulo: "Problema" },
  { valor: "equipamento", rotulo: "Equipamento" },
  { valor: "outros", rotulo: "Outros" },
];

export const ROTULO_MOMENTO = Object.fromEntries(MOMENTOS_FOTO.map((m) => [m.valor, m.rotulo])) as Record<MomentoFoto, string>;

export interface AnexoOS {
  id: string;
  tipo: TipoAnexo;
  /** categoria da evidência */
  momento: MomentoFoto | null;
  nome_arquivo: string;
  caminho: string;
  mime_type: string;
  tamanho_bytes: number;
  descricao: string | null;
  criado_em: string;
  enviado_por: string | null;
  /** técnico que registrou em campo */
  tecnico: string | null;
  /** enviado pelo usuário logado */
  meu: boolean;
}

/** Mesma lista do bucket os-anexos. */
export const FORMATOS_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const FORMATOS_DOCUMENTO = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export const LIMITE_FOTO_BYTES = 10 * 1024 * 1024;
export const LIMITE_DOCUMENTO_BYTES = 20 * 1024 * 1024;
export const ACCEPT_ANEXOS = [...FORMATOS_FOTO, ...FORMATOS_DOCUMENTO, ".heic", ".heif"].join(",");

/** Valida no navegador o que o banco valida de novo (formato e tamanho reais). */
export function validarArquivoAnexo(arquivo: File): string | null {
  const tipo = arquivo.type || tipoPorExtensao(arquivo.name);
  if (FORMATOS_FOTO.includes(tipo)) {
    return arquivo.size > LIMITE_FOTO_BYTES ? "A foto deve ter no máximo 10 MB." : null;
  }
  if (FORMATOS_DOCUMENTO.includes(tipo)) {
    return arquivo.size > LIMITE_DOCUMENTO_BYTES ? "O documento deve ter no máximo 20 MB." : null;
  }
  if (tipo.startsWith("video/")) return "Vídeos ainda não são aceitos.";
  return "Formato não aceito. Envie fotos (JPG, PNG, WEBP, HEIC) ou documentos (PDF, Word, Excel, TXT, CSV).";
}

/** Alguns navegadores não informam o tipo de arquivos HEIC. */
export function tipoPorExtensao(nome: string): string {
  const ext = nome.split(".").pop()?.toLowerCase();
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "";
}

export function ehFotoArquivo(arquivo: File): boolean {
  return FORMATOS_FOTO.includes(arquivo.type || tipoPorExtensao(arquivo.name));
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

export interface DadosEventoTimeline {
  campos?: string[];
  status_de?: string;
  status_para?: string;
  status_cor?: string;
  observacao?: string;
  prioridade_de?: string;
  prioridade_para?: string;
  tipo_de?: string;
  tipo_para?: string;
  local_de?: string;
  local_para?: string;
  tecnico?: string;
  equipe?: string;
  /** agendamento: horários em ISO */
  inicio?: string;
  fim?: string;
  de_inicio?: string;
  forcado?: boolean;
  item?: string;
  quantidade?: number;
  subtotal?: number;
  arquivo?: string;
  tipo_anexo?: TipoAnexo;
  motivo?: string;
  tipo_apontamento?: string;
  duracao_min?: number;
  responsavel?: string;
  substituiu?: boolean;
  encerrou_os?: boolean;
  checklist?: string;
  texto?: string;
}

export interface EventoTimeline {
  id: string;
  acao: string;
  criado_em: string;
  usuario: string | null;
  dados: DadosEventoTimeline;
}

export const ROTULO_CAMPO_OS: Record<string, string> = {
  titulo: "título",
  descricao: "descrição",
  objeto: "objeto do atendimento",
  equipamento: "equipamento",
  agendamento: "agendamento",
  prazo: "prazo",
  observacoes_internas: "observações internas",
  diagnostico: "diagnóstico",
  causa: "causa encontrada",
  servico_executado: "serviço executado",
  solucao: "solução",
  recomendacao: "recomendação",
  observacoes_tecnicas: "observações técnicas",
  desconto: "desconto",
};

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

/** Espelha public.tipo_item_checklist. */
export type TipoItemChecklist =
  | "checkbox"
  | "texto"
  | "numero"
  | "medicao"
  | "foto"
  | "assinatura"
  | "selecao"
  | "data"
  | "hora";

export const TIPOS_ITEM_CHECKLIST: { valor: TipoItemChecklist; rotulo: string; avancado?: boolean }[] = [
  { valor: "checkbox", rotulo: "Caixa de seleção" },
  { valor: "texto", rotulo: "Texto" },
  { valor: "numero", rotulo: "Número" },
  { valor: "medicao", rotulo: "Medição", avancado: true },
  { valor: "foto", rotulo: "Foto" },
  { valor: "assinatura", rotulo: "Assinatura", avancado: true },
  { valor: "selecao", rotulo: "Lista de opções" },
  { valor: "data", rotulo: "Data" },
  { valor: "hora", rotulo: "Hora", avancado: true },
];

/** Tipos que só existem com a feature advanced_checklists. */
export const TIPOS_ITEM_AVANCADOS = TIPOS_ITEM_CHECKLIST.filter((t) => t.avancado).map((t) => t.valor);

/** Só um item de caixa de seleção ou lista pode governar a condição de outro (§28). */
export const TIPOS_ITEM_CONDICIONAVEIS: TipoItemChecklist[] = ["checkbox", "selecao"];

export const OPCOES_CONDICAO_CHECKBOX = [
  { valor: "true", rotulo: "estiver marcado" },
  { valor: "false", rotulo: "não estiver marcado" },
];

export const ROTULO_TIPO_ITEM_CHECKLIST = Object.fromEntries(
  TIPOS_ITEM_CHECKLIST.map((t) => [t.valor, t.rotulo]),
) as Record<TipoItemChecklist, string>;

export interface ItemModeloChecklist {
  id: string;
  ordem: number;
  rotulo: string;
  tipo: TipoItemChecklist;
  obrigatorio: boolean;
  opcoes: string[];
  ajuda: string | null;
  /** medição */
  unidade: string | null;
  valor_min: number | null;
  valor_max: number | null;
  /** item condicional: aparece quando o item desta ordem responder condicao_valor */
  depende_de_ordem: number | null;
  condicao_valor: string | null;
}

export interface ModeloChecklist {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  versao: number;
  tipo_servico: { id: string; nome: string } | null;
  total_uso: number;
  itens: ItemModeloChecklist[];
}

export interface ItemChecklistOS {
  id: string;
  ordem: number;
  rotulo: string;
  tipo: TipoItemChecklist;
  obrigatorio: boolean;
  opcoes: string[];
  ajuda: string | null;
  unidade: string | null;
  valor_min: number | null;
  valor_max: number | null;
  depende_de_ordem: number | null;
  condicao_valor: string | null;
  valor_booleano: boolean | null;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_data: string | null;
  valor_hora: string | null;
  valor_opcao: string | null;
  anexo: { id: string; nome_arquivo: string; caminho: string; removido: boolean } | null;
  respondido: boolean;
  /** condição atendida: item escondido não é exigido nem aceita resposta */
  visivel: boolean;
  /** medição fora da faixa esperada (avisa, não bloqueia) */
  fora_faixa: boolean;
  respondido_por: string | null;
  respondido_em: string | null;
}

export interface ChecklistOS {
  id: string;
  nome: string;
  modelo_id: string | null;
  aplicado_em: string;
  aplicado_por: string | null;
  /** obrigatórios visíveis ainda sem resposta */
  pendentes: number;
  itens: ItemChecklistOS[];
}

/** Item do formulário do modelo (chave local para a lista). */
export interface ItemModeloForm {
  chave: string;
  rotulo: string;
  tipo: TipoItemChecklist;
  obrigatorio: boolean;
  /** uma opção por linha */
  opcoes: string;
  ajuda: string;
  /** medição */
  unidade: string;
  valor_min: string;
  valor_max: string;
  /** "" = sempre visível; senão, a ordem (1-based) do item que governa */
  depende_de_ordem: string;
  condicao_valor: string;
}

export interface DadosModeloForm {
  nome: string;
  descricao: string;
  tipo_servico_id: string;
  itens: ItemModeloForm[];
}

// ---------------------------------------------------------------------------
// Apontamento de horas
// ---------------------------------------------------------------------------

/** Espelha public.tipo_apontamento. */
export type TipoApontamento = "deslocamento" | "atendimento" | "pausa";

/** Espelha public.motivo_pausa. */
export type MotivoPausaOS = "almoco" | "aguardando_cliente" | "aguardando_peca" | "problema_tecnico" | "outro";

/** Espelha public.origem_apontamento. */
export type OrigemApontamento = "automatico" | "manual";

export const TIPOS_APONTAMENTO: { valor: TipoApontamento; rotulo: string }[] = [
  { valor: "deslocamento", rotulo: "Deslocamento" },
  { valor: "atendimento", rotulo: "Atendimento" },
  { valor: "pausa", rotulo: "Pausa" },
];

export const ROTULO_TIPO_APONTAMENTO = Object.fromEntries(
  TIPOS_APONTAMENTO.map((t) => [t.valor, t.rotulo]),
) as Record<TipoApontamento, string>;

export const MOTIVOS_PAUSA_OS: { valor: MotivoPausaOS; rotulo: string }[] = [
  { valor: "almoco", rotulo: "Almoço" },
  { valor: "aguardando_cliente", rotulo: "Aguardando o cliente" },
  { valor: "aguardando_peca", rotulo: "Aguardando peça" },
  { valor: "problema_tecnico", rotulo: "Problema técnico" },
  { valor: "outro", rotulo: "Outro" },
];

export const ROTULO_MOTIVO_PAUSA = Object.fromEntries(
  MOTIVOS_PAUSA_OS.map((m) => [m.valor, m.rotulo]),
) as Record<MotivoPausaOS, string>;

export interface Apontamento {
  id: string;
  tipo: TipoApontamento;
  tecnico_id: string;
  tecnico: string;
  inicio_em: string;
  fim_em: string | null;
  duracao_min: number;
  aberto: boolean;
  motivo: MotivoPausaOS | null;
  observacao: string | null;
  origem: OrigemApontamento;
  ajustado: boolean;
  agendamento_id: string | null;
}

export interface TotaisHoras {
  deslocamento_min: number;
  atendimento_min: number;
  pausa_min: number;
  trabalhado_min: number;
}

export interface HorasPorTecnico extends TotaisHoras {
  tecnico_id: string;
  nome: string;
}

export interface HorasOS {
  totais: TotaisHoras;
  pode_gerenciar: boolean;
  por_tecnico: HorasPorTecnico[];
  apontamentos: Apontamento[];
}

export interface DadosApontamentoForm {
  tecnico_id: string;
  tipo: TipoApontamento;
  inicio: string;
  fim: string;
  motivo: MotivoPausaOS;
  observacao: string;
}

/** 95 → "1h 35min"; 40 → "40min"; 0 → "0min". */
export function duracaoEmHoras(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${m % 60 > 0 ? ` ${m % 60}min` : ""}` : `${m}min`;
}

/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
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

/** "220 V" / "14:30" / "8" — o valor respondido, pronto para leitura. */
/** Só o que é preciso para mostrar a resposta (serve ao item da OS e ao do relatório). */
export type RespostaItemChecklist = Pick<
  ItemChecklistOS,
  "tipo" | "unidade" | "valor_booleano" | "valor_texto" | "valor_numero" | "valor_data" | "valor_hora" | "valor_opcao"
> & { anexo: { nome_arquivo: string } | null };

export function valorItemChecklist(item: RespostaItemChecklist): string | null {
  switch (item.tipo) {
    case "checkbox":
      return item.valor_booleano ? "Sim" : null;
    case "texto":
      return item.valor_texto;
    case "numero":
      return item.valor_numero == null ? null : String(item.valor_numero);
    case "medicao":
      return item.valor_numero == null ? null : `${item.valor_numero}${item.unidade ? ` ${item.unidade}` : ""}`;
    case "selecao":
      return item.valor_opcao;
    case "data":
      return item.valor_data ? new Date(`${item.valor_data}T12:00:00`).toLocaleDateString("pt-BR") : null;
    case "hora":
      return item.valor_hora ? item.valor_hora.slice(0, 5) : null;
    case "foto":
    case "assinatura":
      return item.anexo ? item.anexo.nome_arquivo : null;
  }
}

/** "entre 110 e 240 V" / "até 240 V" / "a partir de 110 V" */
export function faixaEsperada(item: { valor_min: number | null; valor_max: number | null; unidade: string | null }): string | null {
  const u = item.unidade ? ` ${item.unidade}` : "";
  if (item.valor_min != null && item.valor_max != null) return `entre ${item.valor_min} e ${item.valor_max}${u}`;
  if (item.valor_max != null) return `até ${item.valor_max}${u}`;
  if (item.valor_min != null) return `a partir de ${item.valor_min}${u}`;
  return null;
}

// ---------------------------------------------------------------------------
// Assinatura e confirmação do cliente (§37 e §38)
// ---------------------------------------------------------------------------

export interface AssinaturaCliente {
  id: string;
  nome_responsavel: string;
  documento: string | null;
  observacao: string | null;
  /** PNG em data URL, fundo branco */
  imagem_png: string;
  hash_sha256: string;
  assinado_em: string;
  registrado_por: string | null;
  tecnico: string | null;
}

export interface AssinaturaOS {
  pode_assinar: boolean;
  encerrada: boolean;
  atual: AssinaturaCliente | null;
  /** substituídas, sem a imagem */
  substituidas: { id: string; nome_responsavel: string; assinado_em: string; substituida_em: string; hash_sha256: string }[];
}

export interface DadosConfirmacaoCliente {
  nome: string;
  documento: string;
  observacao: string;
}

/** data URL → File, para mandar a assinatura do checklist como anexo da OS. */
export function arquivoDeDataUrl(dataUrl: string, nome: string): File {
  const [cabecalho, base64] = dataUrl.split(",");
  const tipo = cabecalho.match(/data:([^;]+)/)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new File([bytes], nome, { type: tipo });
}

// ---------------------------------------------------------------------------
// Finalização (§36 diagnóstico, §39 requisitos, §40 resumo)
// ---------------------------------------------------------------------------

export type CampoAtendimento =
  | "diagnostico"
  | "causa"
  | "servico_executado"
  | "solucao"
  | "recomendacao"
  | "observacoes_tecnicas";

export type CamposAtendimento = Record<CampoAtendimento, string | null>;

/** Registro técnico do atendimento, na ordem do §36. */
export const CAMPOS_ATENDIMENTO: { campo: CampoAtendimento; rotulo: string; dica: string }[] = [
  { campo: "diagnostico", rotulo: "Diagnóstico técnico", dica: "O que foi encontrado na análise." },
  { campo: "causa", rotulo: "Causa encontrada", dica: "O que provocou o problema." },
  { campo: "servico_executado", rotulo: "Serviço executado", dica: "O que foi feito no atendimento." },
  { campo: "solucao", rotulo: "Solução aplicada", dica: "Como o problema foi resolvido." },
  { campo: "recomendacao", rotulo: "Recomendação", dica: "O que o cliente deve fazer daqui para frente." },
  { campo: "observacoes_tecnicas", rotulo: "Observações", dica: "Pendências ou cuidados." },
];

export type ChaveRequisito = "checklist" | "diagnostico" | "fotos" | "assinatura" | "materiais";

export interface RequisitoFinalizacao {
  chave: ChaveRequisito;
  rotulo: string;
  ok: boolean;
  detalhe: string;
}

export interface ResumoFinalizacao {
  os_id: string;
  numero: string | null;
  encerrada: boolean;
  status: { nome: string; cor: string; categoria: string };
  tipo_servico: { id: string; nome: string } | null;
  tempos: { deslocamento_min: number; atendimento_min: number; pausa_min: number; relogio_aberto: boolean };
  checklist: { checklists: number; itens: number; respondidos: number; pendentes: number };
  materiais: { descricao: string; tipo: string; quantidade: number; unidade: string | null }[];
  servicos: { descricao: string; quantidade: number; unidade: string | null }[];
  fotos: number;
  atendimento: CamposAtendimento;
  assinatura: { nome_responsavel: string; assinado_em: string } | null;
  /** o checklist obrigatório vale sempre; os demais vêm do tipo de serviço */
  requisitos: RequisitoFinalizacao[];
  pendentes: number;
  pode_finalizar: boolean;
}

// ---------------------------------------------------------------------------
// Relatório técnico (§41) — estrutura estável, pronta para um PDF futuro
// ---------------------------------------------------------------------------

export interface ItemRelatorioChecklist extends RespostaItemChecklist {
  ordem: number;
  rotulo: string;
  obrigatorio: boolean;
  valor_min: number | null;
  valor_max: number | null;
  anexo: { nome_arquivo: string; caminho: string } | null;
  fora_faixa: boolean;
  respondido_em: string | null;
}

export interface RelatorioTecnico {
  estrutura: number;
  montado_em: string;
  empresa: { nome: string; cnpj: string | null; telefone: string | null; cidade: string | null; estado: string | null };
  os: {
    id: string;
    numero: string | null;
    titulo: string | null;
    tipo_servico: string | null;
    prioridade: string | null;
    status: { nome: string; categoria: string };
    local_atendimento: "loja" | "externo";
    objeto_atendimento: string | null;
    aberta_em: string;
    concluida_em: string | null;
  };
  /** telefone, documento e e-mail só vêm para quem tem customers.view */
  cliente: { nome: string; documento?: string | null; telefone?: string | null; email?: string | null };
  endereco: {
    rotulo: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
    referencia: string | null;
  } | null;
  equipamento: { nome: string; marca: string | null; modelo: string | null; numero_serie: string | null; localizacao: string | null } | null;
  tecnico: string | null;
  equipe: string | null;
  problema: string;
  atendimento: CamposAtendimento;
  checklists: { nome: string; itens: ItemRelatorioChecklist[] }[];
  materiais: { descricao: string; tipo: string; quantidade: number; unidade: string | null; observacao: string | null }[];
  servicos: { descricao: string; quantidade: number; unidade: string | null; observacao: string | null }[];
  fotos: { caminho: string; nome_arquivo: string; momento: MomentoFoto | null; descricao: string | null; enviado_em: string; tecnico: string | null }[];
  visitas: {
    inicio_previsto: string;
    fim_previsto: string;
    status: string;
    tecnico: string | null;
    equipe: string | null;
    saida_em: string | null;
    chegada_em: string | null;
    inicio_atendimento_em: string | null;
    termino_em: string | null;
  }[];
  tempos: { deslocamento_min: number; atendimento_min: number; pausa_min: number };
  assinatura: {
    nome_responsavel: string;
    documento: string | null;
    observacao: string | null;
    assinado_em: string;
    hash_sha256: string;
    imagem_png: string;
  } | null;
}

export interface LeituraRelatorio {
  /** "finalizacao": versão congelada; "previa": dados atuais, a OS ainda não foi finalizada */
  origem: "finalizacao" | "previa";
  versao: number | null;
  gerado_em: string | null;
  gerado_por: string | null;
  encerrada: boolean;
  versoes: { versao: number; gerado_em: string; gerado_por: string | null }[];
  relatorio: RelatorioTecnico;
}
