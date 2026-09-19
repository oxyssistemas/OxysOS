import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type {
  AnexoOS,
  ChecklistOS,
  DadosModeloForm,
  EventoTimeline,
  MomentoFoto,
  ModeloChecklist,
} from "./tiposExecucao";
import { ehFotoArquivo, tipoPorExtensao } from "./tiposExecucao";

const BUCKET = "os-anexos";
const VALIDADE_URL_SEGUNDOS = 60 * 60;

const MENSAGENS_RESTRICAO: Record<string, string> = {
  os_anexos_nome_tamanho: "O nome do arquivo deve ter até 200 caracteres.",
  os_anexos_descricao_tamanho: "A descrição deve ter até 500 caracteres.",
  os_observacoes_texto_tamanho: "O comentário deve ter entre 1 e 2.000 caracteres.",
  checklist_modelos_nome_tamanho: "O nome do modelo deve ter até 80 caracteres.",
  checklist_modelos_descricao_tamanho: "A descrição deve ter até 300 caracteres.",
  checklist_modelo_itens_rotulo_tamanho: "Cada item precisa de um nome com até 150 caracteres.",
  checklist_modelo_itens_ajuda_tamanho: "O texto de ajuda deve ter até 300 caracteres.",
  checklist_modelo_itens_opcoes: "Listas de opções aceitam de 2 a 30 opções.",
  os_checklist_itens_texto_tamanho: "O texto deve ter até 2.000 caracteres.",
};

function erro(error: PostgrestError, padrao: string): Error {
  const e = erroAmigavel("os-execucao", error, MENSAGENS_RESTRICAO, padrao);
  // validações de resposta do checklist e duplicidade também trazem mensagens próprias
  if (["22023", "23505", "23503", "P0002"].includes(error.code) && /^[A-ZÀ-Ú][^\n]{5,200}\.$/.test(error.message)) {
    return new Error(error.message);
  }
  return e;
}

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

export async function listarAnexos(osId: string): Promise<AnexoOS[]> {
  const { data, error } = await supabase.rpc("anexos_os", { p_os_id: osId });
  if (error) throw erro(error, "Não foi possível carregar os arquivos.");
  return (data ?? []) as AnexoOS[];
}

/**
 * Envia o arquivo para <empresa>/<os>/ e registra o anexo. Formato e tamanho
 * são lidos do Storage pelo banco; se o registro falhar, o arquivo enviado é apagado.
 */
export async function enviarAnexo(input: {
  lojaId: string;
  osId: string;
  arquivo: File;
  momento: MomentoFoto | null;
  descricao?: string;
}): Promise<string> {
  const { lojaId, osId, arquivo } = input;
  const extensao = arquivo.name.includes(".") ? arquivo.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const caminho = `${lojaId}/${osId}/${crypto.randomUUID()}${extensao ? `.${extensao}` : ""}`;
  const contentType = arquivo.type || tipoPorExtensao(arquivo.name) || "application/octet-stream";

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (erroUpload) {
    console.error("[os-execucao] upload", erroUpload);
    const msg = erroUpload.message.toLowerCase();
    if (msg.includes("size") || msg.includes("too large")) throw new Error("O arquivo excede o tamanho permitido.");
    if (msg.includes("mime") || msg.includes("type")) throw new Error("Formato de arquivo não aceito.");
    if (msg.includes("row-level security") || msg.includes("unauthorized")) throw new Error("Você não tem permissão para anexar arquivos.");
    throw new Error("Não foi possível enviar o arquivo. Verifique a conexão e tente novamente.");
  }

  const foto = ehFotoArquivo(arquivo);
  const { data, error } = await supabase
    .from("os_anexos")
    .insert({
      loja_id: lojaId,
      os_id: osId,
      tipo: foto ? "foto" : "documento",
      momento: foto ? input.momento : null,
      nome_arquivo: arquivo.name.slice(0, 200) || "arquivo",
      caminho,
      // conferidos e substituídos pelo banco
      mime_type: contentType,
      tamanho_bytes: Math.max(arquivo.size, 1),
      descricao: input.descricao?.trim() || null,
    })
    .select("id")
    .single();
  if (error) {
    const { error: erroLimpeza } = await supabase.storage.from(BUCKET).remove([caminho]);
    if (erroLimpeza) console.error("[os-execucao] limpeza do arquivo órfão", erroLimpeza);
    throw erro(error, "Não foi possível registrar o arquivo.");
  }
  return data.id as string;
}

