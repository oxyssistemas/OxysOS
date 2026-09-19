import { NavLink, Outlet } from "react-router-dom";
import { useCompany } from "../context/CompanyContext";

/** Abas da área de OS: lista e acompanhamento das OS em execução. */
export function OrdensLayout() {
  const { can } = useCompany();

  const abas = [
    { rota: "/app/service-orders", label: "Ordens", visivel: true },
    { rota: "/app/service-orders/execution", label: "Em execução", visivel: can("service_orders.edit") },
  ].filter((a) => a.visivel);

  return (
    <div>
      {abas.length > 1 && (
        <nav aria-label="Seções de ordens de serviço" className="mb-6 overflow-x-auto border-b border-border">
          <ul className="flex min-w-max gap-1">
            {abas.map((aba) => (
              <li key={aba.rota}>
                <NavLink
                  to={aba.rota}
                  end
                  className={({ isActive }) =>
                    `-mb-px block border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? "border-accent text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
                    }`
                  }
                >
                  {aba.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <Outlet />
    </div>
  );
}
