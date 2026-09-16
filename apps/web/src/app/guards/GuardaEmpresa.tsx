import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { AlertTriangle, Ban, CreditCard, Hourglass, PauseCircle, RefreshCw, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { useCompany } from "../context/CompanyContext";
import type { SituacaoAcesso } from "../types";

interface MensagemBloqueio {
  icone: LucideIcon;
  tom: "neutro" | "alerta" | "perigo";
  titulo: string;
  descricao: string;
}

const MENSAGENS: Record<Exclude<SituacaoAcesso, "liberado" | "super_admin">, MensagemBloqueio> = {
  sem_perfil: {
    icone: UserX,
    tom: "perigo",
    titulo: "Acesso não configurado",
    descricao: "Este login não está vinculado a nenhuma empresa do Oxys OS.",
  },
  usuario_inativo: {
    icone: UserX,
    tom: "perigo",
    titulo: "Usuário desativado",
    descricao: "Seu acesso foi desativado pelo responsável da empresa.",
  },
  loja_inexistente: {
    icone: UserX,
    tom: "perigo",
    titulo: "Empresa não encontrada",
    descricao: "Não localizamos a empresa vinculada a este login. Fale com o suporte.",
  },
  loja_suspensa: {
    icone: PauseCircle,
    tom: "alerta",
    titulo: "Conta temporariamente suspensa.",
    descricao: "Seus dados estão preservados. Entre em contato com o suporte do Oxys OS para reativar o acesso.",
  },
  loja_cancelada: {
    icone: Ban,
    tom: "perigo",
    titulo: "Conta cancelada",
    descricao: "O acesso operacional desta empresa foi encerrado. Fale com o suporte do Oxys OS.",
  },
  sem_assinatura: {
    icone: CreditCard,
    tom: "alerta",
    titulo: "Assinatura não configurada",
    descricao: "A assinatura desta empresa ainda não foi ativada. Fale com o suporte do Oxys OS.",
  },
  trial_expirado: {
    icone: Hourglass,
    tom: "alerta",
    titulo: "Seu período de teste terminou",
    descricao: "Seus dados estão preservados. Contrate um plano com o suporte do Oxys OS para continuar usando.",
  },
  pagamento_pendente: {
    icone: CreditCard,
    tom: "alerta",
    titulo: "Pagamento pendente",
    descricao: "Há uma pendência na assinatura. Regularize com o suporte do Oxys OS para liberar o acesso.",
  },
  assinatura_suspensa: {
    icone: PauseCircle,
    tom: "alerta",
    titulo: "Conta temporariamente suspensa.",
    descricao: "A assinatura está suspensa. Seus dados estão preservados. Fale com o suporte do Oxys OS.",
  },
  assinatura_cancelada: {
    icone: Ban,
    tom: "perigo",
    titulo: "Assinatura cancelada",
    descricao: "Seus dados estão preservados. Fale com o suporte do Oxys OS para reativar.",
  },
};

/**
 * Autenticado? → pertence à empresa? → usuário ativo? → empresa ativa? →
 * assinatura/trial válido? Só então libera o portal. As mesmas regras valem no banco.
 */
export function GuardaEmpresa({ children }: { children: ReactNode }) {
  const { sair } = useAuth();
  const { carregando, erro, situacao, recarregar } = useCompany();

  if (carregando) return <TelaCarregando />;

  const botaoSair = (
    <button
      onClick={sair}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5"
    >
      Sair
    </button>
  );

  if (erro || !situacao) {
    return (
      <TelaAviso
        telaCheia
        icone={AlertTriangle}
        tom="perigo"
        titulo="Algo deu errado"
        descricao={erro ?? "Não foi possível carregar os dados da empresa."}
        acoes={
          <>
            <button
              onClick={recarregar}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Tentar novamente
            </button>
            {botaoSair}
          </>
        }
      />
    );
  }

  if (situacao === "super_admin") return <Navigate to="/admin" replace />;
  if (situacao === "liberado") return <>{children}</>;

  const mensagem = MENSAGENS[situacao];
  return (
    <TelaAviso
      telaCheia
      icone={mensagem.icone}
      tom={mensagem.tom}
      titulo={mensagem.titulo}
      descricao={mensagem.descricao}
      acoes={botaoSair}
    />
  );
}
