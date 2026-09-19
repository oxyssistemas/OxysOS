import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  ClipboardX,
  Flag,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  Paperclip,
  Pencil,
  PlayCircle,
  RefreshCcw,
  Send,
  Tags,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import { ROTULO_LOCAL_ATENDIMENTO } from "../../legado/components/LocalAtendimento";
import type { LocalAtendimento } from "../../legado/types";
import { adicionarComentario, obterTimeline } from "../execucaoService";
import { formatarDataHora, formatarMoeda } from "../tipos";
import { ROTULO_CAMPO_OS, type EventoTimeline } from "../tiposExecucao";

interface TimelineOrdemProps {
  osId: string;
  podeComentar: boolean;
  /** muda quando a OS é alterada, para recarregar */
  chave: string;
}

type Filtro = "todos" | "comentarios" | "status" | "arquivos" | "checklist";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Tudo" },
  { id: "comentarios", rotulo: "Comentários" },
  { id: "status", rotulo: "Status" },
  { id: "arquivos", rotulo: "Arquivos" },
  { id: "checklist", rotulo: "Checklist" },
];

const LIMITE = 300;
const LIMITE_COMENTARIO = 2000;

function pertence(ev: EventoTimeline, filtro: Filtro): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "comentarios":
      return ev.acao === "os_comentario";
    case "status":
      return ["os_criada", "os_status_alterado", "os_reparo_iniciado", "os_concluida"].includes(ev.acao);
    case "arquivos":
      return ev.acao.startsWith("os_anexo_");
    case "checklist":
      return ev.acao.startsWith("os_checklist_");
  }
}

const D = ({ children }: { children: ReactNode }) => <span className="font-medium text-text-primary">{children}</span>;

function rotuloLocal(valor: string | undefined): string {
  return valor && valor in ROTULO_LOCAL_ATENDIMENTO ? ROTULO_LOCAL_ATENDIMENTO[valor as LocalAtendimento] : (valor ?? "—");
}

