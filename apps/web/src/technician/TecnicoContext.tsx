import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthContext";
import { ehErroRede } from "@/lib/erros";
import { obterContextoTecnico } from "./tecnicoService";
import { contextoGuardado, guardarContexto } from "./offline/estado";
import type { ContextoTecnico, PermissaoCampo } from "./tipos";

interface TecnicoContextValue {
  carregando: boolean;
  erro: string | null;
  dados: ContextoTecnico | null;
  /** permissão de campo do cargo (o banco confere de novo em cada ação) */
  pode: (permissao: PermissaoCampo) => boolean;
  recarregar: () => Promise<void>;
}

const TecnicoContext = createContext<TecnicoContextValue | undefined>(undefined);

/**
 * Uma chamada (contexto_tecnico) resolve empresa, técnico, equipes e
 * permissões de campo. Serve só para a interface: quem autoriza é o banco.
 */
export function TecnicoProvider({ children }: { children: ReactNode }) {
  const { usuarioId, session } = useAuth();
  // sem internet o perfil não carrega; o id da sessão guardada basta para achar a cópia
  const idSessao = session?.user.id ?? null;
  const [dados, setDados] = useState<ContextoTecnico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const contexto = await obterContextoTecnico();
      setDados(contexto);
      // só guarda para abrir offline se o plano tiver a feature (§50)
      if (idSessao && contexto.situacao === "liberado" && contexto.offline) guardarContexto(idSessao, contexto);
    } catch (e) {
      const copia = idSessao && (ehErroRede(e) || !navigator.onLine) ? contextoGuardado<ContextoTecnico>(idSessao) : null;
      if (copia) {
        setDados(copia);
      } else {
        setDados(null);
        setErro(e instanceof Error ? e.message : "Não foi possível carregar seu acesso.");
      }
    } finally {
      setCarregando(false);
    }
  }, [idSessao]);

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [usuarioId, carregar]);

  const valor = useMemo<TecnicoContextValue>(() => {
    const permissoes = new Set(dados?.permissoes ?? []);
    return {
      carregando,
      erro,
      dados,
      pode: (permissao) => permissoes.has(permissao),
      recarregar: carregar,
    };
  }, [carregando, erro, dados, carregar]);

  return <TecnicoContext.Provider value={valor}>{children}</TecnicoContext.Provider>;
}

export function useTecnico(): TecnicoContextValue {
  const ctx = useContext(TecnicoContext);
  if (!ctx) throw new Error("useTecnico precisa estar dentro de TecnicoProvider.");
  return ctx;
}
