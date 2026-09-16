import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Field } from "@oxys/shared/components/Field";
import { useAuth } from "./AuthContext";
import { TelaCarregando } from "@/components/TelaCarregando";

export function LoginPage() {
  const { session, carregando, entrar } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (carregando) return <TelaCarregando />;

  if (session) {
    const destino = (location.state as { de?: string } | null)?.de ?? "/";
    return <Navigate to={destino} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold text-text-primary">Oxys OS</p>
          <p className="mt-1 text-sm text-text-secondary">Entre com seu e-mail e senha</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-border bg-panel p-6"
          noValidate
        >
          <Field
            id="email"
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            id="senha"
            label="Senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />

          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || !email || !senha}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
