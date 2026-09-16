import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";

/**
 * Cores das séries validadas (validate_palette, modo escuro, superfície #161616):
 * azul da marca × laranja — CVD ΔE 31.7, visão normal ΔE 39.1, contraste ≥ 3:1.
 * Ordem fixa: a cor segue a série, nunca a posição.
 */
export const COR_SERIE = {
  primaria: "#1565FF",
  secundaria: "#d95926",
} as const;

export const COR_GRADE = "#262626";
export const COR_EIXO = "#333333";
export const COR_SUPERFICIE = "#161616";

export const formatoNumero = new Intl.NumberFormat("pt-BR");

interface CartaoGraficoProps {
  titulo: string;
  descricao?: string;
  /** conteúdo alternativo em tabela (sempre disponível) */
  tabela?: ReactNode;
  vazio?: boolean;
  mensagemVazio?: string;
  className?: string;
  children: ReactNode;
}

export function CartaoGrafico({
  titulo,
  descricao,
  tabela,
  vazio,
  mensagemVazio = "Nenhum dado no período selecionado.",
  className = "",
  children,
}: CartaoGraficoProps) {
  const [verTabela, setVerTabela] = useState(false);

  return (
    <section className={`flex flex-col rounded-xl border border-border bg-panel p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold text-text-primary">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-text-muted">{descricao}</p>}
        </div>
        {tabela && !vazio && (
          <button
            type="button"
            onClick={() => setVerTabela((v) => !v)}
            aria-pressed={verTabela}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
          >
            {verTabela ? <BarChart3 size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />}
            {verTabela ? "Gráfico" : "Tabela"}
          </button>
        )}
      </header>
      {vazio ? (
        <div className="flex flex-1 items-center justify-center py-10 text-center text-sm text-text-muted">
          {mensagemVazio}
        </div>
      ) : verTabela ? (
        <div className="overflow-x-auto">{tabela}</div>
      ) : (
        children
      )}
    </section>
  );
}

export function TabelaDados({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-border">
          {colunas.map((coluna, i) => (
            <th
              key={coluna}
              scope="col"
              className={`py-2 text-xs font-medium uppercase tracking-wide text-text-muted ${i > 0 ? "text-right" : ""}`}
            >
              {coluna}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, indice) => (
          <tr key={indice} className="border-b border-border/60 last:border-0">
            {linha.map((celula, i) => (
              <td
                key={i}
                className={`py-2 ${i > 0 ? "text-right tabular-nums text-text-primary" : "text-text-secondary"}`}
              >
                {typeof celula === "number" ? formatoNumero.format(celula) : celula}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Largura do container, observada (para SVG responsivo). */
export function useLarguraElemento<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(elemento);
    setLargura(elemento.getBoundingClientRect().width);
    return () => observador.disconnect();
  }, []);

  return { ref, largura };
}

/** Escala "limpa" para o eixo Y (inteiros): máximo arredondado e ticks. */
export function escalaInteira(maximo: number, ticksDesejados = 4): { topo: number; ticks: number[] } {
  if (maximo <= 0) return { topo: 1, ticks: [0, 1] };
  const passoBruto = maximo / ticksDesejados;
  const magnitude = 10 ** Math.floor(Math.log10(passoBruto));
  const passo = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((p) => p >= passoBruto) ?? magnitude * 10);
  const topo = Math.ceil(maximo / passo) * passo;
  const ticks: number[] = [];
  for (let v = 0; v <= topo; v += passo) ticks.push(v);
  return { topo, ticks };
}
