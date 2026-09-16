import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { COR_EIXO, COR_GRADE, COR_SUPERFICIE, escalaInteira, formatoNumero, useLarguraElemento } from "./graficoBase";

export interface SerieLinha {
  id: string;
  nome: string;
  cor: string;
  valores: number[];
}

interface GraficoLinhasProps {
  /** rótulo curto de cada ponto no eixo X */
  rotulos: string[];
  /** rótulo completo de cada ponto (tooltip) */
  rotulosCompletos: string[];
  series: SerieLinha[];
  descricaoAcessivel: string;
}

const ALTURA_PLOT = 200;
const MARGEM = { topo: 12, direita: 12, baixo: 28, esquerda: 36 };

export function GraficoLinhas({ rotulos, rotulosCompletos, series, descricaoAcessivel }: GraficoLinhasProps) {
  const { ref, largura } = useLarguraElemento<HTMLDivElement>();
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null);

  const pontos = rotulos.length;
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
  const { topo, ticks } = escalaInteira(maximo);

  const larguraPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita);
  const alturaTotal = MARGEM.topo + ALTURA_PLOT + MARGEM.baixo;

  const x = (i: number) => MARGEM.esquerda + (pontos <= 1 ? larguraPlot / 2 : (i / (pontos - 1)) * larguraPlot);
  const y = (v: number) => MARGEM.topo + ALTURA_PLOT - (v / topo) * ALTURA_PLOT;

  // rótulos do eixo X espaçados pela largura estimada do maior rótulo, sem sobreposição
  const larguraRotulo = Math.max(...rotulos.map((r) => r.length), 1) * 6.5 + 16;
  const maxRotulos = Math.max(2, Math.floor(larguraPlot / larguraRotulo));
  const passoRotulo = Math.max(1, Math.ceil((pontos - 1) / (maxRotulos - 1)));
  const mostrarRotulo = (i: number) =>
    i === pontos - 1 || (i % passoRotulo === 0 && pontos - 1 - i >= passoRotulo * 0.75);

  function indiceMaisProximo(e: PointerEvent<SVGRectElement>) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const posicao = e.clientX - caixa.left;
    if (pontos <= 1) return 0;
    return Math.min(pontos - 1, Math.max(0, Math.round((posicao / caixa.width) * (pontos - 1))));
  }

  function aoTeclar(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const atual = indiceAtivo ?? (e.key === "ArrowRight" ? -1 : pontos);
      setIndiceAtivo(Math.min(pontos - 1, Math.max(0, atual + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") {
      setIndiceAtivo(null);
    }
  }

  const posicaoTooltip =
    indiceAtivo !== null ? Math.min(Math.max(x(indiceAtivo), 80), Math.max(80, largura - 80)) : 0;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4" aria-label="Legenda">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.cor }} aria-hidden="true" />
            {s.nome}
          </li>
        ))}
      </ul>

      <div ref={ref} className="relative w-full">
        {largura > 0 && (
          <svg
            width={largura}
            height={alturaTotal}
            role="img"
            aria-label={`${descricaoAcessivel}. Use as setas para navegar pelos pontos.`}
            tabIndex={0}
            onKeyDown={aoTeclar}
            onBlur={() => setIndiceAtivo(null)}
            className="block rounded-md"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGEM.esquerda}
                  x2={MARGEM.esquerda + larguraPlot}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? COR_EIXO : COR_GRADE}
                  strokeWidth={1}
                />
                <text
                  x={MARGEM.esquerda - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-text-muted text-[11px] tabular-nums"
                >
                  {formatoNumero.format(tick)}
                </text>
              </g>
            ))}

            {rotulos.map((rotulo, i) =>
              mostrarRotulo(i) ? (
                <text
                  key={i}
                  x={x(i)}
                  y={MARGEM.topo + ALTURA_PLOT + 18}
                  textAnchor={pontos > 1 && i === 0 ? "start" : pontos > 1 && i === pontos - 1 ? "end" : "middle"}
                  className="fill-text-muted text-[11px]"
                >
                  {rotulo}
                </text>
              ) : null,
            )}

            {indiceAtivo !== null && (
              <line
                x1={x(indiceAtivo)}
                x2={x(indiceAtivo)}
                y1={MARGEM.topo}
                y2={MARGEM.topo + ALTURA_PLOT}
                stroke={COR_EIXO}
                strokeWidth={1}
              />
            )}

            {series.map((s) =>
              pontos > 1 ? (
                <polyline
                  key={s.id}
                  fill="none"
                  stroke={s.cor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                />
              ) : null,
            )}

            {series.map((s) =>
              (pontos === 1 ? [0] : indiceAtivo !== null ? [indiceAtivo] : []).map((i) => (
                <circle
                  key={`${s.id}-${i}`}
                  cx={x(i)}
                  cy={y(s.valores[i])}
                  r={4}
                  fill={s.cor}
                  stroke={COR_SUPERFICIE}
                  strokeWidth={2}
                />
              )),
            )}

            <rect
              x={MARGEM.esquerda}
              y={MARGEM.topo}
              width={larguraPlot}
              height={ALTURA_PLOT}
              fill="transparent"
              onPointerMove={(e) => setIndiceAtivo(indiceMaisProximo(e))}
              onPointerLeave={() => setIndiceAtivo(null)}
            />
          </svg>
        )}

        {indiceAtivo !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 min-w-[140px] -translate-x-1/2 rounded-md border border-border bg-elevated px-3 py-2 text-xs shadow-lg"
            style={{ left: posicaoTooltip }}
          >
            <p className="mb-1.5 text-text-muted">{rotulosCompletos[indiceAtivo]}</p>
            <ul className="flex flex-col gap-1">
              {series.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: s.cor }} aria-hidden="true" />
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatoNumero.format(s.valores[indiceAtivo])}
                  </span>
                  <span className="text-text-secondary">{s.nome}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
