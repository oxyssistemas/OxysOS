import { NavLink, Outlet } from "react-router-dom";
import { ShieldCheck, Users2 } from "lucide-react";

const ABAS = [
  { rota: ".", rotulo: "Usuários", icone: Users2, fim: true },
  { rota: "roles", rotulo: "Cargos e permissões", icone: ShieldCheck, fim: false },
];

/** /app/team — usuários da empresa e cargos (team.manage). */
export function EquipeLayout() {
  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Equipe</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Quem acessa o portal da sua empresa e o que cada pessoa pode fazer.
        </p>
      </div>

      <nav aria-label="Seções da equipe" className="mt-6 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-1">
          {ABAS.map((aba) => (
            <li key={aba.rota}>
              <NavLink
                to={aba.rota}
                end={aba.fim}
                className={({ isActive }) =>
                  `flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
                  }`
                }
              >
                <aba.icone size={15} aria-hidden="true" />
                {aba.rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
