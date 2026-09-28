import { Link } from "react-router-dom";
import { AlertTriangle, CloudUpload, Loader2 } from "lucide-react";
import { useSincronizacao } from "./SincronizacaoContext";

/** Discreto quando está tudo bem; aparece de verdade quando há algo esperando (§49). */
export function IndicadorConexao() {
  const { online, pendentes, conflitos, erros, sincronizando, ativo } = useSincronizacao();
  const problemas = conflitos + erros;

  return (
    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pb-2 text-[11px]">
      <span className="flex items-center gap-1.5 text-text-muted" role="status">
        <span className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-amber-400"}`} aria-hidden="true" />
        {online ? "Online" : ativo ? "Offline — trabalhando com a cópia do aparelho" : "Offline"}
      </span>
      {(pendentes > 0 || problemas > 0 || sincronizando) && (
        <Link to="/technician/sync" className="flex items-center gap-1.5 font-medium text-text-secondary">
          {problemas > 0 ? (
            <>
              <AlertTriangle size={12} className="text-amber-300" aria-hidden="true" />
              {problemas === 1 ? "1 alteração precisa de atenção" : `${problemas} alterações precisam de atenção`}
            </>
          ) : sincronizando ? (
            <>
              <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Sincronizando…
            </>
          ) : (
            <>
              <CloudUpload size={12} aria-hidden="true" />
              {pendentes === 1 ? "1 alteração aguardando sincronização" : `${pendentes} alterações aguardando sincronização`}
            </>
          )}
        </Link>
      )}
    </div>
  );
}
