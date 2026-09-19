import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  ClipboardX,
  Flag,
  HardDrive,
  MapPin,
  Package,
  Paperclip,
  Pencil,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  Tags,
  UserCog,
  UserMinus,
  UserPlus,
  Users2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ItemAtividade } from "../dashboardService";

interface Descricao {
  icone: LucideIcon;
  /** partes do texto; objetos são nomes em destaque (com link opcional) */
  partes: (string | { destaque: string; link?: string })[];
}

function descrever(item: ItemAtividade): Descricao {
  const autor = { destaque: item.usuario ?? "Sistema" };
  const clienteDaOs = item.os?.cliente ? { destaque: item.os.cliente } : null;
  // "a OS OS-2026-000001 de Cliente" com link para o detalhe
  const os = item.os
    ? [
        " ",
        { destaque: item.os.numero ?? "OS", link: `/app/service-orders/${item.os.id}` },
        ...(clienteDaOs ? [" de ", clienteDaOs] : []),
      ]
    : [];

  switch (item.acao) {
    case "os_criada":
      return {
        icone: ClipboardPlus,
        partes: item.os
          ? [autor, " abriu a ", { destaque: item.os.numero ?? "OS", link: `/app/service-orders/${item.os.id}` }, ...(clienteDaOs ? [" para ", clienteDaOs] : [])]
          : [autor, " abriu uma OS"],
      };
    case "os_status_alterado":
      return {
        icone: RefreshCcw,
        partes: [
          autor,
          " alterou a",
          ...os,
          ...(item.status_novo ? [" para ", { destaque: item.status_novo }] : []),
        ],
      };
    case "os_local_alterado":
      return {
        icone: MapPin,
        partes: [autor, " alterou o local de atendimento da", ...os],
      };
    case "os_prioridade_alterada":
      return {
        icone: Flag,
        partes: [autor, " alterou a prioridade da", ...os],
      };
    case "os_tipo_servico_alterado":
      return {
        icone: Tags,
        partes: [autor, " alterou o tipo de serviço da", ...os],
      };
    case "os_reparo_iniciado":
      return {
        icone: PlayCircle,
        partes: [autor, " iniciou o atendimento da", ...os],
      };
    case "os_concluida":
      return {
        icone: CheckCircle2,
        partes: [autor, " finalizou a", ...os],
      };
    case "os_atualizada":
      return { icone: Pencil, partes: [autor, " editou a", ...os] };
    case "os_tecnico_atribuido":
      return {
        icone: UserCog,
        partes: [autor, " atribuiu ", { destaque: item.tecnico ?? "um técnico" }, " à", ...os],
      };
    case "os_tecnico_removido":
      return { icone: UserCog, partes: [autor, " removeu o técnico da", ...os] };
    case "os_item_adicionado":
    case "os_item_alterado":
    case "os_item_removido":
      return {
        icone: Package,
        partes: [
          autor,
          item.acao === "os_item_adicionado" ? " adicionou " : item.acao === "os_item_alterado" ? " alterou " : " removeu ",
          { destaque: item.item ?? "um item" },
          item.acao === "os_item_adicionado" ? " na" : " da",
          ...os,
        ],
      };
    case "os_anexo_adicionado":
    case "os_anexo_removido":
      return {
        icone: Paperclip,
        partes: [
          autor,
          item.acao === "os_anexo_adicionado" ? " anexou " : " removeu ",
          { destaque: item.arquivo ?? "um arquivo" },
          item.acao === "os_anexo_adicionado" ? " na" : " da",
          ...os,
        ],
      };
    case "os_checklist_aplicado":
    case "os_checklist_concluido":
    case "os_checklist_removido":
      return {
        icone: item.acao === "os_checklist_concluido" ? ClipboardCheck : item.acao === "os_checklist_aplicado" ? ClipboardList : ClipboardX,
        partes: [
          autor,
          item.acao === "os_checklist_aplicado" ? " aplicou o checklist " : item.acao === "os_checklist_concluido" ? " completou o checklist " : " removeu o checklist ",
          { destaque: item.checklist ?? "—" },
          item.acao === "os_checklist_removido" ? " da" : " na",
          ...os,
        ],
      };
    case "cliente_cadastrado":
      return {
        icone: Users2,
        partes: [
          autor,
          " cadastrou o cliente ",
          { destaque: item.cliente ?? "(removido)", link: item.cliente_id ? `/app/customers/${item.cliente_id}` : undefined },
        ],
      };
    case "tecnico_cadastrado":
      return {
        icone: Wrench,
        partes: [
          autor,
          " cadastrou o técnico ",
          {
            destaque: item.tecnico ?? "(removido)",
            link: item.tecnico ? `/app/technicians?q=${encodeURIComponent(item.tecnico)}&status=todos` : undefined,
          },
        ],
      };
    case "equipamento_cadastrado":
      return {
        icone: HardDrive,
        partes: [
          autor,
          " adicionou o equipamento ",
          {
            destaque: item.equipamento ?? "(removido)",
            link: item.equipamento_id ? `/app/assets/${item.equipamento_id}` : undefined,
          },
          ...(item.cliente ? [" de ", { destaque: item.cliente, link: item.cliente_id ? `/app/customers/${item.cliente_id}` : undefined }] : []),
        ],
      };
    case "funcionario_criado":
      return {
        icone: UserPlus,
        partes: [autor, " cadastrou o usuário ", { destaque: item.funcionario ?? "(removido)" }],
      };
    case "funcionario_cargo_alterado":
      return {
        icone: ShieldCheck,
        partes: [autor, " alterou o cargo de ", { destaque: item.funcionario ?? "(removido)" }],
      };
    case "funcionario_desativado":
    case "funcionario_reativado":
      return {
        icone: UserMinus,
        partes: [
          autor,
          item.acao === "funcionario_desativado" ? " desativou o acesso de " : " reativou o acesso de ",
          { destaque: item.funcionario ?? "(removido)" },
        ],
      };
    case "funcionario_atualizado":
      return { icone: UserCog, partes: [autor, " atualizou o usuário ", { destaque: item.funcionario ?? "(removido)" }] };
    default:
      return { icone: RefreshCcw, partes: [autor, " registrou uma atividade"] };
  }
}

const formatoRelativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const formatoAbsoluto = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function tempoRelativo(iso: string, agora: number): string {
  const segundos = Math.round((new Date(iso).getTime() - agora) / 1000);
  const abs = Math.abs(segundos);
  if (abs < 60) return "agora";
  if (abs < 3600) return formatoRelativo.format(Math.round(segundos / 60), "minute");
  if (abs < 86_400) return formatoRelativo.format(Math.round(segundos / 3600), "hour");
  if (abs < 7 * 86_400) return formatoRelativo.format(Math.round(segundos / 86_400), "day");
  return formatoAbsoluto.format(new Date(iso));
}

export function AtividadeRecente({ itens }: { itens: ItemAtividade[] }) {
  const agora = Date.now();

  return (
    <ol className="flex flex-col">
      {itens.map((item, indice) => {
        const { icone: Icone, partes } = descrever(item);
        return (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {indice < itens.length - 1 && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-border" aria-hidden="true" />
            )}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-text-secondary">
              <Icone size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm text-text-secondary">
                {partes.map((parte, i) =>
                  typeof parte === "string" ? (
                    <span key={i}>{parte}</span>
                  ) : parte.link ? (
                    <Link key={i} to={parte.link} className="font-medium text-text-primary hover:text-accent">
                      {parte.destaque}
                    </Link>
                  ) : (
                    <span key={i} className="font-medium text-text-primary">
                      {parte.destaque}
                    </span>
                  ),
                )}
              </p>
              <time
                dateTime={item.criado_em}
                title={formatoAbsoluto.format(new Date(item.criado_em))}
                className="text-xs text-text-muted"
              >
                {tempoRelativo(item.criado_em, agora)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
