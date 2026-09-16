import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { PortalSidebar } from "./PortalSidebar";
import { PortalTopbar } from "./PortalTopbar";

export function PortalLayout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const fecharMenu = useCallback(() => setMenuAberto(false), []);
  const abrirMenu = useCallback(() => setMenuAberto(true), []);

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <PortalSidebar aberta={menuAberto} onFechar={fecharMenu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopbar onAbrirMenu={abrirMenu} />
        <main id="conteudo" className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
