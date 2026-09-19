import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { listarEquipamentos } from "../equipamentosService";
import type { EquipamentoListagem } from "../tipos";
import { GarantiaInfo, StatusEquipamentoBadge } from "./Indicadores";

interface EquipamentosDoClienteProps {
  clienteId: string;
  /** muda quando um equipamento é cadastrado, para recarregar */
  versao: number;
  podeCadastrar: boolean;
  onCadastrar: () => void;
}

const LIMITE = 50;

export function EquipamentosDoCliente({ clienteId, versao, podeCadastrar, onCadastrar }: EquipamentosDoClienteProps) {
  const [dados, setDados] = useState<{ itens: EquipamentoListagem[]; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setErro(null);
    listarEquipamentos({ busca: "", arquivo: "todos", status: "", categoria: "", cliente: clienteId, garantia: "", pagina: 1 })
      .then((r) => !cancelado && setDados({ itens: r.equipamentos, total: r.total }))
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : "Erro ao carregar equipamentos."));
    return () => {
      cancelado = true;
    };
  }, [clienteId, versao]);

  if (erro) return <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">{erro}</p>;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      {dados === null ? (
        <div className="flex flex-col gap-2 p-5" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : dados.total === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="font-display text-sm font-medium text-text-primary">Nenhum equipamento cadastrado para este cliente.</p>
          {podeCadastrar && (
            <button
              onClick={onCadastrar}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Plus size={16} aria-hidden="true" /> Adicionar equipamento
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {dados.itens.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/app/assets/${e.id}`}
                  className="flex flex-col gap-1.5 px-5 py-3.5 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{e.nome}</p>
                    <p className="truncate text-xs text-text-muted">
                      {[e.categoria?.nome, [e.marca, e.modelo].filter(Boolean).join(" "), e.endereco?.rotulo, e.localizacao]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
                    <GarantiaInfo garantiaAte={e.garantia_ate} compacto />
                    <StatusEquipamentoBadge status={e.status} arquivado={!!e.arquivado_em} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-text-muted">
            <span>
              {dados.total} {dados.total === 1 ? "equipamento" : "equipamentos"}
            </span>
            {dados.total > LIMITE && (
              <Link to={`/app/assets?cliente=${clienteId}&arquivo=todos`} className="font-medium text-accent hover:text-accent-hover">
                Ver todos
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
