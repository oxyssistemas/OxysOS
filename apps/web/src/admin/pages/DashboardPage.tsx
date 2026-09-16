import { useEffect, useMemo, useState } from "react";
import { Building2, CreditCard, Loader2, Users } from "lucide-react";
import { listarEmpresasComRelacoes } from "../data/lojasService";
import { listarPlanos } from "../data/planosService";
import type { LojaComRelacoes, Plano } from "../types";
import { supabase } from "@oxys/shared/supabase";

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatCard({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold text-text-primary">{valor}</p>
    </div>
  );
}

function BarraProporcional({ itens }: { itens: { label: string; valor: number; cor?: string }[] }) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (total === 0) {
    return <p className="text-xs text-text-muted">Sem dados ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {itens.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-text-secondary">{item.label}</span>
            <span className="text-text-muted">{item.valor}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.valor / total) * 100}%`, backgroundColor: item.cor ?? "#1565FF" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [empresas, setEmpresas] = useState<LojaComRelacoes[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [totalGerentes, setTotalGerentes] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const [dadosEmpresas, dadosPlanos, contagemGerentes] = await Promise.all([
        listarEmpresasComRelacoes(),
        listarPlanos(),
        supabase.from("usuarios").select("id", { count: "exact", head: true }).eq("papel", "gerente"),
      ]);
      setEmpresas(dadosEmpresas);
      setPlanos(dadosPlanos);
      setTotalGerentes(contagemGerentes.count ?? 0);
      setCarregando(false);
    }
    carregar();
  }, []);

  const stats = useMemo(() => {
    const total = empresas.length;
    const ativas = empresas.filter((e) => e.status === "ativa").length;
    const suspensas = empresas.filter((e) => e.status === "suspensa").length;
    const emTrial = empresas.filter((e) => e.assinatura?.status === "trial").length;
    const assinaturasAtivas = empresas.filter((e) => e.assinatura?.status === "active").length;

    const mrr = empresas.reduce((soma, e) => {
      if (e.assinatura?.status !== "active" || !e.planoAtual) return soma;
      const valorMensal =
        e.assinatura.ciclo_cobranca === "anual" ? e.planoAtual.preco_anual / 12 : e.planoAtual.preco_mensal;
      return soma + valorMensal;
    }, 0);

    return { total, ativas, suspensas, emTrial, assinaturasAtivas, mrr };
  }, [empresas]);

  const porSegmento = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const e of empresas) {
      const nome = e.segmento?.nome ?? "Sem segmento";
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    }
    return Array.from(contagem.entries()).map(([label, valor]) => ({ label, valor }));
  }, [empresas]);

  const porPlano = useMemo(() => {
    return planos.map((plano) => ({
      label: plano.nome,
      valor: empresas.filter((e) => e.planoAtual?.id === plano.id).length,
    }));
  }, [empresas, planos]);

  const porStatusAssinatura = useMemo(() => {
    const cores: Record<string, string> = {
      trial: "#378ADD",
      active: "#639922",
      past_due: "#EF9F27",
      suspended: "#EF9F27",
      cancelled: "#E24B4A",
    };
    const labels: Record<string, string> = {
      trial: "Trial",
      active: "Ativa",
      past_due: "Pagamento atrasado",
      suspended: "Suspensa",
      cancelled: "Cancelada",
    };
    const contagem = new Map<string, number>();
    for (const e of empresas) {
      if (!e.assinatura) continue;
      contagem.set(e.assinatura.status, (contagem.get(e.assinatura.status) ?? 0) + 1);
    }
    return Array.from(contagem.entries()).map(([status, valor]) => ({
      label: labels[status] ?? status,
      valor,
      cor: cores[status],
    }));
  }, [empresas]);

  const empresasRecentes = empresas.slice(0, 5);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">Visão geral da plataforma Oxys OS.</p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Empresas totais" valor={stats.total} />
        <StatCard label="Empresas ativas" valor={stats.ativas} />
        <StatCard label="Em trial" valor={stats.emTrial} />
        <StatCard label="Suspensas" valor={stats.suspensas} />
        <StatCard label="Assinaturas ativas" valor={stats.assinaturasAtivas} />
        <StatCard label="MRR" valor={formatarMoeda(stats.mrr)} />
        <StatCard label="Gerentes cadastrados" valor={totalGerentes} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-panel p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
            Empresas por segmento
          </p>
          <BarraProporcional itens={porSegmento} />
        </div>
        <div className="rounded-xl border border-border bg-panel p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
            Empresas por plano
          </p>
          <BarraProporcional itens={porPlano} />
        </div>
        <div className="rounded-xl border border-border bg-panel p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">
            Assinaturas por status
          </p>
          <BarraProporcional itens={porStatusAssinatura} />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="border-b border-border px-5 py-3.5">
          <p className="text-sm font-medium text-text-primary">Empresas recentes</p>
        </div>
        {empresasRecentes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Building2 size={22} className="text-text-muted" />
            <p className="text-sm text-text-secondary">Nenhuma empresa cadastrada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  <th className="px-5 py-3 font-medium">Segmento</th>
                  <th className="px-5 py-3 font-medium">Plano</th>
                  <th className="px-5 py-3 font-medium">Responsável</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {empresasRecentes.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-text-primary">{e.nome}</td>
                    <td className="px-5 py-3 text-text-secondary">{e.segmento?.nome ?? "—"}</td>
                    <td className="px-5 py-3 text-text-secondary">{e.planoAtual?.nome ?? "—"}</td>
                    <td className="px-5 py-3 text-text-secondary">{e.gerente?.nome ?? "—"}</td>
                    <td className="px-5 py-3 text-text-secondary capitalize">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
