import { AlertTriangle, CheckCircle2, Clock, Timer, type LucideIcon } from "lucide-react";
import { ROTULO_SLA, formatarDataHora, type SituacaoSla } from "../tipos";

const ESTILO_SLA: Record<SituacaoSla, { icone: LucideIcon; classe: string }> = {
  sem_prazo: { icone: Clock, classe: "border-border text-text-muted" },
  no_prazo: { icone: Timer, classe: "border-border text-text-secondary" },
  vencendo: { icone: Timer, classe: "border-[#EF9F27]/40 bg-[#EF9F27]/10 text-[#EF9F27]" },
  atrasada: { icone: AlertTriangle, classe: "border-danger/40 bg-danger/10 text-danger" },
  cumprido: { icone: CheckCircle2, classe: "border-success/30 text-success" },
  cumprido_atraso: { icone: AlertTriangle, classe: "border-border text-text-secondary" },
  cancelada: { icone: Clock, classe: "border-border text-text-muted" },
};

/** Situação do prazo com ícone e texto (nunca só cor). */
export function SlaBadge({ sla, prazo, compacto }: { sla: SituacaoSla; prazo: string | null; compacto?: boolean }) {
  const { icone: Icone, classe } = ESTILO_SLA[sla];
  const titulo = prazo ? `Prazo: ${formatarDataHora(prazo)}` : undefined;
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}
    >
      <Icone size={12} aria-hidden="true" />
      {ROTULO_SLA[sla]}
      {!compacto && prazo && sla !== "sem_prazo" && sla !== "cancelada" && (
        <span className="font-normal opacity-80">· {formatarDataHora(prazo)}</span>
      )}
    </span>
  );
}
