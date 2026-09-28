import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock, PauseCircle, RefreshCw, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { useTecnico } from "./TecnicoContext";
import type { SituacaoPortalTecnico } from "./tipos";

interface Bloqueio {
  icone: LucideIcon;
  tom: "neutro" | "alerta" | "perigo";
  titulo: string;
  descricao: string;
}

const MENSAGENS: Record<Exclude<SituacaoPortalTecnico, "liberado">, Bloqueio> = {
  sem_sessao: {
    icone: Lock,
    tom: "perigo",
    titulo: "Sessão encerrada",
    descricao: "Entre novamente para abrir o portal do técnico.",
  },
  sem_acesso: {
    icone: PauseCircle,
    tom: "alerta",
    titulo: "Acesso indisponível",
    descricao:
      "A conta da empresa está suspensa, cancelada ou com a assinatura vencida. Fale com o responsável pela empresa.",
  },
  sem_feature: {
    icone: Lock,
    tom: "alerta",
    titulo: "Portal do técnico não incluído",
    descricao: "O plano contratado pela empresa ainda não inclui o portal do técnico.",
  },
  sem_tecnico: {
    icone: UserX,
    tom: "alerta",
    titulo: "Login sem técnico vinculado",
    descricao:
      "Este acesso não está ligado a um técnico ativo da empresa. Peça ao responsável para vincular seu usuário ao cadastro do técnico.",
  },
  sem_permissao: {
    icone: Lock,
    tom: "alerta",
    titulo: "Sem permissão para o campo",
    descricao: "Seu cargo não tem permissão para atender ordens de serviço pelo portal do técnico.",
  },
};

/** Só entra no /technician quem o banco autoriza (feature, cargo e técnico ativo). */
export function GuardaTecnico({ children }: { children: ReactNode }) {
  const { carregando, erro, dados, recarregar } = useTecnico();
  const { sair } = useAuth();

  if (carregando) return <TelaCarregando />;

  if (erro || !dados) {
    return (
      <TelaAviso
        telaCheia
        icone={AlertTriangle}
        tom="perigo"
        titulo="Não foi possível abrir o portal"
        descricao={erro ?? "Tente novamente em instantes."}
        acoes={
          <button
            onClick={() => recarregar()}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            <RefreshCw size={15} aria-hidden="true" /> Tentar novamente
          </button>
        }
      />
    );
  }

  if (dados.situacao !== "liberado") {
    const bloqueio = MENSAGENS[dados.situacao];
    return (
      <TelaAviso
        telaCheia
        icone={bloqueio.icone}
        tom={bloqueio.tom}
        titulo={bloqueio.titulo}
        descricao={bloqueio.descricao}
        acoes={
          <>
            <Link
              to="/app"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
            >
              Ir para o portal da empresa
            </Link>
            <button
              onClick={() => sair()}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Sair
            </button>
          </>
        }
      />
    );
  }

  return <>{children}</>;
}
