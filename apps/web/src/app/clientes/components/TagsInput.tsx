import { useId, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagsInputProps {
  id: string;
  label: string;
  valor: string[];
  onAlterar: (tags: string[]) => void;
  sugestoes?: string[];
  maximo?: number;
  erro?: string;
}

function normalizarTag(tag: string): string {
  return tag.trim().toLowerCase().slice(0, 40);
}

export function TagsInput({ id, label, valor, onAlterar, sugestoes = [], maximo = 20, erro }: TagsInputProps) {
  const [texto, setTexto] = useState("");
  const listaId = useId();
  const dicaId = `${id}-dica`;

  function adicionar(bruto: string) {
    const novas = bruto
      .split(",")
      .map(normalizarTag)
      .filter((t) => t && !valor.includes(t));
    if (novas.length === 0) return;
    onAlterar([...valor, ...new Set(novas)].slice(0, maximo));
    setTexto("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      adicionar(texto);
    } else if (e.key === "Backspace" && !texto && valor.length > 0) {
      onAlterar(valor.slice(0, -1));
    }
  }

  const disponiveis = sugestoes.filter((s) => !valor.includes(s));

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-lg border bg-base px-2.5 py-2 focus-within:border-accent ${
          erro ? "border-danger" : "border-border"
        }`}
      >
        {valor.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md bg-white/5 py-0.5 pl-2 pr-1 text-xs text-text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => onAlterar(valor.filter((t) => t !== tag))}
              aria-label={`Remover tag ${tag}`}
              className="rounded p-0.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          onBlur={() => texto.trim() && adicionar(texto)}
          list={listaId}
          disabled={valor.length >= maximo}
          placeholder={valor.length === 0 ? "Ex.: vip, contrato" : ""}
          aria-describedby={erro ? `${id}-erro` : dicaId}
          aria-invalid={!!erro}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <datalist id={listaId}>
          {disponiveis.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {erro ? (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {erro}
        </p>
      ) : (
        <p id={dicaId} className="text-xs text-text-muted">
          Enter ou vírgula para adicionar · {valor.length}/{maximo}
        </p>
      )}
    </div>
  );
}
