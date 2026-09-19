import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search, X } from "lucide-react";
import { formatarDocumento } from "@oxys/shared/masks";
import { buscarClientesAtivos, type ClienteOpcao } from "../equipamentosService";

interface ClienteSeletorProps {
  id: string;
  label: string;
  valor: { id: string; nome: string } | null;
  onAlterar: (cliente: { id: string; nome: string } | null) => void;
  erro?: string;
  disabled?: boolean;
}

/** Combobox acessível com busca no servidor (não carrega todos os clientes). */
export function ClienteSeletor({ id, label, valor, onAlterar, erro, disabled }: ClienteSeletorProps) {
  const listaId = useId();
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const requisicao = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    const numero = ++requisicao.current;
    setCarregando(true);
    const t = setTimeout(() => {
      buscarClientesAtivos(texto)
        .then((r) => numero === requisicao.current && (setOpcoes(r), setAtivo(0)))
        .catch(() => numero === requisicao.current && setOpcoes([]))
        .finally(() => numero === requisicao.current && setCarregando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [texto, aberto]);

  function escolher(c: ClienteOpcao) {
    onAlterar({ id: c.id, nome: c.nome });
    setTexto("");
    setAberto(false);
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => Math.min(a + 1, Math.max(opcoes.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && aberto && opcoes[ativo]) {
      e.preventDefault();
      escolher(opcoes[ativo]);
    } else if (e.key === "Escape" && aberto) {
      e.stopPropagation();
      setAberto(false);
    }
  }

  if (valor) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-base px-3.5 py-2.5">
          <span className="truncate text-sm text-text-primary">{valor.nome}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onAlterar(null)}
              aria-label={`Trocar cliente (atual: ${valor.nome})`}
              className="rounded p-0.5 text-text-muted hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={aberto && opcoes[ativo] ? `${listaId}-${opcoes[ativo].id}` : undefined}
          aria-invalid={!!erro}
          aria-describedby={erro ? `${id}-erro` : undefined}
          disabled={disabled}
          value={texto}
          placeholder="Buscar cliente por nome ou documento"
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={aoTeclar}
          className={`w-full rounded-lg border bg-base py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent ${
            erro ? "border-danger" : "border-border"
          }`}
        />
        {carregando && aberto && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-muted" aria-hidden="true" />
        )}
      </div>
      {aberto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-elevated py-1 shadow-xl"
        >
          {!carregando && opcoes.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">Nenhum cliente ativo encontrado.</li>
          ) : (
            opcoes.map((c, i) => (
              <li
                key={c.id}
                id={`${listaId}-${c.id}`}
                role="option"
                aria-selected={i === ativo}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(c);
                }}
                onMouseEnter={() => setAtivo(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${i === ativo ? "bg-white/5 text-text-primary" : "text-text-secondary"}`}
              >
                <span className="block truncate">{c.nome}</span>
                {c.documento && (
                  <span className="text-xs text-text-muted">{formatarDocumento(c.documento, c.tipo_pessoa)}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
      {erro && (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
