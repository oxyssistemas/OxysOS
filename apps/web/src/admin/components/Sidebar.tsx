import {
  LayoutDashboard,
  Building2,
  Users,
  Tags,
  Layers,
  Puzzle,
  CreditCard,
  ScrollText,
  Settings,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "@/auth/AuthContext";

export type Pagina =
  | "dashboard"
  | "empresas"
  | "gerentes"
  | "segmentos"
  | "planos"
  | "funcionalidades"
  | "assinaturas"
  | "logs"
  | "configuracoes";

interface SidebarProps {
  paginaAtual: Pagina;
  onNavegar: (pagina: Pagina) => void;
  aberta: boolean;
  onFechar: () => void;
}

const ITENS: { id: Pagina; label: string; icone: typeof Building2 }[] = [
  { id: "dashboard", label: "Dashboard", icone: LayoutDashboard },
  { id: "empresas", label: "Empresas", icone: Building2 },
  { id: "gerentes", label: "Gerentes", icone: Users },
  { id: "segmentos", label: "Segmentos", icone: Tags },
  { id: "planos", label: "Planos", icone: Layers },
  { id: "funcionalidades", label: "Módulos", icone: Puzzle },
  { id: "assinaturas", label: "Assinaturas", icone: CreditCard },
  { id: "logs", label: "Logs", icone: ScrollText },
  { id: "configuracoes", label: "Configurações", icone: Settings },
];

export function Sidebar({ paginaAtual, onNavegar, aberta, onFechar }: SidebarProps) {
  const { nome, sair } = useAuth();

  const conteudo = (
    <div className="flex h-full flex-col bg-elevated border-r border-border">
      <div className="px-6 py-7">
        <p className="font-display text-lg font-semibold tracking-tight text-text-primary">
          Oxys OS
        </p>
        <p className="mt-1 text-[11px] font-medium tracking-wide text-accent">
          Super admin
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3" aria-label="Navegação principal">
        <ul className="flex flex-col gap-1">
          {ITENS.map((item) => {
            const Icone = item.icone;
            const ativo = paginaAtual === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onNavegar(item.id);
                    onFechar();
                  }}
                  aria-current={ativo ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    ativo
                      ? "bg-accent-muted text-accent"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  }`}
                >
                  <Icone size={18} strokeWidth={2} />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent"
            aria-hidden="true"
          >
            {(nome ?? "S").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{nome ?? "Super admin"}</p>
          </div>
        </div>
        <button
          onClick={sair}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-danger"
        >
          <LogOut size={18} strokeWidth={2} />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block md:w-[260px] md:shrink-0">{conteudo}</aside>

      {aberta && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={onFechar}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-[260px] animate-fade-in">
            <div className="relative h-full">
              <button
                onClick={onFechar}
                aria-label="Fechar menu"
                className="absolute right-[-44px] top-4 rounded-lg bg-elevated p-2 text-text-secondary"
              >
                <X size={20} />
              </button>
              {conteudo}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
