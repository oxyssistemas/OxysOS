import { WifiOff } from "lucide-react";
import { useSincronizacao } from "./SincronizacaoContext";

/** Para o que usa o relógio do servidor ou precisa da resposta dele na hora. */
export function AvisoSemInternet({ acao }: { acao: string }) {
  const { online } = useSincronizacao();
  if (online) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
      <WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      Sem internet: {acao} precisa de conexão. Checklist, fotos e diagnóstico continuam funcionando e sobem depois.
    </p>
  );
}