export async function removerAnexo(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("os_anexos")
    .update({ removido_em: new Date().toISOString() })
    .eq("id", id)
    .is("removido_em", null)
    .select("id");
  if (error) throw erro(error, "Não foi possível remover o arquivo.");
  if (!data || data.length === 0) throw new Error("O arquivo já foi removido ou você não tem permissão.");
}

/** URLs temporárias (a política do bucket confere empresa, OS e permissão). */
export async function gerarUrlsAnexos(caminhos: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (caminhos.length === 0) return urls;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, VALIDADE_URL_SEGUNDOS);
  if (error || !data) {
    console.error("[os-execucao] URLs dos anexos", error);
    return urls;
  }
  for (const item of data) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export async function urlDownloadAnexo(caminho: string, nome: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60, { download: nome });
  if (error || !data) {
    console.error("[os-execucao] download", error);
    throw new Error("Não foi possível baixar o arquivo.");
  }
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Linha do tempo e comentários
// ---------------------------------------------------------------------------

export async function obterTimeline(osId: string, limite = 300): Promise<EventoTimeline[]> {
  const { data, error } = await supabase.rpc("timeline_os", { p_os_id: osId, p_limite: limite });
  if (error) throw erro(error, "Não foi possível carregar a linha do tempo.");
  return (data ?? []) as EventoTimeline[];
}

export async function adicionarComentario(osId: string, usuarioId: string, texto: string): Promise<void> {
  const { error } = await supabase.from("os_observacoes").insert({ os_id: osId, usuario_id: usuarioId, texto });
  if (error) throw erro(error, "Não foi possível registrar o comentário.");
}

// ---------------------------------------------------------------------------
// Checklists da OS
// ---------------------------------------------------------------------------

export async function listarChecklistsOS(osId: string): Promise<ChecklistOS[]> {
  const { data, error } = await supabase.rpc("checklists_os", { p_os_id: osId });
  if (error) throw erro(error, "Não foi possível carregar os checklists.");
  return (data ?? []) as ChecklistOS[];
}

export async function aplicarChecklist(osId: string, modeloId: string): Promise<void> {
  const { error } = await supabase.rpc("aplicar_checklist_os", { p_os_id: osId, p_modelo_id: modeloId });
  if (error) throw erro(error, "Não foi possível aplicar o checklist.");
}

export async function removerChecklist(checklistId: string): Promise<void> {
  const { error } = await supabase.rpc("remover_checklist_os", { p_checklist_id: checklistId });
  if (error) throw erro(error, "Não foi possível remover o checklist.");
}

export type ValorRespostaChecklist = boolean | number | string | null;

export async function responderItem(itemId: string, valor: ValorRespostaChecklist): Promise<{ checklist_completo: boolean }> {
  const { data, error } = await supabase.rpc("responder_item_checklist", { p_item_id: itemId, p_resposta: { valor } });
  if (error) throw erro(error, "Não foi possível salvar a resposta.");
  return data as { checklist_completo: boolean };
}

// ---------------------------------------------------------------------------
// Modelos de checklist
// ---------------------------------------------------------------------------

export async function listarModelosChecklist(): Promise<ModeloChecklist[]> {
  const { data, error } = await supabase.rpc("listar_checklist_modelos");
  if (error) throw erro(error, "Não foi possível carregar os modelos de checklist.");
  return (data ?? []) as ModeloChecklist[];
}

export async function salvarModeloChecklist(id: string | null, versao: number | null, dados: DadosModeloForm): Promise<string> {
  const { data, error } = await supabase.rpc("salvar_checklist_modelo", {
    p_id: id,
    p_versao: versao,
    p_dados: {
      nome: dados.nome,
      descricao: dados.descricao,
      tipo_servico_id: dados.tipo_servico_id,
    },
    p_itens: dados.itens.map((i) => ({
      rotulo: i.rotulo,
      tipo: i.tipo,
      obrigatorio: i.obrigatorio,
      ajuda: i.ajuda,
      opcoes: i.tipo === "selecao" ? i.opcoes.split("\n").map((o) => o.trim()).filter(Boolean) : [],
    })),
  });
  if (error) throw erro(error, "Não foi possível salvar o modelo.");
  return data as string;
}

export async function definirModeloChecklistAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.rpc("definir_checklist_modelo_ativo", { p_id: id, p_ativo: ativo });
  if (error) throw erro(error, ativo ? "Não foi possível reativar o modelo." : "Não foi possível desativar o modelo.");
}

export async function excluirModeloChecklist(id: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_checklist_modelo", { p_id: id });
  if (error) throw erro(error, "Não foi possível excluir o modelo.");
}
