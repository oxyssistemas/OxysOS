import { Archive, CheckCircle2, ShieldAlert, ShieldCheck, ShieldOff, Wrench, XCircle } from "lucide-react";
import {
  ROTULO_STATUS_EQUIPAMENTO,
  formatarDataCurta,
  situacaoGarantia,
  type StatusEquipamento,
} from "../tipos";

/** Situação com ícone + texto (nunca só cor). */
export function StatusEquipamentoBadge({ status, arquivado }: { status: StatusEquipamento; arquivado?: boolean }) {
  if (arquivado) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
        <Archive size={12} aria-hidden="true" /> Arquivado
      </span>
    );
  }
  const estilos: Record<StatusEquipamento, { classe: string; icone: typeof CheckCircle2 }> = {
    operacional: { classe: "border-success/30 bg-success/10 text-success", icone: CheckCircle2 },
    em_manutencao: { classe: "border-amber-400/30 bg-amber-400/10 text-amber-300", icone: Wrench },
    fora_de_operacao: { classe: "border-danger/30 bg-danger/10 text-danger", icone: XCircle },
  };
  const { classe, icone: Icone } = estilos[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}>
      <Icone size={12} aria-hidden="true" /> {ROTULO_STATUS_EQUIPAMENTO[status]}
    </span>
  );
}

export function GarantiaInfo({ garantiaAte, compacto }: { garantiaAte: string | null; compacto?: boolean }) {
  const { situacao, dias } = situacaoGarantia(garantiaAte);
  if (situacao === "sem") {
    return <span className="text-text-muted">{compacto ? "—" : "Sem garantia registrada"}</span>;
  }
  const data = formatarDataCurta(garantiaAte);
  if (situacao === "vencida") {
    return (
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        <ShieldOff size={14} aria-hidden="true" /> Vencida em {data}
      </span>
    );
  }
  if (situacao === "vencendo") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-300">
        <ShieldAlert size={14} aria-hidden="true" />
        {dias === 0 ? "Vence hoje" : `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`}
        {!compacto && <span className="text-text-muted"> ({data})</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-success">
      <ShieldCheck size={14} aria-hidden="true" /> {compacto ? `Até ${data}` : `Vigente até ${data}`}
    </span>
  );
}
