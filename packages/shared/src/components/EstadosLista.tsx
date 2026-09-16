import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  acao?: { label: string; onClick: () => void };
}

export function EmptyState({ icone: Icone, titulo, descricao, acao }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-text-muted">
        <Icone size={22} strokeWidth={1.75} />
      </div>
      <p className="font-display text-sm font-medium text-text-primary">{titulo}</p>
      <p className="max-w-xs text-sm text-text-secondary">{descricao}</p>
      {acao && (
        <button
          onClick={acao.onClick}
          className="mt-2 text-sm font-medium text-accent hover:text-accent-hover"
        >
          {acao.label}
        </button>
      )}
    </div>
  );
}

export function TabelaSkeleton({ colunas }: { colunas: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, linha) => (
        <tr key={linha} className="border-b border-border last:border-0">
          {Array.from({ length: colunas }).map((_, coluna) => (
            <td key={coluna} className="px-5 py-4">
              <div className="h-3.5 w-full max-w-[160px] animate-pulse rounded bg-white/5" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
