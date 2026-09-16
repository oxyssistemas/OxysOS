import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import { listarEmpresasComRelacoes } from "../data/lojasService";
import type { LojaComRelacoes, StatusAssinatura } from "../types";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

const LABEL_STATUS: Record<StatusAssinatura, string> = {
  trial: "Trial",
  active: "Ativa",
  past_due: "Pagamento atrasado",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

const COR_STATUS: Record<StatusAssinatura, string> = {
  trial: "#378ADD",
  active: "#639922",
  past_due: "#EF9F27",
  suspended: "#EF9F27",
  cancelled: "#E24B4A",
};

export function AssinaturasPage() {
  const { notificarErro } = useToast();
  const [empresas, setEmpresas] = useState<LojaComRelacoes[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    listarEmpresasComRelacoes()
      .then(setEmpresas)
      .catch((err) => notificarErro(err instanceof Error ? err.message : "Erro ao carregar assinaturas."))
      .finally(() => setCarregando(false));
  }, []);

  const comAssinatura = empresas.filter((e) => e.assinatura);

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Assinaturas</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Situação de cobrança de cada empresa. Para alterar plano ou status, acesse a empresa em "Empresas".
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Empresa</th>
                <th className="px-5 py-3.5 font-medium">Plano</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Ciclo</th>
                <th className="px-5 py-3.5 font-medium">Trial termina em</th>
                <th className="px-5 py-3.5 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={6} />}
              {!carregando &&
                comAssinatura.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-medium text-text-primary">{e.nome}</td>
                    <td className="px-5 py-4 text-text-secondary">{e.planoAtual?.nome ?? "—"}</td>
                    <td className="px-5 py-4">
                      {e.assinatura && (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${COR_STATUS[e.assinatura.status]}22`,
                            color: COR_STATUS[e.assinatura.status],
                          }}
                        >
                          {LABEL_STATUS[e.assinatura.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-text-secondary capitalize">{e.assinatura?.ciclo_cobranca}</td>
                    <td className="px-5 py-4 text-text-secondary">
                      {e.assinatura?.status === "trial" ? formatarData(e.assinatura.trial_termina_em) : "—"}
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {e.planoAtual
                        ? formatarMoeda(
                            e.assinatura?.ciclo_cobranca === "anual"
                              ? e.planoAtual.preco_anual
                              : e.planoAtual.preco_mensal,
                          )
                        : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && comAssinatura.length === 0 && (
          <EmptyState
            icone={CreditCard}
            titulo="Nenhuma assinatura ainda"
            descricao="As assinaturas aparecem aqui assim que uma empresa é criada com um plano."
          />
        )}
      </div>
    </div>
  );
}
