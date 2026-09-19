import { Route, Routes } from "react-router-dom";
import { CompanyProvider } from "./context/CompanyContext";
import { GuardaEmpresa } from "./guards/GuardaEmpresa";
import { RotaModulo } from "./guards/RotaModulo";
import { PortalLayout } from "./layout/PortalLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { NaoEncontradoPage } from "./pages/NaoEncontradoPage";
import { ExecucaoPage } from "./legado/pages/ExecucaoPage";
import { OrdensLayout } from "./ordens/OrdensLayout";
import { OrdensPage } from "./ordens/OrdensPage";
import { NovaOrdemPage } from "./ordens/NovaOrdemPage";
import { OrdemDetalhePage } from "./ordens/OrdemDetalhePage";
import { ClientesPage } from "./clientes/ClientesPage";
import { ClienteDetalhePage } from "./clientes/ClienteDetalhePage";
import { TecnicosPage } from "./tecnicos/TecnicosPage";
import { EquipamentosPage } from "./equipamentos/EquipamentosPage";
import { EquipamentoDetalhePage } from "./equipamentos/EquipamentoDetalhePage";
import { EquipamentoQrPage } from "./equipamentos/EquipamentoQrPage";
import { ConfiguracoesInicio, ConfiguracoesLayout } from "./configuracoes/ConfiguracoesLayout";
import { StatusOsPage } from "./configuracoes/StatusOsPage";
import { PrioridadesPage } from "./configuracoes/PrioridadesPage";
import { TiposServicoPage } from "./configuracoes/TiposServicoPage";
import { ChecklistsPage } from "./configuracoes/ChecklistsPage";
import { EquipeLayout } from "./equipe/EquipeLayout";
import { UsuariosPage } from "./equipe/UsuariosPage";
import { CargosPage } from "./equipe/CargosPage";
import { RelatoriosPage } from "./relatorios/RelatoriosPage";

/** /app — Portal da Empresa (owner, gerente e equipe). */
export function PortalEmpresa() {
  return (
    <CompanyProvider>
      <GuardaEmpresa>
        <Routes>
          <Route element={<PortalLayout />}>
            <Route
              index
              element={
                <RotaModulo permissao="dashboard.view">
                  <DashboardPage />
                </RotaModulo>
              }
            />

            <Route
              path="service-orders"
              element={
                <RotaModulo feature="service_orders" permissao="service_orders.view">
                  <OrdensLayout />
                </RotaModulo>
              }
            >
              <Route index element={<OrdensPage />} />
              {/* acompanhamento herdado do portal da loja (fotos e observações da execução) */}
              <Route
                path="execution"
                element={
                  <RotaModulo permissao="service_orders.edit">
                    <ExecucaoPage />
                  </RotaModulo>
                }
              />
            </Route>
            <Route
              path="service-orders/new"
              element={
                <RotaModulo feature="service_orders" permissao="service_orders.create">
                  <NovaOrdemPage />
                </RotaModulo>
              }
            />
            <Route
              path="service-orders/:id"
              element={
                <RotaModulo feature="service_orders" permissao="service_orders.view">
                  <OrdemDetalhePage />
                </RotaModulo>
              }
            />

            <Route
              path="customers"
              element={
                <RotaModulo feature="customers" permissao="customers.view">
                  <ClientesPage />
                </RotaModulo>
              }
            />
            <Route
              path="customers/:id"
              element={
                <RotaModulo feature="customers" permissao="customers.view">
                  <ClienteDetalhePage />
                </RotaModulo>
              }
            />

            <Route
              path="technicians"
              element={
                <RotaModulo feature="technicians" permissao="technicians.view">
                  <TecnicosPage />
                </RotaModulo>
              }
            />
            <Route
              path="assets"
              element={
                <RotaModulo feature="assets" permissao="assets.view">
                  <EquipamentosPage />
                </RotaModulo>
              }
            />
            {/* destino do QR Code: resolve o código só para a própria empresa (vê OS ou equipamentos) */}
            <Route
              path="assets/qr/:codigo"
              element={
                <RotaModulo feature="assets">
                  <EquipamentoQrPage />
                </RotaModulo>
              }
            />
            <Route
              path="assets/:id"
              element={
                <RotaModulo feature="assets" permissao="assets.view">
                  <EquipamentoDetalhePage />
                </RotaModulo>
              }
            />
            <Route
              path="team"
              element={
                <RotaModulo permissao="team.manage">
                  <EquipeLayout />
                </RotaModulo>
              }
            >
              <Route index element={<UsuariosPage />} />
              <Route path="roles" element={<CargosPage />} />
            </Route>
            <Route
              path="reports"
              element={
                <RotaModulo feature="service_orders" permissao="reports.view">
                  <RelatoriosPage />
                </RotaModulo>
              }
            />
            <Route
              path="settings"
              element={
                <RotaModulo permissao="settings.manage">
                  <ConfiguracoesLayout />
                </RotaModulo>
              }
            >
              <Route index element={<ConfiguracoesInicio />} />
              <Route
                path="statuses"
                element={
                  <RotaModulo feature="service_orders">
                    <StatusOsPage />
                  </RotaModulo>
                }
              />
              <Route
                path="priorities"
                element={
                  <RotaModulo feature="service_orders">
                    <PrioridadesPage />
                  </RotaModulo>
                }
              />
              <Route
                path="service-types"
                element={
                  <RotaModulo feature="service_orders">
                    <TiposServicoPage />
                  </RotaModulo>
                }
              />
              <Route
                path="checklists"
                element={
                  <RotaModulo feature="service_orders">
                    <ChecklistsPage />
                  </RotaModulo>
                }
              />
            </Route>

            <Route path="*" element={<NaoEncontradoPage voltarPara="/app" />} />
          </Route>
        </Routes>
      </GuardaEmpresa>
    </CompanyProvider>
  );
}
