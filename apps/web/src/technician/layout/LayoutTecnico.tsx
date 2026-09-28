import { Link, NavLink, Outlet } from "react-router-dom";
import { Bell, CalendarDays, ClipboardList, Home, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTecnico } from "../TecnicoContext";
import { useNotificacoes } from "@/components/notificacoes/useNotificacoes";
import { IndicadorConexao } from "../offline/IndicadorConexao";
import { primeiroNome } from "../tipos";

interface ItemNav {
  rota: string;
  label: string;
  icone: LucideIcon;
  fim?: boolean;
}

const ITENS: ItemNav[] = [
  { rota: "/technician", label: "Início", icone: Home, fim: true },
  { rota: "/technician/agenda", label: "Agenda", icone: CalendarDays },
  { rota: "/technician/jobs", label: "Atendimentos", icone: ClipboardList },
  { rota: "/technician/profile", label: "Perfil", icone: User },
];

/**
 * Layout do portal de campo: uma coluna, alvos grandes e navegação fixa
 * embaixo (uso com uma mão). Nada da barra lateral do portal da empresa.
 */
export function LayoutTecnico() {
  const { dados } = useTecnico();
  // uma caixa só para o sino e para a tela de avisos (via contexto do Outlet)
  const notificacoes = useNotificacoes();

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-20 border-b border-border bg-base/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {primeiroNome(dados?.tecnico?.nome) || "Portal do Técnico"}
            </p>
            <p className="truncate text-xs text-text-muted">{dados?.empresa?.nome}</p>
          </div>
          <Link
            to="/technician/notifications"
            aria-label={notificacoes.nao_lidas > 0 ? `Avisos: ${notificacoes.nao_lidas} não lidos` : "Avisos"}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary"
          >
            <Bell size={18} aria-hidden="true" />
            {notificacoes.nao_lidas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {notificacoes.nao_lidas > 99 ? "99+" : notificacoes.nao_lidas}
              </span>
            )}
          </Link>
        </div>
        <IndicadorConexao />
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        <Outlet context={{ notificacoes }} />
      </main>

      <nav
        aria-label="Navegação do técnico"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl">
          {ITENS.map((item) => (
            <li key={item.rota} className="flex-1">
              <NavLink
                to={item.rota}
                end={item.fim}
                className={({ isActive }) =>
                  `flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                    isActive ? "text-accent" : "text-text-muted hover:text-text-secondary"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icone size={20} aria-hidden="true" strokeWidth={isActive ? 2.4 : 1.8} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
