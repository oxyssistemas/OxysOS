import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import { fusoDoNavegador, type Periodo } from "../dashboard/periodo";
import type { FiltrosRelatorio, Relatorio } from "./tipos";

export async function obterRelatorio(periodo: Periodo, filtros: FiltrosRelatorio): Promise<Relatorio> {
  const { data, error } = await supabase.rpc("relatorio_os", {
    p_inicio: periodo.inicio.toISOString(),
    p_fim: periodo.fim.toISOString(),
    p_fuso: fusoDoNavegador(),
    p_tecnico: filtros.tecnicoId || null,
    p_tipo: filtros.tipoId || null,
  });
  if (error) {
    if (["42501", "22023", "P0002"].includes(error.code) && /^[A-ZÀ-Ú][^\n]{5,200}\.$/.test(error.message)) {
      console.error("[relatorios]", error);
      throw new Error(error.message);
    }
    throw erroAmigavel("relatorios", error, {}, "Não foi possível carregar o relatório.");
  }
  return data as Relatorio;
}

/** CSV com ponto e vírgula e BOM: abre direto no Excel em pt-BR. */
export function montarCsv(linhas: (string | number | null)[][]): string {
  const celula = (valor: string | number | null) => {
    const texto = valor === null ? "" : String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  return `﻿${linhas.map((linha) => linha.map(celula).join(";")).join("\r\n")}`;
}

export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
