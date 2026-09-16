import { NavLink, Outlet } from "react-router-dom";
import { useCompany } from "../context/CompanyContext";

/**
 * Abas temporárias do fluxo de OS herdado do portal da loja (lista, abertura e execução).
 * Serão substituídas pelo novo módulo de Ordens de Serviço.
 */
export function OrdensLegadoLayout() {
  const { can } = useCompany();

  const abas = [
    { rota: "/app/service-orders", label: "Ordens", visivel: true },
    { rota: "/app/service-orders/new", label: "Abrir OS", visivel: can("service_orders.create") },
    { rota: "/app/service-orders/execution", label: "Execução", visivel: can("service_orders.edit") },
  ].filter((a) => a.visivel);

  return (
    <div>
      <nav aria-label="Seções de ordens de serviço" className="mb-6 overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-1">
          {abas.map((aba) => (
            <li key={aba.rota}>
              <NavLink
                to={aba.rota}
                end
                className={({ isActive }) =>
                  `-mb-px block border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-accent text-text-primary"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  }`
                }
              >
                {aba.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
