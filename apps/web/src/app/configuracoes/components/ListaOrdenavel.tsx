import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil } from "lucide-react";
import { MarcadorCor } from "./Indicadores";

export interface ItemOrdenavel {
  id: string;
  nome: string;
  cor: string;
  ativo: boolean;
}

interface ListaOrdenavelProps<T extends ItemOrdenavel> {
  itens: T[];
  /** descrição da lista para leitores de tela */
  rotulo: string;
  processandoId: string | null;
  bloqueada: boolean;
  onMover: (indice: number, direcao: -1 | 1) => void;
  onEditar: (item: T) => void;
  selos: (item: T) => ReactNode;
  detalhe: (item: T) => ReactNode;
  acoes: (item: T) => ReactNode;
}

/** Lista na ordem do fluxo, com mover para cima/baixo por botões (acessível por teclado). */
export function ListaOrdenavel<T extends ItemOrdenavel>({
  itens,
  rotulo,
  processandoId,
  bloqueada,
  onMover,
  onEditar,
  selos,
  detalhe,
  acoes,
}: ListaOrdenavelProps<T>) {
  return (
    <ol aria-label={rotulo} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
      {itens.map((item, indice) => {
        const ocupado = processandoId === item.id;
        return (
          <li key={item.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-text-muted">{indice + 1}</span>
              <span className="mt-1">
                <MarcadorCor cor={item.cor} tamanho="md" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className={`truncate text-sm font-medium ${item.ativo ? "text-text-primary" : "text-text-muted"}`}>
                    {item.nome}
                  </p>
                  {selos(item)}
                </div>
                <div className="mt-0.5 text-xs text-text-muted">{detalhe(item)}</div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1 pl-8 sm:pl-0">
              {ocupado && <Loader2 size={14} className="mr-1 animate-spin text-text-muted" aria-hidden="true" />}
              <button
                onClick={() => onMover(indice, -1)}
                disabled={bloqueada || indice === 0}
                aria-label={`Mover ${item.nome} para cima`}
                className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => onMover(indice, 1)}
                disabled={bloqueada || indice === itens.length - 1}
                aria-label={`Mover ${item.nome} para baixo`}
                className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => onEditar(item)}
                disabled={ocupado}
                aria-label={`Editar ${item.nome}`}
                className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
              >
                <Pencil size={14} />
              </button>
              {acoes(item)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
