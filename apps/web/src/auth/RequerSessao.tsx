import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { TelaCarregando } from "@/components/TelaCarregando";

export function RequerSessao({ children }: { children: ReactNode }) {
  const { session, carregando } = useAuth();
  const location = useLocation();

  if (carregando) return <TelaCarregando />;
  if (!session) {
    return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** "/" → destino conforme o papel registrado no banco. */
export function RedirecionarPorPapel() {
  const { session, carregando, papel } = useAuth();

  if (carregando) return <TelaCarregando />;
  if (!session) return <Navigate to="/login" replace />;
  if (papel === "super_admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/app" replace />;
}
