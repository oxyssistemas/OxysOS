import { Route, Routes } from "react-router-dom";
import { BarChart3, HardDrive, UserCog, Wrench } from "lucide-react";
import { CompanyProvider } from "./context/CompanyContext";
import { GuardaEmpresa } from "./guards/GuardaEmpresa";
import { RotaModulo } from "./guards/RotaModulo";
import { PortalLayout } from "./layout/PortalLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { ModuloEmImplantacaoPage } from "./pages/ModuloEmImplantacaoPage";
import { NaoEncontradoPage } from "./pages/NaoEncontradoPage";
import { OrdensLegadoLayout } from "./legado/OrdensLegadoLayout";
import { OrdensPage } from "./legado/pages/OrdensPage";
import { NovaOsPage } from "./legado/pages/NovaOsPage";
import { ExecucaoPage } from "./legado/pages/ExecucaoPage";
import { ClientesPage } from "./clientes/ClientesPage";
import { ClienteDetalhePage } from "./clientes/ClienteDetalhePage";
import { ConfiguracoesPage } from "./legado/pages/ConfiguracoesPage";

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

            {/* Fluxo de OS herdado do portal da loja até o novo módulo ficar pronto */}
            <Route
              path="service-orders"
              element={
                <RotaModulo feature="service_orders" permissao="service_orders.view">
                  <OrdensLegadoLayout />
                </RotaModulo>
              }
            >
              <Route index element={<OrdensPage />} />
              <Route
                path="new"
                element={
                  <RotaModulo permissao="service_orders.create">
                    <NovaOsPage />
                  </RotaModulo>
                }
              />
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
                  <ModuloEmImplantacaoPage
                    icone={Wrench}
                    titulo="Técnicos"
                    descricao="O cadastro de técnicos e especialidades está sendo implantado."
                  />
                </RotaModulo>
              }
            />
            <Route
              path="assets"
              element={
                <RotaModulo feature="assets" permissao="assets.view">
                  <ModuloEmImplantacaoPage
                    icone={HardDrive}
                    titulo="Equipamentos"
                    descricao="O cadastro de equipamentos vinculados aos clientes está sendo implantado."
                  />
                </RotaModulo>
              }
            />
            <Route
              path="team"
              element={
                <RotaModulo permissao="team.manage">
                  <ModuloEmImplantacaoPage
                    icone={UserCog}
                    titulo="Equipe"
                    descricao="A gestão de usuários, cargos e permissões está sendo implantada. Por enquanto, cadastre funcionários em Configurações › Equipe."
                  />
                </RotaModulo>
              }
            />
            <Route
              path="reports"
              element={
                <RotaModulo permissao="reports.view">
                  <ModuloEmImplantacaoPage
                    icone={BarChart3}
                    titulo="Relatórios"
                    descricao="Os relatórios operacionais estão sendo implantados."
                  />
                </RotaModulo>
              }
            />
            <Route
              path="settings"
              element={
                <RotaModulo permissao="settings.manage">
                  <ConfiguracoesPage />
                </RotaModulo>
              }
            />

            <Route path="*" element={<NaoEncontradoPage voltarPara="/app" />} />
          </Route>
        </Routes>
      </GuardaEmpresa>
    </CompanyProvider>
  );
}
