import { supabase } from "@oxys/shared/supabase";
import type { StatusOS } from "../types";

export async function listarStatusOS(lojaId: string): Promise<StatusOS[]> {
  const { data, error } = await supabase
    .from("status_os")
    .select("*")
    .eq("loja_id", lojaId)
    .order("ordem");
  if (error) throw new Error(error.message);
  return (data ?? []) as StatusOS[];
}
