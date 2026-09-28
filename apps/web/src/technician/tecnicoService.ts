import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { erroAmigavel } from "@/lib/erros";
import type { AnexoOS, CampoAtendimento, CamposAtendimento, ChecklistOS, LeituraRelatorio } from "@/app/ordens/tiposExecucao";
import { listarAnexos, listarChecklistsOS } from "@/app/ordens/execucaoService";
import { lerComCopia } from "./offline/estado";
import { sobreporChecklists, sobreporFinalizacao } from "./offline/fila";
import type {
  AtendimentoTecnico,
  CardAgendaTecnico,
  ContextoTecnico,
  EstadoCampo,
  FinalizacaoAtendimento,
  GrupoAgendaTecnico,
  HomeTecnico,
  HorasAtendimento,
  MotivoPausa,
  TipoApontamento,
} from "./tipos";

const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";

function erro(error: PostgrestError, padrao: string): Error {
  // as regras de horário do banco já voltam com texto pronto para o técnico
  if (["22023", "23P01"].includes(error.code) && /^[A-ZÀ-Ú][^\n]{5,200}\.$/.test(error.message)) {
    console.error("[portal-tecnico]", error);
    return new Error(error.message);
  }
  return erroAmigavel("portal-tecnico", error, {}, padrao);
}

/** Quem decide o portal de destino é o banco (papel, empresa, feature e permissão). */
export async function obterDestinoInicial(): Promise<"admin" | "app" | "technician" | "login"> {
  const { data, error } = await supabase.rpc("destino_inicial");
  if (error) {
    console.error("[portal-tecnico] destino inicial", error);
    return "app";
  }
  return (data as "admin" | "app" | "technician" | "login") ?? "app";
}

export async function obterContextoTecnico(): Promise<ContextoTecnico> {
  const { data, error } = await supabase.rpc("contexto_tecnico");
  if (error) throw erro(error, "Não foi possível carregar seu acesso ao portal.");
  return data as ContextoTecnico;
}

export function obterHomeTecnico(): Promise<HomeTecnico> {
  return lerComCopia("home", async () => {
    const { data, error } = await supabase.rpc("home_tecnico", { p_fuso: FUSO });
    if (error) throw erro(error, "Não foi possível carregar o seu dia.");
    return data as HomeTecnico;
  });
}

// ---------------------------------------------------------------------------
// Agenda e atendimento (etapa 8)
// ---------------------------------------------------------------------------

export function listarAgendaTecnico(grupo: GrupoAgendaTecnico): Promise<CardAgendaTecnico[]> {
  return lerComCopia(`agenda:${grupo}`, async () => {
    const { data, error } = await supabase.rpc("agenda_tecnico", { p_grupo: grupo, p_fuso: FUSO });
    if (error) throw erro(error, "Não foi possível carregar a sua agenda.");
    return (data ?? []) as CardAgendaTecnico[];
  });
}

export function obterAtendimento(agendamentoId: string): Promise<AtendimentoTecnico> {
  return lerComCopia(`atendimento:${agendamentoId}`, async () => {
    const { data, error } = await supabase.rpc("atendimento_tecnico", { p_agendamento_id: agendamentoId });
    if (error) throw erro(error, "Não foi possível abrir o atendimento.");
    return data as AtendimentoTecnico;
  });
}

/** O que está em andamento agora ou, na falta, o próximo da fila. */
export function obterAtendimentoAtual(): Promise<AtendimentoTecnico | null> {
  return lerComCopia("atendimento-atual", async () => {
    const { data, error } = await supabase.rpc("atendimento_atual_tecnico", { p_fuso: FUSO });
    if (error) throw erro(error, "Não foi possível carregar o atendimento.");
    return (data as AtendimentoTecnico | null) ?? null;
  });
}

/** Checklists da OS do atendimento, com as respostas feitas offline por cima. */
export function listarChecklistsCampo(osId: string): Promise<ChecklistOS[]> {
  return lerComCopia(`checklists:${osId}`, () => listarChecklistsOS(osId), (v) => sobreporChecklists(osId, v));
}

/** Fotos da OS (a lista; as imagens em si precisam de internet para abrir). */
export function listarFotosCampo(osId: string): Promise<AnexoOS[]> {
  return lerComCopia(`anexos:${osId}`, async () => (await listarAnexos(osId)).filter((a) => a.tipo === "foto"));
}

// ---------------------------------------------------------------------------
// Passos do atendimento em campo (etapa 9)
// ---------------------------------------------------------------------------

async function passo(rpc: string, args: Record<string, unknown>, padrao: string): Promise<EstadoCampo> {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw erro(error, padrao);
  return (data as { estado_campo: EstadoCampo }).estado_campo;
}

export const iniciarDeslocamento = (id: string) =>
  passo("iniciar_deslocamento", { p_agendamento_id: id }, "Não foi possível iniciar o deslocamento.");

