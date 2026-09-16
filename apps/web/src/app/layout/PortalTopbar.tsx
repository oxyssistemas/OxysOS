import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { tituloDaRota } from "../navegacao";

function diasRestantes(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function PortalTopbar({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const location = useLocation();
  const { subscription, currentUser } = useCompany();
  const titulo = tituloDaRota(location.pathname);

  const trialTerminaEm = subscription?.status === "trial" ? subscription.trial_termina_em : null;
  const trialDias = trialTerminaEm ? diasRestantes(trialTerminaEm) : null;

  const nome = currentUser?.nome ?? "";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-base px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-text-secondary hover:bg-white/5 md:hidden"
        >
          <Menu size={20} />
        </button>
        <p className="truncate font-display text-base font-semibold text-text-primary">{titulo}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {trialTerminaEm && trialDias !== null && (
          <span
            className="hidden rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 sm:inline"
            title={`Teste termina em ${new Date(trialTerminaEm).toLocaleDateString("pt-BR")}`}
          >
            Teste: {trialDias === 0 ? "termina hoje" : `${trialDias} ${trialDias === 1 ? "dia" : "dias"}`}
          </span>
        )}
        {subscription?.plano && (
          <span className="hidden rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary sm:inline">
            Plano {subscription.plano.nome}
          </span>
        )}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent"
          title={currentUser?.cargo ? `${nome} · ${currentUser.cargo.nome}` : nome}
          aria-label={`Usuário: ${nome}`}
        >
          {(nome || "U").charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
