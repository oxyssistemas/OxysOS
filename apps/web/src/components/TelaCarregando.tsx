import { Loader2 } from "lucide-react";

export function TelaCarregando() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base" role="status">
      <Loader2 size={24} className="animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
