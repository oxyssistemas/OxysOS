import { useCallback, useEffect, useState } from "react";
import { History, Loader2, PenLine, ShieldCheck } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { obterAssinaturaOs } from "../execucaoService";
import { formatarDataHora } from "../tipos";
import type { AssinaturaOS } from "../tiposExecucao";
import { ConfirmacaoClienteForm } from "./ConfirmacaoClienteForm";

interface ConfirmacaoClienteCardProps {
  osId: string;
  /** muda quando a OS muda (ex.: foi reaberta), para recarregar */
  chave?: string;
}

/** Confirmação do cliente na OS (§37/§38): assinatura válida, histórico e coleta no balcão. */
export function ConfirmacaoClienteCard({ osId, chave }: ConfirmacaoClienteCardProps) {
  const [dados, setDados] = useState<AssinaturaOS | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await obterAssinaturaOs(osId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a assinatura.");
    }
  }, [osId]);

  useEffect(() => {
    carregar();
  }, [carregar, chave]);

  const atual = dados?.atual ?? null;

  return (
    <section className="rounded-xl border border-border bg-panel p-5" aria-labelledby="titulo-confirmacao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-confirmacao" className="font-display text-sm font-semibold text-text-primary">
            Confirmação do cliente
          </h2>
          <p className="text-xs text-text-muted">Nome de quem acompanhou e a assinatura na tela.</p>
        </div>
        {dados?.pode_assinar && (
          <button
            onClick={() => setAberto(true)}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <PenLine size={15} aria-hidden="true" /> {atual ? "Colher nova assinatura" : "Colher assinatura"}
          </button>
        )}
      </div>

      {erro ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {erro}{" "}
          <button onClick={carregar} className="font-medium text-accent hover:underline">
            Tentar novamente
          </button>
        </p>
      ) : !dados ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Carregando…
        </div>
      ) : !atual ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          {dados.encerrada ? "A OS foi encerrada sem assinatura do cliente." : "Ainda sem assinatura do cliente."}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex h-32 items-center justify-center rounded-lg border border-border bg-white px-3 sm:w-72">
            <img src={atual.imagem_png} alt={`Assinatura de ${atual.nome_responsavel}`} className="max-h-28 max-w-full object-contain" />
          </div>
          <dl className="grid flex-1 grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">Acompanhou</dt>
              <dd className="text-text-primary">{atual.nome_responsavel}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Documento</dt>
              <dd className="text-text-primary">{atual.documento ?? <span className="text-text-muted">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Assinado em</dt>
              <dd className="text-text-primary">{formatarDataHora(atual.assinado_em)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Colhida por</dt>
              <dd className="text-text-primary">
                {atual.tecnico ?? atual.registrado_por ?? "—"}
                {atual.tecnico && <span className="text-text-muted"> · em campo</span>}
              </dd>
            </div>
            {atual.observacao && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-text-muted">Observações</dt>
                <dd className="text-text-secondary">{atual.observacao}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="flex items-center gap-1 text-xs text-text-muted">
                <ShieldCheck size={12} aria-hidden="true" /> Impressão digital (SHA-256)
              </dt>
              <dd className="break-all font-mono text-[11px] text-text-secondary">{atual.hash_sha256}</dd>
            </div>
          </dl>
        </div>
      )}

      {dados && dados.substituidas.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            onClick={() => setVerHistorico((v) => !v)}
            aria-expanded={verHistorico}
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <History size={13} aria-hidden="true" /> {dados.substituidas.length}{" "}
            {dados.substituidas.length === 1 ? "assinatura substituída" : "assinaturas substituídas"}
          </button>
          {verHistorico && (
            <ul className="mt-2 flex flex-col gap-1 text-xs text-text-muted">
              {dados.substituidas.map((s) => (
                <li key={s.id}>
                  {s.nome_responsavel} · assinada em {formatarDataHora(s.assinado_em)} · substituída em{" "}
                  {formatarDataHora(s.substituida_em)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <SidePanel
        aberto={aberto}
        titulo={atual ? "Colher nova assinatura" : "Colher assinatura"}
        subtitulo="Entregue a tela para o cliente assinar"
        onFechar={() => setAberto(false)}
      >
        {aberto && (
          <ConfirmacaoClienteForm
            osId={osId}
            substitui={!!atual}
            onSalvo={() => {
              setAberto(false);
              carregar();
            }}
            onCancelar={() => setAberto(false)}
          />
        )}
      </SidePanel>
    </section>
  );
}
