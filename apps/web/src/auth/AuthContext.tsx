import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";

export type PapelUsuario = "super_admin" | "gerente" | "funcionario";

interface PerfilUsuario {
  id: string;
  nome: string;
  papel: PapelUsuario;
  loja_id: string | null;
  ativo: boolean;
}

interface AuthState {
  session: Session | null;
  usuarioId: string | null;
  nome: string | null;
  papel: PapelUsuario | null;
  lojaId: string | null;
  ativo: boolean;
  ehSuperAdmin: boolean;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Sessão + perfil do usuário (tabela `usuarios`, lida via RLS).
 * O papel aqui serve apenas para decidir a navegação; toda autorização
 * real é feita no banco (RLS, tem_feature, tem_permissao).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessaoCarregada, setSessaoCarregada] = useState(false);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  // id do usuário cujo perfil já foi buscado — evita um render com sessão nova e perfil antigo/vazio
  const [perfilCarregadoPara, setPerfilCarregadoPara] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessaoCarregada(true);
    });

    // Não chamar o Supabase dentro deste callback (evita deadlock do supabase-js);
    // o perfil é carregado no efeito abaixo, reagindo à troca de usuário.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, novaSessao) => {
      setSession(novaSessao);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!sessaoCarregada) return;
    if (!userId) {
      setPerfil(null);
      setPerfilCarregadoPara(null);
      return;
    }

    let cancelado = false;
    supabase
      .from("usuarios")
      .select("id, nome, papel, loja_id, ativo")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return;
        setPerfil((data as PerfilUsuario | null) ?? null);
        setPerfilCarregadoPara(userId);
      });

    return () => {
      cancelado = true;
    };
  }, [userId, sessaoCarregada]);

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error("E-mail ou senha inválidos.");
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  const value: AuthState = {
    session,
    usuarioId: perfil?.id ?? null,
    nome: perfil?.nome ?? null,
    papel: perfil?.papel ?? null,
    lojaId: perfil?.loja_id ?? null,
    ativo: perfil?.ativo ?? false,
    ehSuperAdmin: perfil?.papel === "super_admin" && perfil.ativo,
    carregando: !sessaoCarregada || (userId !== null && perfilCarregadoPara !== userId),
    entrar,
    sair,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
