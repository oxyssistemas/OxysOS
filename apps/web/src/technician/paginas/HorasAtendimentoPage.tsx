import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, Navigation, Pause, Pencil, Play, Plus, RefreshCw, Timer, Trash2 } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TelaCarregando } from "@/components/TelaCarregando";
import {
  ajustarHoraTecnico,
  excluirHoraTecnico,
  lancarHoraTecnico,
  obterHorasAtendimento,
} from "../tecnicoService";
import {
  MOTIVOS_PAUSA,
  ROTULO_TIPO_APONTAMENTO,
  TIPOS_APONTAMENTO,
  deCampoDataHora,
  duracao,
  horario,
  paraCampoDataHora,
  rotuloMotivoPausa,
  type ApontamentoTecnico,
  type HorasAtendimento,
  type MotivoPausa,
  type TipoApontamento,
} from "../tipos";
import { AvisoSemInternet } from "../offline/AvisoSemInternet";

const ICONE = { deslocamento: Navigation, atendimento: Play, pausa: Pause };

interface FormHora {
  tipo: TipoApontamento;
  inicio: string;
  fim: string;
  motivo: MotivoPausa;
  observacao: string;
}

function formVazio(): FormHora {
  const agora = new Date();
  return {
    tipo: "atendimento",
    inicio: paraCampoDataHora(new Date(agora.getTime() - 30 * 60 * 1000).toISOString()),
    fim: paraCampoDataHora(agora.toISOString()),
    motivo: "almoco",
    observacao: "",
  };
}

const campo =
  "min-h-[48px] w-full rounded-lg border border-border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted";
const rotulo = "text-sm font-medium text-text-secondary";

