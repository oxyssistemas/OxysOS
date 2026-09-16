import { supabase, callEdgeFunction } from "@oxys/shared/supabase";
import { registrarLog } from "./logsService";
import type { Assinatura, Gerente, Loja, LojaComRelacoes, Plano, Segmento, StatusLoja } from "../types";

export interface CriarEmpresaInput {
  nome_loja: string;
  cnpj: string;
  telefone: string;
  cidade: string;
  estado: string;
  segmento_id: string;
  plano_id: string;
  ciclo_cobranca: "mensal" | "anual";
  eh_trial: boolean;
  trial_dias: number;
  nome_gerente: string;
  email_gerente: string;
  senha_gerente: string;
}

export async function listarEmpresasComRelacoes(): Promise<LojaComRelacoes[]> {
  const [
    { data: lojas, error: lojasError },
    { data: gerentes },
    { data: segmentos },
    { data: assinaturas },
    { data: planos },
  ] = await Promise.all([
    supabase.from("lojas").select("*").order("criado_em", { ascending: false }),
    supabase.from("usuarios").select("*").eq("papel", "gerente"),
    supabase.from("segmentos").select("*"),
    supabase.from("assinaturas").select("*"),
    supabase.from("planos").select("*"),
  ]);

  if (lojasError) throw new Error(lojasError.message);

  const gerentesPorLoja = new Map<string, Gerente>();
  for (const g of gerentes ?? []) {
    if (!gerentesPorLoja.has(g.loja_id)) gerentesPorLoja.set(g.loja_id, g as Gerente);
  }
  const segmentosPorId = new Map<string, Segmento>((segmentos ?? []).map((s) => [s.id, s as Segmento]));
  const assinaturasPorLoja = new Map<string, Assinatura>(
    (assinaturas ?? []).map((a) => [a.loja_id, a as Assinatura]),
  );
  const planosPorId = new Map<string, Plano>((planos ?? []).map((p) => [p.id, p as Plano]));

  return (lojas ?? []).map((loja) => {
    const assinatura = assinaturasPorLoja.get(loja.id) ?? null;
    return {
      ...(loja as Loja),
      gerente: gerentesPorLoja.get(loja.id) ?? null,
      segmento: loja.segmento_id ? segmentosPorId.get(loja.segmento_id) ?? null : null,
      assinatura,
      planoAtual: assinatura ? planosPorId.get(assinatura.plano_id) ?? null : null,
    };
  });
}

export async function criarEmpresaEGerente(input: CriarEmpresaInput): Promise<{ sucesso: boolean }> {
  return callEdgeFunction("criar-loja-gerente", input);
}

export interface AtualizarEmpresaInput {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  cidade: string;
  estado: string;
  segmento_id: string;
}

export async function atualizarEmpresa(input: AtualizarEmpresaInput): Promise<void> {
  const { id, ...campos } = input;
  const { error } = await supabase
    .from("lojas")
    .update({ ...campos, segmento_id: campos.segmento_id || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function alterarStatusEmpresa(
  lojaId: string,
  status: StatusLoja,
  atorUsuarioId: string,
): Promise<void> {
  const { error } = await supabase.from("lojas").update({ status }).eq("id", lojaId);
  if (error) throw new Error(error.message);

  await registrarLog({
    ator_usuario_id: atorUsuarioId,
    loja_id: lojaId,
    acao: status === "suspensa" ? "empresa_suspensa" : status === "ativa" ? "empresa_reativada" : "empresa_cancelada",
    tipo_entidade: "loja",
    entidade_id: lojaId,
  });
}
