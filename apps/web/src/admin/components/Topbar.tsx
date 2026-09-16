import { Menu } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

interface TopbarProps {
  caminho: string;
  onAbrirMenu: () => void;
}

export function Topbar({ caminho, onAbrirMenu }: TopbarProps) {
  const { nome } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-base px-4 md:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-text-secondary hover:bg-white/5 md:hidden"
        >
          <Menu size={20} />
        </button>
        <p className="text-sm text-text-secondary">
          Oxys OS <span className="mx-1.5 text-text-muted">/</span>
          <span className="text-text-primary">{caminho}</span>
        </p>
      </div>

      <div
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent"
        aria-label={`Usuário: ${nome ?? "Super admin"}`}
      >
        {(nome ?? "S").charAt(0).toUpperCase()}
      </div>
    </header>
  );
}
