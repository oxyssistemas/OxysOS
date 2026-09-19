import type { ChavePermissao } from "../types";

/** Espelha public.papel_usuario (super_admin não aparece no portal da empresa). */
export type PapelUsuario = "super_admin" | "gerente" | "funcionario";

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  super_admin: "Super Admin",
  gerente: "Responsável pela empresa",
  funcionario: "Usuário da equipe",
};

export interface CargoResumo {
  id: string;
  nome: string;
  /** cargos padrão têm chave estável; personalizados, null */
  chave: string | null;
  sistema: boolean;
  ativo: boolean;
}

export interface UsuarioEquipe {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  ativo: boolean;
  criado_em: string;
  /** último login (auth), null se nunca acessou */
  ultimo_acesso: string | null;
  eh_voce: boolean;
  cargo: CargoResumo | null;
}

export interface PermissaoCatalogo {
  chave: ChavePermissao;
  modulo: string;
  descricao: string;
  feature_key: string | null;
  /** o plano da empresa inclui a funcionalidade */
  disponivel: boolean;
}

export interface CargoEquipe {
  id: string;
  nome: string;
  chave: string | null;
  descricao: string | null;
  sistema: boolean;
  ativo: boolean;
  versao: number;
  permissoes: ChavePermissao[];
  usuarios: number;
  seu_cargo: boolean;
}

export interface CargosPermissoes {
  permissoes: PermissaoCatalogo[];
  cargos: CargoEquipe[];
}

export const ROTULO_MODULO: Record<string, string> = {
  dashboard: "Dashboard",
  customers: "Clientes",
  assets: "Equipamentos",
  service_orders: "Ordens de serviço",
  technicians: "Técnicos",
  team: "Equipe",
  reports: "Relatórios",
  settings: "Configurações",
};

export interface DadosUsuarioForm {
  nome: string;
  email: string;
  senha: string;
  cargo_id: string;
}

export interface DadosAcessoForm {
  email: string;
  senha: string;
}

export interface DadosCargoForm {
  nome: string;
  descricao: string;
  permissoes: ChavePermissao[];
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

export function formatarUltimoAcesso(iso: string | null): string {
  if (!iso) return "Nunca acessou";
  const segundos = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(segundos);
  if (abs < 60) return "agora";
  if (abs < 3600) return relativo.format(Math.round(segundos / 60), "minute");
  if (abs < 86_400) return relativo.format(Math.round(segundos / 3600), "hour");
  if (abs < 7 * 86_400) return relativo.format(Math.round(segundos / 86_400), "day");
  return dataHora.format(new Date(iso));
}

export function formatarDataHora(iso: string): string {
  return dataHora.format(new Date(iso));
}
