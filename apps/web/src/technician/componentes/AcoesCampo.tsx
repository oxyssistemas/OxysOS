import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Flag, Loader2, Navigation, Pause, Play, Timer } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { useTecnico } from "../TecnicoContext";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { AvisoSemInternet } from "../offline/AvisoSemInternet";
import {
  iniciarAtendimento,
  iniciarDeslocamento,
  pausarAtendimento,
  registrarChegada,
  retomarAtendimento,
} from "../tecnicoService";
import {
  MOTIVOS_PAUSA,
  duracao,
  minutosDesde,
  rotuloMotivoPausa,
  type ApontamentoAberto,
  type EstadoCampo,
  type MotivoPausa,
  type TemposAtendimento,
} from "../tipos";

interface AcoesCampoProps {
  agendamentoId: string;
  estado: EstadoCampo;
  apontamento: ApontamentoAberto | null;
  tempos: TemposAtendimento;
  /** recarrega o atendimento depois de cada passo */
  aoMudar: () => void;
}

/**
 * Botões do fluxo em campo. A ordem dos passos e o que é permitido são
 * decididos pelo banco; aqui só mostramos o próximo passo possível.
 */
export function AcoesCampo({ agendamentoId, estado, apontamento, tempos, aoMudar }: AcoesCampoProps) {
  const { pode } = useTecnico();
  const { online } = useSincronizacao();
  const { notificarSucesso, notificarErro } = useToast();
  const [enviando, setEnviando] = useState(false);
  const [pausando, setPausando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoPausa>("almoco");
  const [observacao, setObservacao] = useState("");
  // cronômetro do relógio aberto
  const [, setTique] = useState(0);

  useEffect(() => {
    if (!apontamento) return;
    const t = setInterval(() => setTique((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [apontamento]);

  const podeIniciar = pode("technician.jobs.start");
  const podePausar = pode("technician.jobs.pause");
  const podeFinalizar = pode("technician.jobs.complete");

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    if (enviando) return;
    setEnviando(true);
    try {
      await acao();
      notificarSucesso(sucesso);
      setPausando(false);
      setObservacao("");
      aoMudar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setEnviando(false);
    }
  }

  const botao = "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold";

  if (estado === "finalizado") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-panel py-4 text-sm text-text-secondary">
        <CheckCircle2 size={16} className="text-success" aria-hidden="true" /> Atendimento finalizado.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AvisoSemInternet acao="registrar os passos do atendimento (usam o relógio do servidor)" />
      {apontamento && (
        <p className="flex items-center justify-center gap-2 text-sm text-text-secondary">
          <Timer size={15} className="text-accent" aria-hidden="true" />
          {apontamento.tipo === "deslocamento" && "Em deslocamento há "}
          {apontamento.tipo === "atendimento" && "Atendendo há "}
          {apontamento.tipo === "pausa" && `${rotuloMotivoPausa(apontamento.motivo)} há `}
          <span className="font-medium tabular-nums text-text-primary">{duracao(minutosDesde(apontamento.inicio_em))}</span>
        </p>
      )}

      {estado === "nao_iniciado" && podeIniciar && (
        <>
          <button
            onClick={() => executar(() => iniciarDeslocamento(agendamentoId), "Deslocamento iniciado.")}
            disabled={enviando || !online}
            className={`${botao} bg-accent text-white disabled:opacity-60`}
          >
            {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Navigation size={18} aria-hidden="true" />}
            Iniciar deslocamento
          </button>
          <button
            onClick={() => executar(() => iniciarAtendimento(agendamentoId), "Atendimento iniciado.")}
            disabled={enviando || !online}
            className={`${botao} border border-border text-text-secondary disabled:opacity-60`}
          >
            Já estou no local: iniciar atendimento
          </button>
        </>
      )}

      {estado === "em_deslocamento" && podeIniciar && (
        <button
          onClick={() => executar(() => registrarChegada(agendamentoId), "Chegada registrada.")}
          disabled={enviando || !online}
          className={`${botao} bg-accent text-white disabled:opacity-60`}
        >
          {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
          Cheguei
        </button>
      )}

      {estado === "no_local" && podeIniciar && (
        <button
          onClick={() => executar(() => iniciarAtendimento(agendamentoId), "Atendimento iniciado.")}
          disabled={enviando || !online}
          className={`${botao} bg-accent text-white disabled:opacity-60`}
        >
          {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          Iniciar atendimento
        </button>
      )}

      {estado === "em_atendimento" && podePausar && !pausando && (
        <button
          onClick={() => setPausando(true)}
          disabled={enviando || !online}
          className={`${botao} border border-border text-text-secondary disabled:opacity-60`}
        >
          <Pause size={18} aria-hidden="true" /> Pausar
        </button>
      )}

      {estado === "em_atendimento" && pausando && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4">
          <p className="text-sm font-medium text-text-primary">Por que está pausando?</p>
          <div className="flex flex-col gap-2">
            {MOTIVOS_PAUSA.map((m) => (
              <button
                key={m.valor}
                onClick={() => setMotivo(m.valor)}
                aria-pressed={motivo === m.valor}
                className={`min-h-[44px] rounded-lg border px-3 text-left text-sm font-medium ${
                  motivo === m.valor ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary"
                }`}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <input
            value={observacao}
            maxLength={300}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observação (opcional)"
            className="min-h-[44px] rounded-lg border border-border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setPausando(false)}
              className="min-h-[48px] flex-1 rounded-lg border border-border text-sm font-medium text-text-secondary"
            >
              Voltar
            </button>
            <button
              onClick={() => executar(() => pausarAtendimento(agendamentoId, motivo, observacao), "Atendimento pausado.")}
              disabled={enviando || !online}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-amber-400/90 text-sm font-semibold text-black disabled:opacity-60"
            >
              {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Pausar
            </button>
          </div>
        </div>
      )}

      {estado === "pausado" && podePausar && (
        <button
          onClick={() => executar(() => retomarAtendimento(agendamentoId), "Atendimento retomado.")}
          disabled={enviando || !online}
          className={`${botao} bg-accent text-white disabled:opacity-60`}
        >
          {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          Retomar atendimento
        </button>
      )}

      {(estado === "em_atendimento" || estado === "pausado") && podeFinalizar && !pausando && (
        <Link
          to={`/technician/jobs/${agendamentoId}/finalizar`}
          className={`${botao} border border-success/40 bg-success/10 text-success`}
        >
          <Flag size={18} aria-hidden="true" /> Finalizar atendimento
        </Link>
      )}

      {(tempos.deslocamento_min > 0 || tempos.atendimento_min > 0 || tempos.pausa_min > 0) && (
        <p className="text-center text-[11px] text-text-muted">
          Deslocamento {duracao(tempos.deslocamento_min)} · Atendimento {duracao(tempos.atendimento_min)} · Pausas{" "}
          {duracao(tempos.pausa_min)}
        </p>
      )}

      {!podeIniciar && !podePausar && !podeFinalizar && (
        <p className="text-center text-[11px] text-text-muted">
          Seu cargo não permite registrar os passos do atendimento.
        </p>
      )}
    </div>
  );
}
