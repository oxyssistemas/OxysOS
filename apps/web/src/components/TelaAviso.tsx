import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface TelaAvisoProps {
  icone: LucideIcon;
  titulo: string;
  descricao: ReactNode;
  tom?: "neutro" | "alerta" | "perigo";
  acoes?: ReactNode;
  /** tela cheia (fora do layout) ou dentro do conteúdo do portal */
  telaCheia?: boolean;
}

const COR_TOM = {
  neutro: "bg-accent-muted text-accent",
  alerta: "bg-amber-400/10 text-amber-400",
  perigo: "bg-danger/10 text-danger",
};

export function TelaAviso({ icone: Icone, titulo, descricao, tom = "neutro", acoes, telaCheia }: TelaAvisoProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 px-4 text-center ${
        telaCheia ? "min-h-screen bg-base" : "py-24"
      }`}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${COR_TOM[tom]}`}>
        <Icone size={22} aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-lg font-semibold text-text-primary">{titulo}</h1>
        <div className="mx-auto mt-1 max-w-md text-sm text-text-secondary">{descricao}</div>
      </div>
      {acoes && <div className="flex flex-wrap items-center justify-center gap-2">{acoes}</div>}
    </div>
  );
}