export const registrarChegada = (id: string) =>
  passo("registrar_chegada", { p_agendamento_id: id }, "Não foi possível registrar a chegada.");

export const iniciarAtendimento = (id: string) =>
  passo("iniciar_atendimento_campo", { p_agendamento_id: id }, "Não foi possível iniciar o atendimento.");

export const pausarAtendimento = (id: string, motivo: MotivoPausa, observacao?: string) =>
  passo(
    "pausar_atendimento",
    { p_agendamento_id: id, p_motivo: motivo, p_observacao: observacao?.trim() || null },
    "Não foi possível pausar o atendimento.",
  );

export const retomarAtendimento = (id: string) =>
  passo("retomar_atendimento", { p_agendamento_id: id }, "Não foi possível retomar o atendimento.");

// ---------------------------------------------------------------------------
// Horas do atendimento (etapa 10)
// ---------------------------------------------------------------------------

export async function obterHorasAtendimento(agendamentoId: string): Promise<HorasAtendimento> {
  const { data, error } = await supabase.rpc("horas_atendimento", { p_agendamento_id: agendamentoId });
  if (error) throw erro(error, "Não foi possível carregar as horas do atendimento.");
  return data as HorasAtendimento;
}

export async function lancarHoraTecnico(input: {
  agendamentoId: string;
  tipo: TipoApontamento;
  inicio: string;
  fim: string;
  motivo: MotivoPausa | null;
  observacao: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("lancar_apontamento_tecnico", {
    p_agendamento_id: input.agendamentoId,
    p_tipo: input.tipo,
    p_inicio: input.inicio,
    p_fim: input.fim,
    p_motivo: input.tipo === "pausa" ? input.motivo : null,
    p_observacao: input.observacao || null,
  });
  if (error) throw erro(error, "Não foi possível lançar o tempo.");
  return data as string;
}

export async function ajustarHoraTecnico(input: {
  id: string;
  inicio: string;
  fim: string | null;
  motivo: MotivoPausa | null;
  observacao: string;
}): Promise<void> {
  const { error } = await supabase.rpc("ajustar_apontamento", {
    p_id: input.id,
    p_inicio: input.inicio,
    p_fim: input.fim,
    p_motivo: input.motivo,
    p_observacao: input.observacao || null,
  });
  if (error) throw erro(error, "Não foi possível corrigir o tempo.");
}

export async function excluirHoraTecnico(id: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_apontamento", { p_id: id });
  if (error) throw erro(error, "Não foi possível excluir o tempo.");
}

// ---------------------------------------------------------------------------
// Diagnóstico e finalização (etapa 15)
// ---------------------------------------------------------------------------

export function obterFinalizacaoAtendimento(agendamentoId: string): Promise<FinalizacaoAtendimento> {
  return lerComCopia(
    `finalizacao:${agendamentoId}`,
    async () => {
      const { data, error } = await supabase.rpc("finalizacao_atendimento", { p_agendamento_id: agendamentoId });
      if (error) throw erro(error, "Não foi possível carregar o resumo do atendimento.");
      return data as FinalizacaoAtendimento;
    },
    (v) => sobreporFinalizacao(agendamentoId, v),
  );
}

/** Só os campos enviados mudam; o banco confere o atendimento, o cargo e a OS aberta. */
export async function registrarAtendimentoCampo(
  agendamentoId: string,
  dados: Partial<Record<CampoAtendimento, string>>,
): Promise<CamposAtendimento> {
  const { data, error } = await supabase.rpc("registrar_atendimento_campo", {
    p_agendamento_id: agendamentoId,
    p_dados: dados,
  });
  if (error) throw erro(error, "Não foi possível salvar o registro do atendimento.");
  return data as CamposAtendimento;
}

/** Encerrando a OS, o banco valida os requisitos; sem encerrar, fecha só esta visita. */
export async function finalizarAtendimentoCampo(input: {
  agendamentoId: string;
  encerrarOs: boolean;
  observacao?: string;
}): Promise<{ encerrou_os: boolean }> {
  const { data, error } = await supabase.rpc("finalizar_atendimento_campo", {
    p_agendamento_id: input.agendamentoId,
    p_encerrar_os: input.encerrarOs,
    p_observacao: input.observacao?.trim() || null,
  });
  if (error) throw erro(error, "Não foi possível finalizar o atendimento.");
  return data as { encerrou_os: boolean };
}

export async function obterRelatorioAtendimento(agendamentoId: string): Promise<LeituraRelatorio> {
  const { data, error } = await supabase.rpc("relatorio_tecnico_atendimento", { p_agendamento_id: agendamentoId });
  if (error) throw erro(error, "Não foi possível carregar o relatório.");
  return data as LeituraRelatorio;
}
