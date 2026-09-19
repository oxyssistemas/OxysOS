import { Check } from "lucide-react";
import { COR_HEX, CORES_CONFIGURACAO } from "../tipos";

interface SeletorCorProps {
  id: string;
  valor: string;
  onAlterar: (cor: string) => void;
  erro?: string;
}

export function SeletorCor({ id, valor, onAlterar, erro }: SeletorCorProps) {
  const valida = COR_HEX.test(valor);
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-text-secondary">Cor</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cores sugeridas">
        {CORES_CONFIGURACAO.map((cor) => {
          const marcada = valor.toUpperCase() === cor;
          return (
            <button
              key={cor}
              type="button"
              role="radio"
              aria-checked={marcada}
              aria-label={`Cor ${cor}`}
              onClick={() => onAlterar(cor)}
              className={`flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-panel transition-shadow ${
                marcada ? "ring-2 ring-white/60" : ""
              }`}
              style={{ backgroundColor: cor }}
            >
              {marcada && <Check size={14} className="text-white" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="color"
          aria-label="Escolher outra cor"
          value={valida ? valor : "#378ADD"}
          onChange={(e) => onAlterar(e.target.value.toUpperCase())}
          className="h-9 w-11 cursor-pointer rounded-md border border-border bg-base p-1"
        />
        <label htmlFor={id} className="sr-only">
          Código da cor
        </label>
        <input
          id={id}
          value={valor}
          maxLength={7}
          onChange={(e) => onAlterar(e.target.value.trim().toUpperCase())}
          aria-invalid={!!erro}
          aria-describedby={erro ? `${id}_erro` : undefined}
          className="w-28 rounded-lg border border-border bg-base px-3 py-2 font-mono text-sm uppercase text-text-primary focus:border-accent"
        />
      </div>
      {erro && (
        <p id={`${id}_erro`} className="mt-1.5 text-xs text-danger">
          {erro}
        </p>
      )}
    </fieldset>
  );
}
