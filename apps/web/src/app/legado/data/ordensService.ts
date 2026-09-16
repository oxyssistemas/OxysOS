import { supabase } from "@oxys/shared/supabase";
import { enviarFotoOS } from "../lib/storage";
import type {
  Cliente,
  OrdemServico,
  OSFoto,
  OSHistoricoEntry,
  OSItem,
  OSObservacao,
  StatusOS,
  TipoFotoOS,
  UsuarioResponsavel,
} from "../types";

export interface OrdemComRelacoes extends OrdemServico {
  cliente: Cliente | null;
  status: StatusOS | null;
  responsavel: UsuarioResponsavel | null;
  criador: UsuarioResponsavel | null;
}

export async function listarOrdens(lojaId: string): Promise<OrdemComRelacoes[]> {
  const [{ data: ordens, error: ordensError }, { data: clientes }, { data: status }, { data: usuarios }] =
    await Promise.all([
      supabase
        .from("ordens_servico")
        .select("*")
        .eq("loja_id", lojaId)
        .order("criado_em", { ascending: false }),
      supabase.from("clientes").select("*").eq("loja_id", lojaId),
      supabase.from("status_os").select("*").eq("loja_id", lojaId),
      supabase.from("usuarios").select("id, nome, papel").eq("loja_id", lojaId),
    ]);

  if (ordensError) throw new Error(ordensError.message);

  const clientesPorId = new Map<string, Cliente>((clientes ?? []).map((c) => [c.id, c as Cliente]));
  const statusPorId = new Map<string, StatusOS>((status ?? []).map((s) => [s.id, s as StatusOS]));
  const usuariosPorId = new Map<string, UsuarioResponsavel>(
    (usuarios ?? []).map((u) => [u.id, u as UsuarioResponsavel]),
  );

  return (ordens ?? []).map((os) => ({
    ...(os as OrdemServico),
    cliente: clientesPorId.get(os.cliente_id) ?? null,
    status: statusPorId.get(os.status_id) ?? null,
    responsavel: os.responsavel_id ? usuariosPorId.get(os.responsavel_id) ?? null : null,
    criador: os.criado_por ? usuariosPorId.get(os.criado_por) ?? null : null,
  }));
}

export async function listarItensDaOS(osId: string): Promise<OSItem[]> {
  const { data, error } = await supabase.from("os_itens").select("*").eq("os_id", osId);
  if (error) throw new Error(error.message);
  return (data ?? []) as OSItem[];
}

export async function listarHistoricoDaOS(osId: string): Promise<OSHistoricoEntry[]> {
  const { data, error } = await supabase
    .from("os_historico")
    .select("*")
    .eq("os_id", osId)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OSHistoricoEntry[];
}

export async function atualizarStatusOS(input: {
  os_id: string;
  loja_id: string;
  usuario_id: string;
  status_anterior_id: string | null;
  status_novo_id: string;
}): Promise<void> {
  const { error: updateError } = await supabase
    .from("ordens_servico")
    .update({ status_id: input.status_novo_id, atualizado_em: new Date().toISOString() })
    .eq("id", input.os_id);
  if (updateError) throw new Error(updateError.message);

  await supabase.from("os_historico").insert({
    os_id: input.os_id,
    usuario_id: input.usuario_id,
    status_anterior_id: input.status_anterior_id,
    status_novo_id: input.status_novo_id,
  });

  await supabase.from("log_eventos").insert({
    loja_id: input.loja_id,
    usuario_id: input.usuario_id,
    acao: "os_status_alterado",
    detalhes: { os_id: input.os_id, de: input.status_anterior_id, para: input.status_novo_id },
  });
}

export async function iniciarReparo(input: {
  os_id: string;
  loja_id: string;
  usuario_id: string;
  status_anterior_id: string | null;
  status_em_andamento_id: string;
}): Promise<void> {
  await atualizarStatusOS({
    os_id: input.os_id,
    loja_id: input.loja_id,
    usuario_id: input.usuario_id,
    status_anterior_id: input.status_anterior_id,
    status_novo_id: input.status_em_andamento_id,
  });

  const { error } = await supabase
    .from("ordens_servico")
    .update({ iniciado_em: new Date().toISOString() })
    .eq("id", input.os_id);
  if (error) throw new Error(error.message);

  await supabase.from("log_eventos").insert({
    loja_id: input.loja_id,
    usuario_id: input.usuario_id,
    acao: "os_reparo_iniciado",
    detalhes: { os_id: input.os_id },
  });
}

export async function concluirOS(input: {
  os_id: string;
  loja_id: string;
  usuario_id: string;
  status_anterior_id: string | null;
  status_concluido_id: string;
}): Promise<void> {
  await atualizarStatusOS({
    os_id: input.os_id,
    loja_id: input.loja_id,
    usuario_id: input.usuario_id,
    status_anterior_id: input.status_anterior_id,
    status_novo_id: input.status_concluido_id,
  });

  await supabase.from("log_eventos").insert({
    loja_id: input.loja_id,
    usuario_id: input.usuario_id,
    acao: "os_concluida",
    detalhes: { os_id: input.os_id },
  });
}

export async function listarFotos(osId: string): Promise<OSFoto[]> {
  const { data, error } = await supabase
    .from("os_fotos")
    .select("*")
    .eq("os_id", osId)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as OSFoto[];
}

export async function adicionarFoto(input: {
  loja_id: string;
  os_id: string;
  usuario_id: string;
  tipo: TipoFotoOS;
  arquivo: File;
  observacao?: string;
}): Promise<void> {
  const caminho = await enviarFotoOS(input.loja_id, input.os_id, input.arquivo);
  const { error } = await supabase.from("os_fotos").insert({
    os_id: input.os_id,
    usuario_id: input.usuario_id,
    tipo: input.tipo,
    caminho,
    observacao: input.observacao || null,
  });
  if (error) throw new Error(error.message);
}

export async function listarObservacoes(osId: string): Promise<OSObservacao[]> {
  const { data, error } = await supabase
    .from("os_observacoes")
    .select("*")
    .eq("os_id", osId)
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OSObservacao[];
}

export async function adicionarObservacao(input: {
  os_id: string;
  usuario_id: string;
  texto: string;
}): Promise<void> {
  const { error } = await supabase.from("os_observacoes").insert({
    os_id: input.os_id,
    usuario_id: input.usuario_id,
    texto: input.texto,
  });
  if (error) throw new Error(error.message);
}
