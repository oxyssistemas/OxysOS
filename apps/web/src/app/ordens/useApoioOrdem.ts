import { useEffect, useState } from "react";
import { useCompany } from "../context/CompanyContext";
import { listarPrioridades, listarTiposServico } from "../configuracoes/configuracaoOsService";
import type { PrioridadeOS, TipoServico } from "../configuracoes/tipos";
import { listarTecnicosAtivos } from "./ordensService";
import type { OpcaoTecnico } from "./tipos";

export interface ApoioOrdem {
  prioridades: PrioridadeOS[];
  tipos: TipoServico[];
  /** null = empresa sem o módulo de técnicos */
  tecnicos: OpcaoTecnico[] | null;
}

/** Cadastros usados nos formulários de OS (prioridades, tipos e técnicos). */
export function useApoioOrdem(): { apoio: ApoioOrdem | null; erro: string | null } {
  const { hasFeature } = useCompany();
  const comTecnicos = hasFeature("technicians");
  const [apoio, setApoio] = useState<ApoioOrdem | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([listarPrioridades(), listarTiposServico(), comTecnicos ? listarTecnicosAtivos() : Promise.resolve(null)])
      .then(([prioridades, tipos, tecnicos]) => {
        if (!cancelado) setApoio({ prioridades, tipos, tecnicos });
      })
      .catch((e) => !cancelado && setErro(e instanceof Error ? e.message : "Não foi possível carregar os cadastros."));
    return () => {
      cancelado = true;
    };
  }, [comTecnicos]);

  return { apoio, erro };
}
