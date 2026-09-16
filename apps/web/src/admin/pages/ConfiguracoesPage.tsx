import { useAuth } from "@/auth/AuthContext";

export function ConfiguracoesPage() {
  const { nome } = useAuth();

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Configurações</h1>
        <p className="mt-1 text-sm text-text-secondary">Dados da sua conta de super admin.</p>
      </div>

      <div className="mt-6 max-w-md rounded-xl border border-border bg-panel p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Nome</p>
        <p className="mt-1 text-sm text-text-primary">{nome ?? "—"}</p>
        <p className="mt-4 text-xs text-text-muted">
          A criação de outros super admins deve ser feita por processo administrativo direto no
          banco, nunca por formulário público — isso é intencional por segurança.
        </p>
      </div>
    </div>
  );
}
