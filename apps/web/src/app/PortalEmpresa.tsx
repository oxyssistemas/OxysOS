import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { CompanyProvider } from "./context/CompanyContext";
import { GuardaEmpresa } from "./guards/GuardaEmpresa";
import { RotaModulo } from "./guards/RotaModulo";
import { PortalLayout } from "./layout/PortalLayout";
import { NaoEncontradoPage } from "./pages/NaoEncontradoPage";
import { OrdensLayout } from "./ordens/OrdensLayout";
import { ConfiguracoesInicio, ConfiguracoesLayout } from "./configuracoes/ConfiguracoesLayout";
import { EquipeLayout } from "./equipe/EquipeLayout";

// Cada página em seu próprio chunk: o portal abre sem baixar agenda, despacho, relatórios etc.
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ExecucaoPage = lazy(() => import("./legado/pages/ExecucaoPage").then((m) => ({ default: m.ExecucaoPage })));
const OrdensPage = lazy(() => import("./ordens/OrdensPage").then((m) => ({ default: m.OrdensPage })));
const NovaOrdemPage = lazy(() => import("./ordens/NovaOrdemPage").then((m) => ({ default: m.NovaOrdemPage })));
const OrdemDetalhePage = lazy(() => import("./ordens/OrdemDetalhePage").then((m) => ({ default: m.OrdemDetalhePage })));
const RelatorioTecnicoPage = lazy(() => import("./ordens/RelatorioTecnicoPage").then((m) => ({ default: m.RelatorioTecnicoPage })));
const ClientesPage = lazy(() => import("./clientes/ClientesPage").then((m) => ({ default: m.ClientesPage })));
const ClienteDetalhePage = lazy(() => import("./clientes/ClienteDetalhePage").then((m) => ({ default: m.ClienteDetalhePage })));
const TecnicosPage = lazy(() => import("./tecnicos/TecnicosPage").then((m) => ({ default: m.TecnicosPage })));
const EquipamentosPage = lazy(() => import("./equipamentos/EquipamentosPage").then((m) => ({ default: m.EquipamentosPage })));
const EquipamentoDetalhePage = lazy(() => import("./equipamentos/EquipamentoDetalhePage").then((m) => ({ default: m.EquipamentoDetalhePage })));
const EquipamentoQrPage = lazy(() => import("./equipamentos/EquipamentoQrPage").then((m) => ({ default: m.EquipamentoQrPage })));
const StatusOsPage = lazy(() => import("./configuracoes/StatusOsPage").then((m) => ({ default: m.StatusOsPage })));
const PrioridadesPage = lazy(() => import("./configuracoes/PrioridadesPage").then((m) => ({ default: m.PrioridadesPage })));
const TiposServicoPage = lazy(() => import("./configuracoes/TiposServicoPage").then((m) => ({ default: m.TiposServicoPage })));
const ChecklistsPage = lazy(() => import("./configuracoes/ChecklistsPage").then((m) => ({ default: m.ChecklistsPage })));
const CatalogoPage = lazy(() => import("./configuracoes/CatalogoPage").then((m) => ({ default: m.CatalogoPage })));
const UsuariosPage = lazy(() => import("./equipe/UsuariosPage").then((m) => ({ default: m.UsuariosPage })));
const CargosPage = lazy(() => import("./equipe/CargosPage").then((m) => ({ default: m.CargosPage })));
const RelatoriosPage = lazy(() => import("./relatorios/RelatoriosPage").then((m) => ({ default: m.RelatoriosPage })));
const AgendaPage = lazy(() => import("./agenda/AgendaPage").then((m) => ({ default: m.AgendaPage })));
const DespachoPage = lazy(() => import("./despacho/DespachoPage").then((m) => ({ default: m.DespachoPage })));

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
              path="service-orders/:id/report"
              element={
                <RotaModulo feature="service_orders" permissao="service_orders.view">
                  <RelatorioTecnicoPage />
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
              path="calendar"
              element={
                <RotaModulo feature="calendar" permissao="calendar.view">
                  <AgendaPage />
                </RotaModulo>
              }
            />

            <Route
              path="dispatch"
              element={
                <RotaModulo feature="dispatch" permissao="dispatch.view">
                  <DespachoPage />
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
                path="catalog"
                element={
                  <RotaModulo feature="service_orders">
                    <CatalogoPage />
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
