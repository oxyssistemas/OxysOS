import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileSignature,
  HardDrive,
  LayoutDashboard,
  Package,
  Settings,
  UserCog,
  Users2,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ChaveFeature, ChavePermissao } from "./types";

export interface ItemNavegacao {
  rota: string;
  label: string;
  icone: LucideIcon;
  /** feature do plano exigida (public.funcionalidades.key) */
  feature?: ChaveFeature;
  /** permissão do cargo exigida (public.permissoes.chave) */
  permissao?: ChavePermissao;
  /** módulo previsto, ainda não implementado: aparece como "Em breve" se a empresa tiver a feature */
  emBreve?: boolean;
}

export interface SecaoNavegacao {
  titulo: string | null;
  itens: ItemNavegacao[];
}

export const SECOES_NAVEGACAO: SecaoNavegacao[] = [
  {
    titulo: null,
    itens: [{ rota: "/app", label: "Dashboard", icone: LayoutDashboard, permissao: "dashboard.view" }],
  },
  {
    titulo: "Operação",
    itens: [
      {
        rota: "/app/service-orders",
        label: "Ordens de Serviço",
        icone: ClipboardList,
        feature: "service_orders",
        permissao: "service_orders.view",
      },
      { rota: "/app/customers", label: "Clientes", icone: Users2, feature: "customers", permissao: "customers.view" },
      {
        rota: "/app/technicians",
        label: "Técnicos",
        icone: Wrench,
        feature: "technicians",
        permissao: "technicians.view",
      },
      { rota: "/app/assets", label: "Equipamentos", icone: HardDrive, feature: "assets", permissao: "assets.view" },
      { rota: "/app/calendar", label: "Agenda", icone: CalendarDays, feature: "calendar", emBreve: true },
      // Orçamentos ainda não tem feature no catálogo: só aparecerá quando existir
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { rota: "/app/team", label: "Equipe", icone: UserCog, permissao: "team.manage" },
      { rota: "/app/reports", label: "Relatórios", icone: BarChart3, permissao: "reports.view" },
      { rota: "/app/inventory", label: "Estoque", icone: Package, feature: "inventory", emBreve: true },
      { rota: "/app/contracts", label: "Contratos", icone: FileSignature, feature: "contracts", emBreve: true },
      { rota: "/app/finance", label: "Financeiro", icone: Wallet, feature: "finance", emBreve: true },
    ],
  },
  {
    titulo: "Sistema",
    itens: [{ rota: "/app/settings", label: "Configurações", icone: Settings, permissao: "settings.manage" }],
  },
];

export function itemVisivel(
  item: ItemNavegacao,
  hasFeature: (f: string) => boolean,
  can: (p: ChavePermissao) => boolean,
): boolean {
  if (item.feature && !hasFeature(item.feature)) return false;
  if (item.permissao && !can(item.permissao)) return false;
  return true;
}

/** Título da página atual para a Topbar (rota mais específica que casar). */
export function tituloDaRota(pathname: string): string {
  const itens = SECOES_NAVEGACAO.flatMap((s) => s.itens).sort((a, b) => b.rota.length - a.rota.length);
  const item = itens.find(
    (i) => pathname === i.rota || (i.rota !== "/app" && pathname.startsWith(`${i.rota}/`)),
  );
  return item?.label ?? "Portal";
}
