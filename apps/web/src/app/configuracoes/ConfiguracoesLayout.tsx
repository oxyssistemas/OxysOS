import { Navigate, NavLink, Outlet } from "react-router-dom";
import { ClipboardCheck, Flag, ListChecks, Wrench, type LucideIcon } from "lucide-react";
import { useCompany } from "../context/CompanyContext";

interface Aba {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  /** seções de OS só aparecem para empresas com o módulo de OS */
  exigeOs?: boolean;
}

const ABAS: Aba[] = [
  { rota: "statuses", rotulo: "Status da OS", icone: ListChecks, exigeOs: true },
  { rota: "priorities", rotulo: "Prioridades", icone: Flag, exigeOs: true },
  { rota: "service-types", rotulo: "Tipos de serviço", icone: Wrench, exigeOs: true },
  { rota: "checklists", rotulo: "Checklists", icone: ClipboardCheck, exigeOs: true },
];

function abasConfiguracaoVisiveis(temOs: boolean): Aba[] {
  return ABAS.filter((a) => !a.exigeOs || temOs);
}

/** /app/settings — configurações da empresa (settings.manage). */
export function ConfiguracoesLayout() {
  const { hasFeature } = useCompany();
  const abas = abasConfiguracaoVisiveis(hasFeature("service_orders"));

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Configurações</h1>
        <p className="mt-1 text-sm text-text-secondary">Ajuste o funcionamento do portal para a sua empresa.</p>
      </div>

      <nav aria-label="Seções das configurações" className="mt-6 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-1">
          {abas.map((aba) => (
            <li key={aba.rota}>
              <NavLink
                to={aba.rota}
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

/** /app/settings → primeira seção disponível. */
export function ConfiguracoesInicio() {
  const { hasFeature } = useCompany();
  return <Navigate to={abasConfiguracaoVisiveis(hasFeature("service_orders"))[0].rota} replace />;
}
