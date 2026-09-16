import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, PackageX } from "lucide-react";
import { TelaAviso } from "@/components/TelaAviso";
import { useCompany } from "../context/CompanyContext";
import type { ChaveFeature, ChavePermissao } from "../types";

interface RotaModuloProps {
  feature?: ChaveFeature;
  permissao?: ChavePermissao;
  children: ReactNode;
}

const VOLTAR = (
  <Link
    to="/app"
    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5"
  >
    Voltar ao início
  </Link>
);

/**
 * Bloqueia a rota na interface quando a feature do plano ou a permissão do cargo
 * não estão presentes (acesso por URL digitada). O banco nega os dados de qualquer forma.
 */
export function RotaModulo({ feature, permissao, children }: RotaModuloProps) {
  const { hasFeature, can } = useCompany();

  if (feature && !hasFeature(feature)) {
    return (
      <TelaAviso
        icone={PackageX}
        titulo="Módulo não disponível no seu plano"
        descricao="Fale com o suporte do Oxys OS para conhecer os planos que incluem este módulo."
        acoes={VOLTAR}
      />
    );
  }

  if (permissao && !can(permissao)) {
    return (
      <TelaAviso
        icone={Lock}
        tom="alerta"
        titulo="Você não tem permissão para acessar esta área"
        descricao="Peça ao responsável pela empresa para revisar as permissões do seu cargo."
        acoes={VOLTAR}
      />
    );
  }

  return <>{children}</>;
}
