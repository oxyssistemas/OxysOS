import { AlertTriangle, ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import type { NivelPrioridade } from "../tipos";

/** Marcador de cor; sempre acompanhado de texto (a cor nunca é a única informação). */
export function MarcadorCor({ cor, tamanho = "sm" }: { cor: string; tamanho?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${tamanho === "md" ? "h-3 w-3" : "h-2.5 w-2.5"}`}
      style={{ backgroundColor: cor }}
    />
  );
}

export function StatusOSBadge({ nome, cor }: { nome: string; cor: string | null }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white/[0.03] px-2.5 py-0.5 text-xs font-medium text-text-primary">
      <MarcadorCor cor={cor ?? "#888780"} />
      <span className="truncate">{nome}</span>
    </span>
  );
}

const ICONE_NIVEL: Record<NivelPrioridade, LucideIcon> = {
  baixa: ArrowDown,
  normal: Minus,
  alta: ArrowUp,
  urgente: AlertTriangle,
};

export function PrioridadeBadge({ nome, cor, nivel }: { nome: string; cor: string; nivel: NivelPrioridade }) {
  const Icone = ICONE_NIVEL[nivel];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white/[0.03] px-2.5 py-0.5 text-xs font-medium text-text-primary">
      <Icone size={12} aria-hidden="true" style={{ color: cor }} />
      {nome}
    </span>
  );
}

export function Selo({ children, tom = "neutro" }: { children: string; tom?: "neutro" | "destaque" | "apagado" }) {
  const classes = {
    neutro: "border-border text-text-secondary",
    destaque: "border-accent/30 bg-accent-muted text-accent",
    apagado: "border-border text-text-muted",
  }[tom];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${classes}`}>{children}</span>;
}
