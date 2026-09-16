export type PresetPeriodo = "hoje" | "7d" | "30d" | "mes" | "personalizado";

export interface Periodo {
  preset: PresetPeriodo;
  /** inclusive */
  inicio: Date;
  /** exclusivo */
  fim: Date;
}

export const PRESETS: { id: PresetPeriodo; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "personalizado", label: "Personalizado" },
];

/** Máximo aceito pelo servidor (dashboard_resumo). */
export const DIAS_MAXIMOS_PERIODO = 366;

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

/** Limites no fuso do navegador, do início do dia ao início do dia seguinte. */
export function periodoDoPreset(preset: Exclude<PresetPeriodo, "personalizado">, agora = new Date()): Periodo {
  const amanha = somarDias(inicioDoDia(agora), 1);
  switch (preset) {
    case "hoje":
      return { preset, inicio: inicioDoDia(agora), fim: amanha };
    case "7d":
      return { preset, inicio: somarDias(amanha, -7), fim: amanha };
    case "30d":
      return { preset, inicio: somarDias(amanha, -30), fim: amanha };
    case "mes":
      return { preset, inicio: new Date(agora.getFullYear(), agora.getMonth(), 1), fim: amanha };
  }
}

/** "AAAA-MM-DD" (valor de <input type="date">) → Date local à meia-noite. */
export function dataDeInput(valor: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  const data = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  return Number.isNaN(data.getTime()) ? null : data;
}

export function dataParaInput(data: Date): string {
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mm}-${dd}`;
}

/** Valida um intervalo personalizado (datas inclusivas). Retorna o período ou a mensagem de erro. */
export function periodoPersonalizado(de: string, ate: string): Periodo | string {
  const inicio = dataDeInput(de);
  const ultimoDia = dataDeInput(ate);
  if (!inicio || !ultimoDia) return "Informe as duas datas.";
  if (ultimoDia < inicio) return "A data final deve ser igual ou posterior à inicial.";
  const fim = somarDias(ultimoDia, 1);
  const dias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
  if (dias > DIAS_MAXIMOS_PERIODO) return "O período máximo é de 1 ano.";
  return { preset: "personalizado", inicio, fim };
}

export function fusoDoNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

export function descreverPeriodo(periodo: Periodo): string {
  const formato = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const ultimoDia = somarDias(periodo.fim, -1);
  if (ultimoDia.getTime() === periodo.inicio.getTime()) return formato.format(periodo.inicio);
  return `${formato.format(periodo.inicio)} – ${formato.format(ultimoDia)}`;
}
