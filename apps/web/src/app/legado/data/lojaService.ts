import { supabase } from "@oxys/shared/supabase";

export interface LojaInfo {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
}

export async function obterLoja(lojaId: string): Promise<LojaInfo> {
  const { data, error } = await supabase
    .from("lojas")
    .select("id, nome, cnpj, telefone, cidade, estado")
    .eq("id", lojaId)
    .single();
  if (error) throw new Error(error.message);
  return data as LojaInfo;
}
