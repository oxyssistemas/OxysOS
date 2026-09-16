import { Archive, CheckCircle2 } from "lucide-react";
import type { TipoPessoa } from "../tipos";

/** Status com ícone + texto (nunca só cor). */
export function StatusCliente({ arquivado }: { arquivado: boolean }) {
  return arquivado ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
      <Archive size={12} aria-hidden="true" />
      Arquivado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      <CheckCircle2 size={12} aria-hidden="true" />
      Ativo
    </span>
  );
}

export function TipoClienteBadge({ tipo }: { tipo: TipoPessoa }) {
  return (
    <span
      className="inline-flex rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
      title={tipo === "pf" ? "Pessoa física" : "Pessoa jurídica"}
    >
      {tipo === "pf" ? "PF" : "PJ"}
      <span className="sr-only">{tipo === "pf" ? " – Pessoa física" : " – Pessoa jurídica"}</span>
    </span>
  );
}
