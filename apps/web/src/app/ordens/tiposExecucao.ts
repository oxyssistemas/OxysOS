/** Tipos de anexos, linha do tempo e checklists da OS (espelham as funções do banco). */

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

/** Espelha public.tipo_anexo_os ("video" já existe no banco, mas ainda não é aceito). */
export type TipoAnexo = "foto" | "documento" | "video";

/** Espelha public.momento_foto_os. */
export type MomentoFoto = "antes" | "durante" | "depois";

export const MOMENTOS_FOTO: { valor: MomentoFoto; rotulo: string }[] = [
  { valor: "antes", rotulo: "Antes" },
  { valor: "durante", rotulo: "Durante" },
  { valor: "depois", rotulo: "Depois" },
];

export const ROTULO_MOMENTO = Object.fromEntries(MOMENTOS_FOTO.map((m) => [m.valor, m.rotulo])) as Record<MomentoFoto, string>;

export interface AnexoOS {
  id: string;
  tipo: TipoAnexo;
  momento: MomentoFoto | null;
  nome_arquivo: string;
  caminho: string;
  mime_type: string;
  tamanho_bytes: number;
  descricao: string | null;
  criado_em: string;
  enviado_por: string | null;
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
  item?: string;
  quantidade?: number;
  subtotal?: number;
  arquivo?: string;
  tipo_anexo?: TipoAnexo;
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
  servico_executado: "serviço executado",
  solucao: "solução",
  observacoes_tecnicas: "observações técnicas",
  desconto: "desconto",
};

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

/** Espelha public.tipo_item_checklist. */
export type TipoItemChecklist = "checkbox" | "texto" | "numero" | "foto" | "selecao" | "data";

export const TIPOS_ITEM_CHECKLIST: { valor: TipoItemChecklist; rotulo: string }[] = [
  { valor: "checkbox", rotulo: "Caixa de seleção" },
  { valor: "texto", rotulo: "Texto" },
  { valor: "numero", rotulo: "Número" },
  { valor: "foto", rotulo: "Foto" },
  { valor: "selecao", rotulo: "Lista de opções" },
  { valor: "data", rotulo: "Data" },
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
  valor_booleano: boolean | null;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_data: string | null;
  valor_opcao: string | null;
  anexo: { id: string; nome_arquivo: string; caminho: string; removido: boolean } | null;
  respondido: boolean;
  respondido_por: string | null;
  respondido_em: string | null;
}

export interface ChecklistOS {
  id: string;
  nome: string;
  modelo_id: string | null;
  aplicado_em: string;
  aplicado_por: string | null;
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
}

export interface DadosModeloForm {
  nome: string;
  descricao: string;
  tipo_servico_id: string;
  itens: ItemModeloForm[];
}