/** Horas que o técnico já marcou no atendimento, com o conserto do que saiu errado. */
export function HorasAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { notificarSucesso, notificarErro } = useToast();
  const [dados, setDados] = useState<HorasAtendimento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<ApontamentoTecnico | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<FormHora>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [remover, setRemover] = useState<ApontamentoTecnico | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await obterHorasAtendimento(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as horas.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setForm(formVazio());
    setEditando(null);
    setCriando(true);
  }

  function abrirEdicao(a: ApontamentoTecnico) {
    setForm({
      tipo: a.tipo,
      inicio: paraCampoDataHora(a.inicio_em),
      fim: a.fim_em ? paraCampoDataHora(a.fim_em) : "",
      motivo: a.motivo ?? "almoco",
      observacao: a.observacao ?? "",
    });
    setCriando(false);
    setEditando(a);
  }

  function fechar() {
    setCriando(false);
    setEditando(null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const inicio = deCampoDataHora(form.inicio);
    const fim = form.fim ? deCampoDataHora(form.fim) : null;
    if (!inicio) {
      notificarErro("Informe o início.");
      return;
    }
    if (!fim && !editando?.aberto) {
      notificarErro("Informe o fim.");
      return;
    }
    if (fim && new Date(fim) <= new Date(inicio)) {
      notificarErro("O fim precisa ser depois do início.");
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await ajustarHoraTecnico({
          id: editando.id,
          inicio,
          fim,
          motivo: editando.tipo === "pausa" ? form.motivo : null,
          observacao: form.observacao.trim(),
        });
        notificarSucesso("Tempo corrigido.");
      } else {
        await lancarHoraTecnico({
          agendamentoId: id,
          tipo: form.tipo,
          inicio,
          fim: fim!,
          motivo: form.motivo,
          observacao: form.observacao.trim(),
        });
        notificarSucesso("Tempo lançado.");
      }
      fechar();
      carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível salvar o tempo.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    setRemovendo(true);
    try {
      await excluirHoraTecnico(remover.id);
      notificarSucesso("Tempo excluído.");
      setRemover(null);
      carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível excluir o tempo.");
    } finally {
      setRemovendo(false);
    }
  }

  if (!dados && !erro) return <TelaCarregando />;

  if (erro) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-12 text-center">
        <AlertTriangle size={20} className="text-danger" aria-hidden="true" />
        <p className="text-sm text-text-primary">{erro}</p>
        <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary">
          <RefreshCw size={13} aria-hidden="true" /> Tentar de novo
        </button>
      </div>
    );
  }

  const horas = dados!;
  const aberto = criando || !!editando;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>

      <h1 className="font-display text-xl font-semibold text-text-primary">Minhas horas</h1>
      <AvisoSemInternet acao="lançar ou corrigir horas" />

      <section className="grid grid-cols-3 gap-2" aria-label="Tempo somado">
        {[
          { rotulo: "Trabalhado", valor: horas.totais.trabalhado_min, destaque: true },
          { rotulo: "Deslocamento", valor: horas.totais.deslocamento_min },
          { rotulo: "Pausas", valor: horas.totais.pausa_min },
        ].map((t) => (
          <div
            key={t.rotulo}
            className={`rounded-xl border px-3 py-3 text-center ${
              t.destaque ? "border-accent/30 bg-accent-muted" : "border-border bg-panel"
            }`}
          >
            <p className="font-display text-lg font-semibold tabular-nums text-text-primary">{duracao(t.valor)}</p>
            <p className="mt-0.5 text-[11px] text-text-secondary">{t.rotulo}</p>
          </div>
        ))}
      </section>

      {horas.pode_ajustar && !aberto && (
        <button
          onClick={abrirNovo}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-border text-base font-semibold text-text-secondary"
        >
          <Plus size={18} aria-hidden="true" /> Lançar tempo esquecido
        </button>
      )}

      {aberto && (
        <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4">
          <p className="text-sm font-medium text-text-primary">
            {editando ? `Corrigir ${ROTULO_TIPO_APONTAMENTO[editando.tipo].toLowerCase()}` : "Lançar tempo"}
          </p>

          {!editando && (
            <div className="flex flex-col gap-2">
              <span className={rotulo}>Tipo</span>
              <div className="flex gap-2">
                {TIPOS_APONTAMENTO.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setForm({ ...form, tipo: t.valor })}
                    aria-pressed={form.tipo === t.valor}
                    className={`min-h-[44px] flex-1 rounded-lg border text-sm font-medium ${
                      form.tipo === t.valor ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary"
                    }`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(editando?.tipo ?? form.tipo) === "pausa" && (
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Motivo</span>
              <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value as MotivoPausa })} className={campo}>
                {MOTIVOS_PAUSA.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>Início</span>
            <input
              type="datetime-local"
              value={form.inicio}
              onChange={(e) => setForm({ ...form, inicio: e.target.value })}
              className={campo}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={rotulo}>{editando?.aberto ? "Fim (em branco segue correndo)" : "Fim"}</span>
            <input type="datetime-local" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} className={campo} />
          </label>

          <input
            value={form.observacao}
            maxLength={300}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            placeholder="Observação (opcional)"
            className={campo}
          />

          <div className="flex gap-2">
            <button type="button" onClick={fechar} className="min-h-[48px] flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-white disabled:opacity-60"
            >
              {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Salvar
            </button>
          </div>
        </form>
      )}

      {horas.apontamentos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <Timer size={20} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Nenhum tempo marcado neste atendimento.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {horas.apontamentos.map((a) => {
            const Icone = ICONE[a.tipo];
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-panel p-3.5">
                <Icone size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-text-primary">{ROTULO_TIPO_APONTAMENTO[a.tipo]}</span>
                    {a.motivo && <span className="text-xs text-text-secondary">· {rotuloMotivoPausa(a.motivo)}</span>}
                    <span className="font-display text-sm font-semibold tabular-nums text-text-primary">{duracao(a.duracao_min)}</span>
                    {a.aberto && <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">correndo</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {horario(a.inicio_em)}
                    {a.fim_em ? ` – ${horario(a.fim_em)}` : ""}
                    {!a.meu && ` · ${a.tecnico}`}
                    {(a.origem === "manual" || a.ajustado) && " · ajustado à mão"}
                  </p>
                  {a.observacao && <p className="mt-1 text-xs text-text-secondary">{a.observacao}</p>}
                </div>
                {horas.pode_ajustar && a.meu && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => abrirEdicao(a)}
                      aria-label={`Corrigir ${ROTULO_TIPO_APONTAMENTO[a.tipo].toLowerCase()}`}
                      className="rounded-lg p-2.5 text-text-secondary active:bg-white/5"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setRemover(a)}
                      aria-label={`Excluir ${ROTULO_TIPO_APONTAMENTO[a.tipo].toLowerCase()}`}
                      className="rounded-lg p-2.5 text-text-secondary active:bg-danger/10"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!horas.pode_ajustar && horas.apontamentos.length > 0 && (
        <p className="text-center text-[11px] text-text-muted">Seu cargo não permite corrigir os tempos registrados.</p>
      )}

      <ConfirmDialog
        aberto={!!remover}
        titulo="Excluir tempo"
        descricao={remover ? `${duracao(remover.duracao_min)} de ${ROTULO_TIPO_APONTAMENTO[remover.tipo].toLowerCase()} saem do total.` : ""}
        textoConfirmar="Excluir"
        tom="perigo"
        processando={removendo}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}
