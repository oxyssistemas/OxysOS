import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Converte erros do banco em mensagens para o usuário. Detalhes técnicos vão só
 * para o console; o usuário nunca vê SQL, constraint ou stack trace.
 *
 * @param contexto   prefixo do log no console (ex.: "clientes")
 * @param restricoes nome da constraint/índice → mensagem amigável
 * @param padrao     mensagem quando o erro não é reconhecido
 */
export function erroAmigavel(
  contexto: string,
  error: PostgrestError,
  restricoes: Record<string, string>,
  padrao: string,
): Error {
  console.error(`[${contexto}]`, error);
  const texto = `${error.message} ${error.details ?? ""}`;

  const restricao = Object.keys(restricoes).find((nome) => texto.includes(nome));
  if (restricao) return new Error(restricoes[restricao]);

  // mensagens lançadas pelas nossas próprias regras (triggers/RPCs) já são amigáveis
  const mensagemPropria = /^[A-ZÀ-Ú][^\n]{5,200}\.$/.test(error.message) && !/[_"()]/.test(error.message);
  if (["42501", "23514", "40001", "P0002"].includes(error.code) && mensagemPropria) {
    return new Error(error.message);
  }

  if (error.code === "42501") return new Error("Você não tem permissão para esta ação.");
  if (error.code === "40001") return new Error("Os dados foram alterados por outra pessoa. Recarregue antes de salvar.");
  if (error.code === "23503") return new Error("Este registro está em uso e não pode ser removido.");
  return new Error(padrao);
}
