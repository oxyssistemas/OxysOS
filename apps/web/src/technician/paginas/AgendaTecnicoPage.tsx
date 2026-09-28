import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, ChevronRight, MapPin, RefreshCw, Store, Users } from "lucide-react";
import {
  CLASSE_ESTADO_CAMPO,
  GRUPOS_AGENDA,
  ROTULO_ESTADO_CAMPO,
  dataCurta,
  diaRelativo,
  horario,
  type CardAgendaTecnico,
  type GrupoAgendaTecnico,
} from "../tipos";
import { listarAgendaTecnico } from "../tecnicoService";

function grupoDaUrl(params: URLSearchParams): GrupoAgendaTecnico {
  const g = params.get("grupo");
  return GRUPOS_AGENDA.some((x) => x.valor === g) ? (g as GrupoAgendaTecnico) : "hoje";
}

export function CartaoAtendimento({ card }: { card: CardAgendaTecnico }) {
  return (
    <li>
      <Link
        to={`/technician/jobs/${card.agendamento_id}`}
        style={{ borderLeftColor: card.prioridade.cor }}
        className="flex items-start gap-3 rounded-xl border border-border border-l-[4px] bg-panel p-4 active:bg-white/[0.06]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display text-base font-semibold tabular-nums text-text-primary">
              {horario(card.inicio_em)} – {horario(card.fim_em)}
            </p>
            <span className="text-[11px] text-text-muted">{diaRelativo(card.inicio_em)}</span>
            {card.da_equipe && (
              <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                <Users size={11} aria-hidden="true" /> equipe
              </span>
            )}
          </div>

          <p className="mt-1 truncate text-sm font-medium text-text-primary">{card.titulo}</p>
          <p className="truncate text-sm text-text-secondary">{card.cliente}</p>

          <p className="mt-1 flex items-start gap-1 text-xs text-text-muted">
            {card.local_atendimento === "loja" ? (
              <>
                <Store size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> Atendimento na loja
              </>
            ) : (
              <>
                <MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2">{card.endereco?.resumo ?? "Endereço não informado"}</span>
              </>
            )}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${card.prioridade.cor}1a`, color: card.prioridade.cor }}>
              {card.prioridade.nome}
            </span>
            <span className="inline-flex items-center gap-1 text-text-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: card.status_os.cor }} aria-hidden="true" />
              {card.status_os.nome}
            </span>
            {/* o que o técnico registrou em campo */}
            {card.estado_campo !== "nao_iniciado" && card.estado_campo !== "finalizado" && (
              <span className={`rounded-full border px-2 py-0.5 ${CLASSE_ESTADO_CAMPO[card.estado_campo]}`}>
                {ROTULO_ESTADO_CAMPO[card.estado_campo]}
              </span>
            )}
            {card.tipo_servico && <span className="truncate text-text-muted">{card.tipo_servico}</span>}
          </div>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function AgendaTecnicoPage() {
  const [params, setParams] = useSearchParams();
  const grupo = grupoDaUrl(params);
  const [cards, setCards] = useState<CardAgendaTecnico[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setCards(await listarAgendaTecnico(grupo));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a sua agenda.");
    } finally {
      setCarregando(false);
    }
  }, [grupo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const vazio: Record<GrupoAgendaTecnico, string> = {
    hoje: "Nenhum atendimento para hoje.",
    proximos: "Nada agendado para os próximos dias.",
    concluidos: "Nenhum atendimento concluído nos últimos 30 dias.",
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold text-text-primary">Minha agenda</h1>

      <div className="flex overflow-hidden rounded-lg border border-border" role="tablist" aria-label="Período da agenda">
        {GRUPOS_AGENDA.map((g) => (
          <button
            key={g.valor}
            role="tab"
            aria-selected={grupo === g.valor}
            onClick={() => setParams(g.valor === "hoje" ? {} : { grupo: g.valor }, { replace: true })}
            className={`min-h-[44px] flex-1 text-sm font-medium transition-colors ${
              grupo === g.valor ? "bg-accent-muted text-text-primary" : "text-text-secondary"
            }`}
          >
            {g.rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {carregando && !cards ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-panel" />
          ))}
        </div>
      ) : cards && cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-14 text-center">
          <CalendarDays size={20} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">{vazio[grupo]}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards?.map((card) => (
            <CartaoAtendimento key={card.agendamento_id} card={card} />
          ))}
        </ul>
      )}

      {grupo === "concluidos" && (cards?.length ?? 0) > 0 && (
        <p className="text-center text-[11px] text-text-muted">
          Mostrando os atendimentos concluídos desde {dataCurta(new Date(Date.now() - 30 * 86400000).toISOString())}.
        </p>
      )}
    </div>
  );
}
