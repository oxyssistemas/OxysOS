import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { TelaAviso } from "@/components/TelaAviso";
import { DashboardPage } from "./pages/DashboardPage";
import { EmpresasPage } from "./pages/EmpresasPage";
import { GerentesPage } from "./pages/GerentesPage";
import { SegmentosPage } from "./pages/SegmentosPage";
import { PlanosPage } from "./pages/PlanosPage";
import { FuncionalidadesPage } from "./pages/FuncionalidadesPage";
import { AssinaturasPage } from "./pages/AssinaturasPage";
import { LogsPage } from "./pages/LogsPage";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";
import { Sidebar, type Pagina } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";

const TITULOS: Record<Pagina, string> = {
  dashboard: "Dashboard",
  empresas: "Empresas",
  gerentes: "Gerentes",
  segmentos: "Segmentos",
  planos: "Planos",
  funcionalidades: "Módulos",
  assinaturas: "Assinaturas",
  logs: "Logs",
  configuracoes: "Configurações",
};

function PainelSuperAdmin() {
  const [pagina, setPagina] = useState<Pagina>("dashboard");
  const [menuAberto, setMenuAberto] = useState(false);

  function renderizarPagina() {
    switch (pagina) {
      case "dashboard":
        return <DashboardPage />;
      case "empresas":
        return <EmpresasPage />;
      case "gerentes":
        return <GerentesPage />;
      case "segmentos":
        return <SegmentosPage />;
      case "planos":
        return <PlanosPage />;
      case "funcionalidades":
        return <FuncionalidadesPage />;
      case "assinaturas":
        return <AssinaturasPage />;
      case "logs":
        return <LogsPage />;
      case "configuracoes":
        return <ConfiguracoesPage />;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <Sidebar
        paginaAtual={pagina}
        onNavegar={setPagina}
        aberta={menuAberto}
        onFechar={() => setMenuAberto(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar caminho={TITULOS[pagina]} onAbrirMenu={() => setMenuAberto(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-8 md:px-8">{renderizarPagina()}</main>
      </div>
    </div>
  );
}

/** /admin — exclusivo do super admin (RLS garante no banco; aqui é só navegação). */
export function AdminApp() {
  const { ehSuperAdmin, lojaId, sair } = useAuth();

  if (!ehSuperAdmin) {
    return (
      <TelaAviso
        telaCheia
        tom="perigo"
        icone={ShieldAlert}
        titulo="Acesso restrito"
        descricao="Esta área é exclusiva para o super admin do Oxys OS."
        acoes={
          <>
            {lojaId && (
              <Link
                to="/app"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Ir para o portal da empresa
              </Link>
            )}
            <button
              onClick={sair}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5"
            >
              Sair
            </button>
          </>
        }
      />
    );
  }

  return <PainelSuperAdmin />;
}
