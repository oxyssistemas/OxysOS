import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { TelaCarregando } from "@/components/TelaCarregando";
import { obterDestinoInicial } from "@/technician/tecnicoService";

export function RequerSessao({ children }: { children: ReactNode }) {
  const { session, carregando } = useAuth();
  const location = useLocation();

  if (carregando) return <TelaCarregando />;
  if (!session) {
    return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/**
 * "/" → destino decidido pelo banco (destino_inicial): papel, empresa,
 * feature do plano e permissão do cargo. O técnico cai no /technician.
 */
export function RedirecionarPorPapel() {
  const { session, carregando, papel } = useAuth();
  const [destino, setDestino] = useState<string | null>(null);

  useEffect(() => {
    if (carregando || !session || papel === "super_admin") return;
    let cancelado = false;
    obterDestinoInicial().then((d) => {
      if (cancelado) return;
      setDestino(d === "technician" ? "/technician" : d === "admin" ? "/admin" : "/app");
    });
    return () => {
      cancelado = true;
    };
  }, [carregando, session, papel]);

  if (carregando) return <TelaCarregando />;
  if (!session) return <Navigate to="/login" replace />;
  if (papel === "super_admin") return <Navigate to="/admin" replace />;
  if (!destino) return <TelaCarregando />;
  return <Navigate to={destino} replace />;
}
