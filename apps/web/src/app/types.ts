import type { PapelUsuario } from "@/auth/AuthContext";

/** Retorno de public.loja_situacao_acesso() + estados do usuário. */
export type SituacaoAcesso =
  | "liberado"
  | "super_admin"
  | "sem_perfil"
  | "usuario_inativo"
  | "loja_inexistente"
  | "loja_suspensa"
  | "loja_cancelada"
  | "sem_assinatura"
  | "trial_expirado"
  | "pagamento_pendente"
  | "assinatura_suspensa"
  | "assinatura_cancelada";

/** Espelha a tabela public.permissoes. */
export type ChavePermissao =
  | "dashboard.view"
  | "customers.view"
  | "customers.create"
  | "customers.edit"
  | "customers.archive"
  | "assets.view"
  | "assets.create"
  | "assets.edit"
  | "assets.archive"
  | "service_orders.view"
  | "service_orders.create"
  | "service_orders.edit"
  | "service_orders.assign"
  | "service_orders.finish"
  | "service_orders.cancel"
  | "technicians.view"
  | "technicians.manage"
  | "team.manage"
  | "reports.view"
  | "settings.manage";

/** Chaves de public.funcionalidades usadas pelo portal. */
export type ChaveFeature =
  | "service_orders"
  | "customers"
  | "technicians"
  | "assets"
  | "calendar"
  | "inventory"
  | "finance"
  | "contracts"
  | "advanced_reports";

export type ChaveCargoSistema = "owner" | "manager" | "attendant" | "technician" | "finance" | "inventory";

export interface ContextoEmpresaRpc {
  situacao: SituacaoAcesso;
  usuario?: {
    id: string;
    nome: string;
    email: string;
    papel: PapelUsuario;
    cargo: { id: string; nome: string; chave: ChaveCargoSistema | null } | null;
  };
  empresa?: {
    id: string;
    nome: string;
    cnpj: string | null;
    telefone: string | null;
    cidade: string | null;
    estado: string | null;
    status: "ativa" | "suspensa" | "cancelada";
  } | null;
  segmento?: { id: string; nome: string; slug: string } | null;
  assinatura?: {
    status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
    ciclo_cobranca: "mensal" | "anual";
    trial_termina_em: string | null;
    periodo_atual_fim: string | null;
    plano: { id: string; nome: string };
  } | null;
  filial?: null;
  features?: string[];
  permissoes?: ChavePermissao[];
}
