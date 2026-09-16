import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@oxys/shared/components/Toast";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RedirecionarPorPapel, RequerSessao } from "./auth/RequerSessao";
import { NaoEncontradoPage } from "./app/pages/NaoEncontradoPage";
import { TelaCarregando } from "./components/TelaCarregando";

// Cada portal em seu próprio chunk: usuário da empresa não baixa o código do Super Admin e vice-versa
const AdminApp = lazy(() => import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })));
const PortalEmpresa = lazy(() => import("./app/PortalEmpresa").then((m) => ({ default: m.PortalEmpresa })));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<TelaCarregando />}>
            <Routes>
              <Route path="/" element={<RedirecionarPorPapel />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/admin/*"
                element={
                  <RequerSessao>
                    <AdminApp />
                  </RequerSessao>
                }
              />
              <Route
                path="/app/*"
                element={
                  <RequerSessao>
                    <PortalEmpresa />
                  </RequerSessao>
                }
              />
              <Route path="*" element={<NaoEncontradoPage telaCheia />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
