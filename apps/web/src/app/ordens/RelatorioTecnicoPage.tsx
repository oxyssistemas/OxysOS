import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Printer } from "lucide-react";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { obterRelatorioTecnico } from "./execucaoService";
import { formatarDataHora } from "./tipos";
import type { LeituraRelatorio } from "./tiposExecucao";
import { RelatorioTecnicoDocumento } from "./components/RelatorioTecnicoDocumento";

/** Relatório técnico da OS (§41): versão congelada na finalização, ou prévia com a OS aberta. */
export function RelatorioTecnicoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [versao, setVersao] = useState<number | null>(null);
  const [leitura, setLeitura] = useState<LeituraRelatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setLeitura(await obterRelatorioTecnico(id, versao));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o relatório.");
    }
  }, [id, versao]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (erro) return <TelaAviso icone={AlertTriangle} tom="perigo" titulo="Relatório indisponível" descricao={erro} />;
  if (!leitura) return <TelaCarregando />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/app/service-orders/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} aria-hidden="true" /> Voltar à OS
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {leitura.versoes.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <span>Versão</span>
              <select
                value={versao ?? ""}
                onChange={(e) => setVersao(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary"
              >
                <option value="">{leitura.encerrada ? "Atual" : "Prévia (dados atuais)"}</option>
                {leitura.versoes.map((v) => (
                  <option key={v.versao} value={v.versao}>
                    Versão {v.versao} · {formatarDataHora(v.gerado_em)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Printer size={16} aria-hidden="true" /> Imprimir ou salvar PDF
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg border border-border bg-panel px-4 py-3 text-sm text-text-secondary">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        {leitura.origem === "finalizacao"
          ? `Versão ${leitura.versao}, congelada na finalização em ${leitura.gerado_em ? formatarDataHora(leitura.gerado_em) : "—"}${
              leitura.gerado_por ? ` por ${leitura.gerado_por}` : ""
            }. Alterações feitas depois na OS não mudam esta versão.`
          : "Prévia: a OS ainda não foi finalizada, então o relatório mostra os dados de agora. Ao finalizar, uma versão é congelada."}
      </p>

      <RelatorioTecnicoDocumento leitura={leitura} />
    </div>
  );
}
