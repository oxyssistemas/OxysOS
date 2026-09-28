import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronRight, Flag, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { TelaCarregando } from "@/components/TelaCarregando";
import { ResumoFinalizacao } from "@/app/ordens/components/ResumoFinalizacao";
import type { ChaveRequisito } from "@/app/ordens/tiposExecucao";
import { finalizarAtendimentoCampo, obterFinalizacaoAtendimento } from "../tecnicoService";
import type { FinalizacaoAtendimento } from "../tipos";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { AvisoSemInternet } from "../offline/AvisoSemInternet";

/** onde resolver cada pendência dentro do portal */
const ONDE_RESOLVER: Record<ChaveRequisito, { rota: string; rotulo: string }> = {
  checklist: { rota: "checklist", rotulo: "Abrir o checklist" },
  diagnostico: { rota: "diagnostico", rotulo: "Preencher o diagnóstico" },
  fotos: { rota: "fotos", rotulo: "Enviar fotos" },
  assinatura: { rota: "assinatura", rotulo: "Colher a assinatura" },
  materiais: { rota: "materiais", rotulo: "Registrar materiais" },
};

/** Resumo antes de finalizar (§40) e "Confirmar finalização" (§39). */
export function FinalizarAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notificarSucesso, notificarErro } = useToast();
  const { online } = useSincronizacao();
  const [dados, setDados] = useState<FinalizacaoAtendimento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [encerrar, setEncerrar] = useState(true);
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await obterFinalizacaoAtendimento(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o resumo.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados && !erro) return <TelaCarregando />;

  const pendentes = dados?.requisitos.filter((r) => !r.ok) ?? [];
  const bloqueado = !online || !dados?.pode_finalizar || (encerrar && pendentes.length > 0);

  async function confirmar() {
    if (!dados || enviando || bloqueado) return;
    if (observacao.trim().length > 500) {
      notificarErro("A observação deve ter até 500 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      const r = await finalizarAtendimentoCampo({ agendamentoId: id, encerrarOs: encerrar, observacao });
      notificarSucesso(r.encerrou_os ? "Atendimento finalizado. A OS foi encerrada." : "Visita concluída. A OS continua aberta.");
      navigate(`/technician/jobs/${id}`, { replace: true });
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível finalizar.");
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  const motivoBloqueio = !dados
    ? null
    : dados.encerrada
      ? "A OS já está encerrada."
      : dados.estado_campo === "finalizado"
        ? "Este atendimento já foi finalizado."
        : !["em_atendimento", "pausado"].includes(dados.estado_campo)
          ? "Inicie o atendimento antes de finalizar."
          : !dados.pode_finalizar
            ? "Seu cargo não permite finalizar o atendimento."
            : null;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Finalizar atendimento</h1>
        {dados?.numero && <p className="text-sm text-text-muted">{dados.numero}</p>}
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

      {dados && (
        <>
          <AvisoSemInternet acao="finalizar o atendimento" />
          <ResumoFinalizacao resumo={dados} campo />

          {encerrar && pendentes.length > 0 && !motivoBloqueio && (
            <nav aria-label="Resolver pendências" className="flex flex-col gap-2">
              {pendentes.map((p) => (
                <Link
                  key={p.chave}
                  to={`/technician/jobs/${id}/${ONDE_RESOLVER[p.chave].rota}`}
                  className="flex min-h-[48px] items-center justify-between rounded-xl border border-amber-400/30 bg-panel px-4 text-sm font-medium text-text-primary"
                >
                  {ONDE_RESOLVER[p.chave].rotulo}
                  <ChevronRight size={16} className="text-text-muted" aria-hidden="true" />
                </Link>
              ))}
            </nav>
          )}

          {motivoBloqueio ? (
            <p className="rounded-xl border border-border bg-panel px-4 py-3 text-center text-sm text-text-secondary">{motivoBloqueio}</p>
          ) : (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4" aria-labelledby="titulo-como">
              <h2 id="titulo-como" className="text-sm font-semibold text-text-primary">
                Como fica a OS?
              </h2>
              <div role="radiogroup" className="flex flex-col gap-2">
                {[
                  { valor: true, titulo: "Serviço concluído", texto: "Encerra a OS. Exige os itens acima." },
                  { valor: false, titulo: "Volto outro dia", texto: "Fecha só esta visita; a OS continua aberta." },
                ].map((o) => (
                  <button
                    key={String(o.valor)}
                    type="button"
                    role="radio"
                    aria-checked={encerrar === o.valor}
                    onClick={() => setEncerrar(o.valor)}
                    className={`flex min-h-[56px] flex-col items-start justify-center rounded-lg border px-3 py-2 text-left ${
                      encerrar === o.valor ? "border-accent bg-accent-muted" : "border-border"
                    }`}
                  >
                    <span className="text-sm font-medium text-text-primary">{o.titulo}</span>
                    <span className="text-xs text-text-muted">{o.texto}</span>
                  </button>
                ))}
              </div>
              <input
                value={observacao}
                maxLength={500}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder={encerrar ? "Observação (opcional)" : "Por que precisa voltar? (opcional)"}
                className="min-h-[48px] rounded-lg border border-border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted"
              />
              <button
                onClick={confirmar}
                disabled={enviando || bloqueado}
                className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-success text-base font-semibold text-black disabled:bg-white/10 disabled:text-text-muted"
              >
                {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Flag size={18} aria-hidden="true" />}
                {encerrar ? "Confirmar finalização" : "Concluir esta visita"}
              </button>
              {encerrar && pendentes.length > 0 && (
                <p className="text-center text-xs text-amber-300">Resolva as pendências acima para encerrar a OS.</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
