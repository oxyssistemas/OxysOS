import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ExternalLink, LogOut, Mail, Phone, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { useTecnico } from "../TecnicoContext";
import { DIAS_SEMANA_CURTOS } from "../tipos";

export function PerfilTecnicoPage() {
  const { dados } = useTecnico();
  const { sair } = useAuth();
  const { fila } = useSincronizacao();
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const naoEnviadas = fila.length;
  const tecnico = dados?.tecnico;
  const jornada = dados?.jornada ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">{tecnico?.nome ?? "Meu perfil"}</h1>
        <p className="mt-0.5 text-sm text-text-secondary">{dados?.usuario?.cargo ?? "Técnico"}</p>
      </div>

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-text-primary">Dados de acesso</h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-text-secondary">
          <li className="flex items-center gap-2">
            <Mail size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="truncate">{dados?.usuario?.email}</span>
          </li>
          {tecnico?.telefone && (
            <li className="flex items-center gap-2">
              <Phone size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
              {tecnico.telefone}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Building2 size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
            <span className="truncate">{dados?.empresa?.nome}</span>
          </li>
        </ul>
      </section>

      {(tecnico?.especialidades.length ?? 0) > 0 && (
        <section className="rounded-xl border border-border bg-panel p-4">
          <h2 className="text-sm font-semibold text-text-primary">Especialidades</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tecnico?.especialidades.map((e) => (
              <span key={e} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-text-secondary">
                {e}
              </span>
            ))}
          </div>
        </section>
      )}

      {(dados?.equipes?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-border bg-panel p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Users size={14} aria-hidden="true" /> Equipes
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dados?.equipes?.map((e) => (
              <span key={e.id} className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-text-secondary">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.cor }} aria-hidden="true" />
                {e.nome}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            Você também vê os atendimentos marcados para as suas equipes.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-border bg-panel p-4">
        <h2 className="text-sm font-semibold text-text-primary">Minha jornada</h2>
        {jornada.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            Sem jornada cadastrada — a empresa pode agendar em qualquer horário.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
            {jornada.map((t, i) => (
              <li key={`${t.dia_semana}-${t.inicio}-${i}`} className="flex justify-between">
                <span className="capitalize">{DIAS_SEMANA_CURTOS[t.dia_semana]}</span>
                <span className="tabular-nums">
                  {t.inicio} – {t.fim}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-text-muted">Jornada e ausências são ajustadas pela empresa.</p>
      </section>

      <div className="flex flex-col gap-2">
        {dados?.acesso_portal_empresa && (
          <Link
            to="/app"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            <ExternalLink size={15} aria-hidden="true" /> Abrir o portal da empresa
          </Link>
        )}
        <button
          onClick={() => (naoEnviadas > 0 ? setConfirmarSaida(true) : sair())}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/10 text-sm font-medium text-danger"
        >
          <LogOut size={15} aria-hidden="true" /> Sair
        </button>
      </div>
      <ConfirmDialog
        aberto={confirmarSaida}
        titulo="Sair com alterações não enviadas?"
        descricao={`${naoEnviadas === 1 ? "1 alteração feita sem internet ainda não chegou" : `${naoEnviadas} alterações feitas sem internet ainda não chegaram`} ao servidor. Ao sair, elas são apagadas deste aparelho.`}
        textoConfirmar="Sair e apagar"
        tom="perigo"
        onConfirmar={() => sair()}
        onCancelar={() => setConfirmarSaida(false)}
      />
    </div>
  );
}
