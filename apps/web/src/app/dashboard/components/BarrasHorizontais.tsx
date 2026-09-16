import { useState } from "react";
import { COR_SERIE, formatoNumero } from "./graficoBase";

export interface ItemBarra {
  id: string;
  rotulo: string;
  valor: number;
  /** cor de identificação configurada pela empresa (ex.: cor do status), exibida como marcador ao lado do rótulo */
  marcador?: string | null;
}

interface BarrasHorizontaisProps {
  itens: ItemBarra[];
  /** acima disso, a cauda é somada em "Outros" */
  maxItens?: number;
  unidade: { singular: string; plural: string };
}

/**
 * Uma série de magnitude: todas as barras na mesma cor (a cor configurada do
 * status vira só um marcador de identificação, nunca o preenchimento).
 */
export function BarrasHorizontais({ itens, maxItens = 8, unidade }: BarrasHorizontaisProps) {
  const [ativo, setAtivo] = useState<string | null>(null);

  const visiveis =
    itens.length > maxItens
      ? [
          ...itens.slice(0, maxItens - 1),
          {
            id: "__outros",
            rotulo: `Outros (${itens.length - (maxItens - 1)})`,
            valor: itens.slice(maxItens - 1).reduce((soma, item) => soma + item.valor, 0),
          },
        ]
      : itens;

  const maximo = Math.max(1, ...visiveis.map((i) => i.valor));
  const total = visiveis.reduce((soma, i) => soma + i.valor, 0);

  return (
    <ul className="flex flex-col gap-3">
      {visiveis.map((item) => {
        const percentualLargura = (item.valor / maximo) * 100;
        const participacao = total > 0 ? Math.round((item.valor / total) * 100) : 0;
        const descricao = `${item.rotulo}: ${formatoNumero.format(item.valor)} ${
          item.valor === 1 ? unidade.singular : unidade.plural
        } (${participacao}%)`;
        const destacado = ativo === item.id;

        return (
          <li
            key={item.id}
            tabIndex={0}
            aria-label={descricao}
            onPointerEnter={() => setAtivo(item.id)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(item.id)}
            onBlur={() => setAtivo(null)}
            className="relative rounded-md py-0.5 outline-offset-4"
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                {"marcador" in item && item.marcador && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.marcador }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate" title={item.rotulo}>
                  {item.rotulo}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-text-primary">
                {destacado && <span className="mr-1.5 text-xs text-text-muted">{participacao}% ·</span>}
                {formatoNumero.format(item.valor)}
              </span>
            </div>
            <div className="h-2.5 w-full" aria-hidden="true">
              {item.valor > 0 && (
                <div
                  className="h-full rounded-r transition-[filter,width] duration-300"
                  style={{
                    width: `max(${percentualLargura}%, 4px)`,
                    backgroundColor: COR_SERIE.primaria,
                    filter: destacado ? "brightness(1.25)" : undefined,
                  }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
