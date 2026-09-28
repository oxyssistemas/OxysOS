import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { TelaCarregando } from "@/components/TelaCarregando";
import { RelatorioTecnicoDocumento } from "@/app/ordens/components/RelatorioTecnicoDocumento";
import type { LeituraRelatorio } from "@/app/ordens/tiposExecucao";
import { obterRelatorioAtendimento } from "../tecnicoService";

/** Relatório técnico da OS do atendimento — para mostrar ou enviar ao cliente ao terminar. */
export function RelatorioAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [leitura, setLeitura] = useState<LeituraRelatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setLeitura(await obterRelatorioAtendimento(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o relatório.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!leitura && !erro) return <TelaCarregando />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
          <ArrowLeft size={15} aria-hidden="true" /> Atendimento
        </Link>
        {leitura && (
          <button
            onClick={() => window.print()}
            className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary"
          >
            <Printer size={15} aria-hidden="true" /> Imprimir / PDF
          </button>
        )}
      </div>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {leitura && (
        <>
          {leitura.origem === "previa" && (
            <p className="rounded-xl border border-border bg-panel px-4 py-3 text-xs text-text-secondary">
              Prévia com os dados de agora. A versão final é gerada quando a OS é finalizada.
            </p>
          )}
          <RelatorioTecnicoDocumento leitura={leitura} />
        </>
      )}
    </div>
  );
}
