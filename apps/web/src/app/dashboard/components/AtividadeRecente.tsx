import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardPlus, PlayCircle, RefreshCcw, UserPlus, Users2, type LucideIcon } from "lucide-react";
import type { ItemAtividade } from "../dashboardService";

interface Descricao {
  icone: LucideIcon;
  /** partes do texto; objetos são nomes em destaque (com link opcional) */
  partes: (string | { destaque: string; link?: string })[];
}

function descrever(item: ItemAtividade): Descricao {
  const autor = { destaque: item.usuario ?? "Sistema" };
  const clienteDaOs = item.os?.cliente ? { destaque: item.os.cliente } : null;

  switch (item.acao) {
    case "os_criada":
      return {
        icone: ClipboardPlus,
        partes: clienteDaOs ? [autor, " abriu uma OS para ", clienteDaOs] : [autor, " abriu uma OS"],
      };
    case "os_status_alterado":
      return {
        icone: RefreshCcw,
        partes: [
          autor,
          " alterou a OS",
          ...(clienteDaOs ? [" de ", clienteDaOs] : []),
          ...(item.status_novo ? [" para ", { destaque: item.status_novo }] : []),
        ],
      };
    case "os_reparo_iniciado":
      return {
        icone: PlayCircle,
        partes: [autor, " iniciou o atendimento da OS", ...(clienteDaOs ? [" de ", clienteDaOs] : [])],
      };
    case "os_concluida":
      return {
        icone: CheckCircle2,
        partes: [autor, " finalizou a OS", ...(clienteDaOs ? [" de ", clienteDaOs] : [])],
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
    case "funcionario_criado":
      return {
        icone: UserPlus,
        partes: [autor, " cadastrou o usuário ", { destaque: item.funcionario ?? "(removido)" }],
      };
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
