import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type { PainelDespacho, SugestaoTecnico } from "./tipos";

const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

function erro(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("despacho", error, {}, padrao);
}

/** dia em yyyy-MM-dd (local); null = hoje no fuso do navegador */
export async function carregarDespacho(dia: string | null): Promise<PainelDespacho> {
  const { data, error } = await supabase.rpc("painel_despacho", { p_dia: dia, p_fuso: FUSO });
  if (error) throw erro(error, "Não foi possível carregar a central de despacho.");
  return data as PainelDespacho;
}

export async function sugerirTecnicos(osId: string, inicio: Date, fim: Date): Promise<SugestaoTecnico[]> {
  const { data, error } = await supabase.rpc("sugerir_tecnicos", {
    p_os_id: osId,
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
    p_fuso: FUSO,
  });
  if (error) throw erro(error, "Não foi possível sugerir técnicos.");
  return (data ?? []) as SugestaoTecnico[];
}

export async function atribuirOs(osId: string, tecnico?: string, equipe?: string): Promise<void> {
  const { error } = await supabase.rpc("atribuir_os", {
    p_os_id: osId,
    p_tecnico: tecnico || null,
    p_equipe: equipe || null,
  });
  if (error) throw erro(error, "Não foi possível distribuir a ordem de serviço.");
}
