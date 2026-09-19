import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type {
  Cliente,
  EnderecoOS,
  OrdemServico,
  OSItem,
  StatusOS,
  UsuarioResponsavel,
} from "../types";
import type { PrioridadeOS, TipoServico } from "../../configuracoes/tipos";

export interface OrdemComRelacoes extends OrdemServico {
  endereco: (EnderecoOS & { rotulo: string }) | null;
  cliente: Cliente | null;
  status: StatusOS | null;
  responsavel: UsuarioResponsavel | null;
  criador: UsuarioResponsavel | null;
  prioridade: PrioridadeOS | null;
  tipo_servico: Pick<TipoServico, "id" | "nome"> | null;
}

export async function listarOrdens(lojaId: string): Promise<OrdemComRelacoes[]> {
  const [
    { data: ordens, error: ordensError },
    { data: clientes },
    { data: status },
    { data: usuarios },
    { data: prioridades },
    { data: tipos },
  ] = await Promise.all([
      supabase
        .from("ordens_servico")
        .select(
          "*, endereco:cliente_enderecos!ordens_servico_endereco_do_cliente_fkey(rotulo, logradouro, numero, complemento, bairro, cidade, estado)",
        )
        .eq("loja_id", lojaId)
        .order("criado_em", { ascending: false }),
      supabase.from("clientes").select("*").eq("loja_id", lojaId),
      supabase.from("status_os").select("*").eq("loja_id", lojaId),
      supabase.from("usuarios").select("id, nome, papel").eq("loja_id", lojaId),
      supabase.from("prioridades_os").select("id, chave, nome, nivel, cor, ordem, padrao, ativo, sla_horas").eq("loja_id", lojaId),
      supabase.from("tipos_servico").select("id, nome").eq("loja_id", lojaId),
    ]);

  if (ordensError) throw new Error(ordensError.message);

  const clientesPorId = new Map<string, Cliente>((clientes ?? []).map((c) => [c.id, c as Cliente]));
  const statusPorId = new Map<string, StatusOS>((status ?? []).map((s) => [s.id, s as StatusOS]));
  const prioridadesPorId = new Map<string, PrioridadeOS>((prioridades ?? []).map((p) => [p.id, p as PrioridadeOS]));
  const tiposPorId = new Map<string, Pick<TipoServico, "id" | "nome">>((tipos ?? []).map((t) => [t.id, t]));
  const usuariosPorId = new Map<string, UsuarioResponsavel>(
    (usuarios ?? []).map((u) => [u.id, u as UsuarioResponsavel]),
  );

  return (ordens ?? []).map((os) => ({
    ...(os as unknown as OrdemServico & { endereco: OrdemComRelacoes["endereco"] }),
    cliente: clientesPorId.get(os.cliente_id) ?? null,
    status: statusPorId.get(os.status_id) ?? null,
    responsavel: os.responsavel_id ? usuariosPorId.get(os.responsavel_id) ?? null : null,
    criador: os.criado_por ? usuariosPorId.get(os.criado_por) ?? null : null,
    prioridade: prioridadesPorId.get(os.prioridade_id) ?? null,
    tipo_servico: os.tipo_servico_id ? tiposPorId.get(os.tipo_servico_id) ?? null : null,
  }));
}

export async function listarItensDaOS(osId: string): Promise<OSItem[]> {
  const { data, error } = await supabase.from("os_itens").select("*").eq("os_id", osId);
  if (error) throw new Error(error.message);
  return (data ?? []) as OSItem[];
}

/** Troca de status pelo banco: permissão por categoria, histórico e evento gravados na mesma transação. */
export async function atualizarStatusOS(input: { os_id: string; status_novo_id: string }): Promise<void> {
  const { error } = await supabase.rpc("alterar_status_os", {
    p_os_id: input.os_id,
    p_status_id: input.status_novo_id,
  });
  if (error) throw erroAmigavel("os", error, {}, "Não foi possível alterar o status.");
}

/** Finaliza pela troca de status (o banco grava histórico e eventos). */
export async function concluirOS(input: { os_id: string; status_concluido_id: string }): Promise<void> {
  await atualizarStatusOS({ os_id: input.os_id, status_novo_id: input.status_concluido_id });
}
