import { supabase, callEdgeFunction } from "@oxys/shared/supabase";
import type { Gerente, Loja } from "../types";

export interface GerenteComLoja extends Gerente {
  loja: Loja | null;
}

export async function listarGerentesComLoja(): Promise<GerenteComLoja[]> {
  const { data: gerentes, error: gerentesError } = await supabase
    .from("usuarios")
    .select("*")
    .eq("papel", "gerente")
    .order("criado_em", { ascending: false });

  if (gerentesError) throw new Error(gerentesError.message);

  const { data: lojas, error: lojasError } = await supabase.from("lojas").select("*");
  if (lojasError) throw new Error(lojasError.message);

  const lojasPorId = new Map<string, Loja>();
  for (const l of lojas ?? []) lojasPorId.set(l.id, l as Loja);

  return (gerentes ?? []).map((g) => ({
    ...(g as Gerente),
    loja: lojasPorId.get(g.loja_id) ?? null,
  }));
}

export interface CriarGerenteInput {
  loja_id: string;
  nome_gerente: string;
  email_gerente: string;
  senha_gerente: string;
}

export async function criarGerente(input: CriarGerenteInput): Promise<{ sucesso: boolean }> {
  return callEdgeFunction("criar-gerente", input);
}

export interface AtualizarGerenteInput {
  gerente_id: string;
  nome: string;
  email: string;
  loja_id: string;
}

export async function atualizarGerente(input: AtualizarGerenteInput): Promise<void> {
  await callEdgeFunction("atualizar-gerente", input);
}

export async function listarLojasParaSelecao(): Promise<Loja[]> {
  const { data, error } = await supabase.from("lojas").select("*").order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []) as Loja[];
}
