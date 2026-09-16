import { supabase } from "@oxys/shared/supabase";
import { enviarFotoOS } from "../lib/storage";
import type { ItemOSFormulario } from "../types";

export interface CriarOSInput {
  loja_id: string;
  usuario_id: string;
  cliente_id: string;
  status_id: string;
  responsavel_id: string | null;
  codigo_aparelho: string;
  objeto_atendimento: string;
  descricao: string;
  desconto: number;
  itens: ItemOSFormulario[];
  fotos: File[];
}

export async function criarOrdemServico(input: CriarOSInput): Promise<{ id: string }> {
  const subtotal = input.itens.reduce((soma, item) => soma + item.quantidade * item.valor_unitario, 0);
  const valorTotal = Math.max(subtotal - input.desconto, 0);

  const { data: os, error: osError } = await supabase
    .from("ordens_servico")
    .insert({
      loja_id: input.loja_id,
      cliente_id: input.cliente_id,
      status_id: input.status_id,
      responsavel_id: input.responsavel_id,
      criado_por: input.usuario_id,
      codigo_aparelho: input.codigo_aparelho,
      objeto_atendimento: input.objeto_atendimento || null,
      descricao: input.descricao,
      valor_total: valorTotal,
    })
    .select("id")
    .single();

  if (osError || !os) {
    throw new Error(osError?.message || "Erro ao criar a ordem de serviço.");
  }

  if (input.itens.length > 0) {
    const { error: itensError } = await supabase.from("os_itens").insert(
      input.itens.map((item) => ({
        os_id: os.id,
        tipo: item.tipo,
        descricao: item.descricao,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
      })),
    );
    if (itensError) throw new Error(itensError.message);
  }

  await supabase.from("os_historico").insert({
    os_id: os.id,
    usuario_id: input.usuario_id,
    status_anterior_id: null,
    status_novo_id: input.status_id,
  });

  await supabase.from("log_eventos").insert({
    loja_id: input.loja_id,
    usuario_id: input.usuario_id,
    acao: "os_criada",
    detalhes: { os_id: os.id, valor_total: valorTotal, codigo_aparelho: input.codigo_aparelho },
  });

  for (const arquivo of input.fotos) {
    const caminho = await enviarFotoOS(input.loja_id, os.id as string, arquivo);
    await supabase.from("os_fotos").insert({
      os_id: os.id,
      usuario_id: input.usuario_id,
      tipo: "antes",
      caminho,
    });
  }

  return { id: os.id as string };
}
