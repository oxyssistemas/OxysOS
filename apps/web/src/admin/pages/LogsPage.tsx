import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import { listarLogs } from "../data/logsService";
import { listarEmpresasComRelacoes } from "../data/lojasService";
import type { LogAuditoria, LojaComRelacoes } from "../types";

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const LABEL_ACAO: Record<string, string> = {
  empresa_criada: "Empresa criada",
  empresa_suspensa: "Empresa suspensa",
  empresa_reativada: "Empresa reativada",
  empresa_cancelada: "Empresa cancelada",
  plano_alterado: "Plano alterado",
  assinatura_status_alterado: "Status da assinatura alterado",
  feature_liberada: "Funcionalidade liberada",
  feature_bloqueada: "Funcionalidade bloqueada",
};

export function LogsPage() {
  const { notificarErro } = useToast();
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [empresas, setEmpresas] = useState<LojaComRelacoes[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([listarLogs(200), listarEmpresasComRelacoes()])
      .then(([dadosLogs, dadosEmpresas]) => {
        setLogs(dadosLogs);
        setEmpresas(dadosEmpresas);
      })
      .catch((err) => notificarErro(err instanceof Error ? err.message : "Erro ao carregar logs."))
      .finally(() => setCarregando(false));
  }, []);

  function nomeEmpresa(id: string | null): string {
    if (!id) return "—";
    return empresas.find((e) => e.id === id)?.nome ?? "—";
  }

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Logs</h1>
        <p className="mt-1 text-sm text-text-secondary">Histórico de ações administrativas na plataforma.</p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Ação</th>
                <th className="px-5 py-3.5 font-medium">Empresa</th>
                <th className="px-5 py-3.5 font-medium">Detalhes</th>
                <th className="px-5 py-3.5 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={4} />}
              {!carregando &&
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 font-medium text-text-primary">
                      {LABEL_ACAO[log.acao] ?? log.acao}
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">{nomeEmpresa(log.loja_id)}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-text-muted">
                      {log.metadados ? JSON.stringify(log.metadados) : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">{formatarData(log.criado_em)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && logs.length === 0 && (
          <EmptyState
            icone={ScrollText}
            titulo="Nenhum log registrado ainda"
            descricao="Ações administrativas (criar empresa, suspender, alterar plano...) aparecerão aqui."
          />
        )}
      </div>
    </div>
  );
}