function listaCampos(campos: string[] | undefined): string {
  const nomes = (campos ?? []).map((c) => ROTULO_CAMPO_OS[c] ?? c);
  if (nomes.length <= 1) return nomes[0] ?? "dados";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function descrever(ev: EventoTimeline): { icone: LucideIcon; texto: ReactNode; detalhe?: ReactNode; cor?: string } {
  const d = ev.dados;
  switch (ev.acao) {
    case "os_criada":
      return { icone: ClipboardPlus, texto: "abriu a OS" };
    case "os_status_alterado":
      return {
        icone: RefreshCcw,
        cor: d.status_cor,
        texto: d.status_de ? (
          <>
            alterou o status de <D>{d.status_de}</D> para <D>{d.status_para ?? "—"}</D>
          </>
        ) : (
          <>
            definiu o status <D>{d.status_para ?? "—"}</D>
          </>
        ),
        detalhe: d.observacao ? `“${d.observacao}”` : undefined,
      };
    case "os_reparo_iniciado":
      return { icone: PlayCircle, texto: "iniciou o atendimento" };
    case "os_concluida":
      return { icone: CheckCircle2, texto: "finalizou a OS" };
    case "os_prioridade_alterada":
      return {
        icone: Flag,
        texto: (
          <>
            alterou a prioridade{d.prioridade_de && <> de <D>{d.prioridade_de}</D></>} para <D>{d.prioridade_para ?? "—"}</D>
          </>
        ),
      };
    case "os_tipo_servico_alterado":
      return {
        icone: Tags,
        texto: d.tipo_para ? (
          <>
            definiu o tipo de serviço <D>{d.tipo_para}</D>
            {d.tipo_de && <> (antes: {d.tipo_de})</>}
          </>
        ) : (
          <>removeu o tipo de serviço{d.tipo_de && <> <D>{d.tipo_de}</D></>}</>
        ),
      };
    case "os_local_alterado":
      return {
        icone: MapPin,
        texto: (
          <>
            alterou o local de <D>{rotuloLocal(d.local_de)}</D> para <D>{rotuloLocal(d.local_para)}</D>
          </>
        ),
      };
    case "os_tecnico_atribuido":
      return {
        icone: UserCog,
        texto: (
          <>
            atribuiu o técnico <D>{d.tecnico ?? "—"}</D>
          </>
        ),
      };
    case "os_tecnico_removido":
      return {
        icone: UserCog,
        texto: (
          <>
            removeu o técnico{d.tecnico && <> <D>{d.tecnico}</D></>}
          </>
        ),
      };
    case "os_atualizada":
      return { icone: Pencil, texto: <>editou {listaCampos(d.campos)}</> };
    case "os_item_adicionado":
    case "os_item_alterado":
    case "os_item_removido": {
      const verbo = ev.acao === "os_item_adicionado" ? "adicionou o item" : ev.acao === "os_item_alterado" ? "alterou o item" : "removeu o item";
      return {
        icone: Package,
        texto: (
          <>
            {verbo} <D>{d.item ?? "—"}</D>
          </>
        ),
        detalhe:
          ev.acao !== "os_item_removido" && d.quantidade != null && d.subtotal != null
            ? `Quantidade ${Number(d.quantidade).toLocaleString("pt-BR")} · subtotal ${formatarMoeda(d.subtotal)}`
            : undefined,
      };
    }
    case "os_anexo_adicionado":
    case "os_anexo_removido":
      return {
        icone: Paperclip,
        texto: (
          <>
            {ev.acao === "os_anexo_adicionado" ? "anexou" : "removeu"} {d.tipo_anexo === "foto" ? "a foto" : "o documento"}{" "}
            <D>{d.arquivo ?? "—"}</D>
          </>
        ),
      };
    case "os_checklist_aplicado":
      return {
        icone: ClipboardList,
        texto: (
          <>
            aplicou o checklist <D>{d.checklist ?? "—"}</D>
          </>
        ),
      };
    case "os_checklist_concluido":
      return {
        icone: ClipboardCheck,
        texto: (
          <>
            completou o checklist <D>{d.checklist ?? "—"}</D>
          </>
        ),
      };
    case "os_checklist_removido":
      return {
        icone: ClipboardX,
        texto: (
          <>
            removeu o checklist <D>{d.checklist ?? "—"}</D>
          </>
        ),
      };
    case "os_comentario":
      return { icone: MessageSquare, texto: "comentou", detalhe: d.texto };
    default:
      return { icone: Pencil, texto: "registrou uma alteração" };
  }
}

/** Linha do tempo completa da OS: eventos gravados pelo banco + comentários (nada é apagado). */
export function TimelineOrdem({ osId, podeComentar, chave }: TimelineOrdemProps) {
  const { usuarioId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();
  const [eventos, setEventos] = useState<EventoTimeline[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setEventos(await obterTimeline(osId, LIMITE));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar a linha do tempo.");
    }
  }, [osId]);

  useEffect(() => {
    carregar();
  }, [carregar, chave]);

  async function comentar(e: FormEvent) {
    e.preventDefault();
    const limpo = texto.trim();
    if (!limpo || enviando || !usuarioId) return;
    if (limpo.length > LIMITE_COMENTARIO) {
      notificarErro("O comentário deve ter até 2.000 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      await adicionarComentario(osId, usuarioId, limpo);
      setTexto("");
      notificarSucesso("Comentário registrado.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível registrar o comentário.");
    } finally {
      setEnviando(false);
    }
  }

  const visiveis = (eventos ?? []).filter((ev) => pertence(ev, filtro));

  return (
    <section className="rounded-xl border border-border bg-panel p-5" aria-labelledby="titulo-timeline">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-timeline" className="font-display text-sm font-semibold text-text-primary">
          Linha do tempo
        </h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar eventos">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                filtro === f.id ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-white/5"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      {podeComentar && (
        <form onSubmit={comentar} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor="novo-comentario" className="sr-only">
            Novo comentário
          </label>
          <textarea
            id="novo-comentario"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={LIMITE_COMENTARIO}
            rows={2}
            placeholder="Adicionar comentário (fica registrado e não pode ser editado)…"
            className="min-h-[64px] flex-1 resize-y rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            Comentar
          </button>
        </form>
      )}

      {erro ? (
        <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          {erro}{" "}
          <button onClick={carregar} className="font-medium text-accent hover:underline">
            Tentar novamente
          </button>
        </p>
      ) : eventos === null ? (
        <div className="mt-5 flex flex-col gap-3" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">Nenhum registro {filtro === "todos" ? "" : "neste filtro"}.</p>
      ) : (
        <ol className="mt-5 flex flex-col">
          {visiveis.map((ev, i) => {
            const { icone: Icone, texto: descricao, detalhe, cor } = descrever(ev);
            const comentario = ev.acao === "os_comentario";
            return (
              <li key={`${ev.acao}-${ev.id}`} className="relative flex gap-3 pb-5 last:pb-0">
                {i < visiveis.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-2rem)] w-px bg-border" aria-hidden="true" />}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-base text-text-secondary"
                  style={cor ? { color: cor, borderColor: `${cor}66` } : undefined}
                  aria-hidden="true"
                >
                  <Icone size={14} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm text-text-secondary">
                    <D>{ev.usuario ?? "Sistema"}</D> {descricao}
                  </p>
                  {detalhe && (
                    <p
                      className={`mt-1 whitespace-pre-wrap break-words text-sm ${
                        comentario ? "rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-text-primary" : "text-text-secondary"
                      }`}
                    >
                      {detalhe}
                    </p>
                  )}
                  <time dateTime={ev.criado_em} className="text-xs text-text-muted">
                    {formatarDataHora(ev.criado_em)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {eventos !== null && eventos.length >= LIMITE && (
        <p className="mt-4 text-center text-xs text-text-muted">Exibindo os {LIMITE} registros mais recentes.</p>
      )}
    </section>
  );
}
