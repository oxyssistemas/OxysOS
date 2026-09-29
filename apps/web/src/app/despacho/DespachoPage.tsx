import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw, Sparkles, Users, X } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { useCompany } from "../context/CompanyContext";
import { AgendamentoPanel } from "../agenda/componentes/AgendamentoPanel";
import { juntarDataHora, paraISODia } from "../agenda/tipos";
import { atribuirOs, carregarDespacho, sugerirTecnicos } from "./despachoService";
import { CartaoOsNaoAtribuida } from "./componentes/CartaoOsNaoAtribuida";
import { CartaoTecnico } from "./componentes/CartaoTecnico";
import { tituloDaOs, type OsNaoAtribuida, type PainelDespacho, type SugestaoTecnico } from "./tipos";

/** Horário sugerido ao arrastar uma OS: próxima hora cheia do dia mostrado. */
function horaSugerida(dia: string): string {
  const agora = new Date();
  if (dia !== paraISODia(agora)) return "09:00";
  const proxima = new Date(agora.getTime() + 60 * 60 * 1000);
  return `${String(proxima.getHours()).padStart(2, "0")}:00`;
}

export function DespachoPage() {
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const podeDistribuir = can("dispatch.assign");

  const [dia, setDia] = useState(paraISODia(new Date()));
  const [painel, setPainel] = useState<PainelDespacho | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const requisicao = useRef(0);

  const [arrastando, setArrastando] = useState<OsNaoAtribuida | null>(null);
  const [sugestoes, setSugestoes] = useState<{ os: OsNaoAtribuida; itens: SugestaoTecnico[] } | null>(null);
  const [carregandoSugestao, setCarregandoSugestao] = useState(false);
  const [atribuindo, setAtribuindo] = useState(false);
  const [agendamento, setAgendamento] = useState<{ os: OsNaoAtribuida; tecnico?: string } | null>(null);

  const carregar = useCallback(async () => {
    const id = ++requisicao.current;
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await carregarDespacho(dia);
      if (id !== requisicao.current) return;
      setPainel(resultado);
    } catch (e) {
      if (id === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar a central.");
    } finally {
      if (id === requisicao.current) setCarregando(false);
    }
  }, [dia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirSugestoes(os: OsNaoAtribuida) {
    setSugestoes({ os, itens: [] });
    setCarregandoSugestao(true);
    const inicio = juntarDataHora(dia, horaSugerida(dia));
    try {
      const itens = await sugerirTecnicos(os.os_id, inicio, new Date(inicio.getTime() + 60 * 60 * 1000));
      setSugestoes({ os, itens });
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível sugerir técnicos.");
      setSugestoes(null);
    } finally {
      setCarregandoSugestao(false);
    }
  }

  async function distribuir(osId: string, tecnicoId: string) {
    if (atribuindo) return;
    setAtribuindo(true);
    try {
      await atribuirOs(osId, tecnicoId);
      notificarSucesso("Ordem de serviço distribuída.");
      setSugestoes(null);
      await carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível distribuir.");
    } finally {
      setAtribuindo(false);
    }
  }

  const fila = painel?.nao_atribuidas ?? [];
  const tecnicos = painel?.tecnicos ?? [];
  const primeiraCarga = painel === null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Central de Despacho</h1>
          <p className="mt-1 text-sm text-text-secondary" aria-live="polite">
            {primeiraCarga
              ? "Carregando…"
              : `${fila.length} OS aguardando · ${tecnicos.length} ${
                  tecnicos.length === 1 ? "técnico ativo" : "técnicos ativos"
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="despacho-dia" className="sr-only">
            Dia da agenda
          </label>
          <input
            id="despacho-dia"
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value || paraISODia(new Date()))}
            className="rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text-primary"
          />
          <button
            onClick={carregar}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <RefreshCw size={15} aria-hidden="true" /> Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button
            onClick={carregar}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5"
          >
            <RefreshCw size={12} aria-hidden="true" /> Tentar novamente
          </button>
        </div>
      )}

      <div
        className={`mt-4 grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-[minmax(320px,380px)_1fr] ${
          carregando && !primeiraCarga ? "opacity-60" : ""
        }`}
        aria-busy={carregando}
      >
        {/* ---------------- OS não atribuídas ---------------- */}
        <div className="rounded-xl border border-border bg-base p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Inbox size={15} aria-hidden="true" /> OS não atribuídas
            <span className="ml-auto text-xs font-normal text-text-muted">{fila.length}</span>
          </h2>

          {primeiraCarga && !erro ? (
            <div className="mt-3 h-40 animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
          ) : fila.length === 0 ? (
            <p className="mt-6 px-3 pb-6 text-center text-sm text-text-secondary">
              Nenhuma OS esperando responsável.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {fila.map((os) => (
                <CartaoOsNaoAtribuida
                  key={os.os_id}
                  os={os}
                  podeDistribuir={podeDistribuir}
                  arrastando={arrastando?.os_id === os.os_id}
                  aoArrastar={setArrastando}
                  aoSugerir={abrirSugestoes}
                  aoAgendar={(alvo) => setAgendamento({ os: alvo })}
                />
              ))}
            </ul>
          )}
          {podeDistribuir && fila.length > 0 && (
            <p className="mt-3 px-1 text-[11px] text-text-muted">
              Arraste uma OS até o técnico para agendar no horário sugerido.
            </p>
          )}
        </div>

        {/* ---------------- Técnicos ---------------- */}
        <div className="rounded-xl border border-border bg-base p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Users size={15} aria-hidden="true" /> Técnicos e agenda do dia
          </h2>

          {primeiraCarga && !erro ? (
            <div className="mt-3 h-40 animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
          ) : tecnicos.length === 0 ? (
            <p className="mt-6 px-3 pb-6 text-center text-sm text-text-secondary">
              Nenhum técnico ativo cadastrado.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {tecnicos.map((t) => (
                <CartaoTecnico
                  key={t.id}
                  tecnico={t}
                  recebendo={!!arrastando}
                  aoSoltarOs={
                    podeDistribuir
                      ? (tecnicoId, osId) => {
                          const os = fila.find((o) => o.os_id === osId);
                          setArrastando(null);
                          setSugestoes(null);
                          if (os) setAgendamento({ os, tecnico: tecnicoId });
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Sugestão de técnico ---------------- */}
      {sugestoes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Sugestão de técnico">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setSugestoes(null)} aria-hidden="true" />
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
                  <Sparkles size={16} className="text-accent" aria-hidden="true" /> Técnicos sugeridos
                </h3>
                <p className="mt-1 text-sm text-text-secondary">{tituloDaOs(sugestoes.os)}</p>
                <p className="text-xs text-text-muted">
                  Para {new Date(juntarDataHora(dia, horaSugerida(dia))).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · 1 hora
                </p>
              </div>
              <button
                onClick={() => setSugestoes(null)}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {carregandoSugestao ? (
              <div className="flex justify-center py-10" role="status">
                <Loader2 size={20} className="animate-spin text-accent" aria-hidden="true" />
                <span className="sr-only">Calculando…</span>
              </div>
            ) : sugestoes.itens.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">Nenhum técnico ativo para sugerir.</p>
            ) : (
              <ul className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
                {sugestoes.itens.map((s, i) => (
                  <li key={s.tecnico_id} className="rounded-lg border border-border bg-base p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {i === 0 && <span className="mr-1.5 text-accent">★</span>}
                          {s.nome ?? "Sem nome"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-muted">{s.motivos.join(" · ")}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <button
                          onClick={() => {
                            setAgendamento({ os: sugestoes.os, tecnico: s.tecnico_id });
                            setSugestoes(null);
                          }}
                          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                        >
                          Agendar
                        </button>
                        <button
                          onClick={() => distribuir(sugestoes.os.os_id, s.tecnico_id)}
                          disabled={atribuindo}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-60"
                        >
                          Só atribuir
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <AgendamentoPanel
        aberto={!!agendamento}
        evento={null}
        osFixa={
          agendamento
            ? {
                id: agendamento.os.os_id,
                rotulo: `${agendamento.os.numero ?? "OS"} · ${tituloDaOs(agendamento.os)}`,
              }
            : null
        }
        tecnicoSugerido={agendamento?.tecnico ?? null}
        sugestao={{ data: dia, hora: horaSugerida(dia) }}
        apoio={{ tecnicos: painel?.tecnicos ?? [], equipes: painel?.equipes ?? [] }}
        onFechar={() => setAgendamento(null)}
        onSalvo={() => {
          setAgendamento(null);
          carregar();
        }}
      />
    </div>
  );
}
