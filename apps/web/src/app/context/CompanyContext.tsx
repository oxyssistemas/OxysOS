import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@oxys/shared/supabase";
import { useAuth } from "@/auth/AuthContext";
import type { ChavePermissao, ContextoEmpresaRpc, SituacaoAcesso } from "../types";

interface CompanyContextValue {
  carregando: boolean;
  erro: string | null;
  situacao: SituacaoAcesso | null;
  company: ContextoEmpresaRpc["empresa"];
  branch: null;
  segment: ContextoEmpresaRpc["segmento"];
  subscription: ContextoEmpresaRpc["assinatura"];
  currentUser: ContextoEmpresaRpc["usuario"] | null;
  features: ReadonlySet<string>;
  permissions: ReadonlySet<string>;
  /** Feature do plano da empresa atual (a empresa é sempre a do usuário logado). */
  hasFeature: (featureKey: string) => boolean;
  /** Permissão do cargo do usuário atual. */
  can: (permissao: ChavePermissao) => boolean;
  recarregar: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

const VAZIO: ReadonlySet<string> = new Set();

/**
 * Carrega em uma única chamada (RPC obter_contexto_empresa) empresa, segmento,
 * assinatura, situação de acesso, features e permissões — tudo resolvido no
 * servidor a partir do usuário autenticado. Serve só para a interface decidir
 * o que exibir: o banco nega por conta própria qualquer acesso não autorizado.
 */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const { usuarioId } = useAuth();
  const [dados, setDados] = useState<ContextoEmpresaRpc | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    const { data, error } = await supabase.rpc("obter_contexto_empresa");
    if (error) {
      console.error("[CompanyContext] falha ao carregar contexto", error);
      setErro("Não foi possível carregar os dados da empresa. Tente novamente.");
      setDados(null);
    } else {
      setDados(data as ContextoEmpresaRpc);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [usuarioId, carregar]);

  // Assinatura/plano/permissões podem mudar no Super Admin enquanto a aba está aberta
  useEffect(() => {
    function aoVoltarParaAba() {
      if (document.visibilityState === "visible") carregar();
    }
    document.addEventListener("visibilitychange", aoVoltarParaAba);
    return () => document.removeEventListener("visibilitychange", aoVoltarParaAba);
  }, [carregar]);

  const value = useMemo<CompanyContextValue>(() => {
    const features = dados?.features ? new Set(dados.features) : VAZIO;
    const permissions = dados?.permissoes ? new Set<string>(dados.permissoes) : VAZIO;
    return {
      carregando,
      erro,
      situacao: dados?.situacao ?? null,
      company: dados?.empresa ?? null,
      branch: null,
      segment: dados?.segmento ?? null,
      subscription: dados?.assinatura ?? null,
      currentUser: dados?.usuario ?? null,
      features,
      permissions,
      hasFeature: (featureKey) => features.has(featureKey),
      can: (permissao) => permissions.has(permissao),
      recarregar: carregar,
    };
  }, [dados, carregando, erro, carregar]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany deve ser usado dentro de CompanyProvider");
  return ctx;
}
