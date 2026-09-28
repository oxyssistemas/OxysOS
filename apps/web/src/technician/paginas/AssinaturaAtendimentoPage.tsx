import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, PenLine, RefreshCw } from "lucide-react";
import { TelaCarregando } from "@/components/TelaCarregando";
import { obterAssinaturaOs } from "@/app/ordens/execucaoService";
import { ConfirmacaoClienteForm } from "@/app/ordens/components/ConfirmacaoClienteForm";
import type { AssinaturaOS } from "@/app/ordens/tiposExecucao";
import { obterAtendimento } from "../tecnicoService";
import { AvisoSemInternet } from "../offline/AvisoSemInternet";

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Confirmação do cliente no fim do atendimento (§37/§38), com a assinatura na tela. */
export function AssinaturaAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [osId, setOsId] = useState<string | null>(null);
  const [dados, setDados] = useState<AssinaturaOS | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [coletando, setColetando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const atendimento = await obterAtendimento(id);
      setOsId(atendimento.os.id);
      const assinatura = await obterAssinaturaOs(atendimento.os.id);
      setDados(assinatura);
      setColetando(!assinatura.atual && assinatura.pode_assinar);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a assinatura.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados && !erro) return <TelaCarregando />;

  const atual = dados?.atual ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>

      <h1 className="font-display text-xl font-semibold text-text-primary">Assinatura do cliente</h1>
      <AvisoSemInternet acao="colher a assinatura do cliente" />

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {atual && !coletando && (
        <section className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <CheckCircle2 size={16} className="text-success" aria-hidden="true" /> Assinatura registrada
          </p>
          <div className="flex h-28 items-center justify-center rounded-lg bg-white px-3">
            <img src={atual.imagem_png} alt={`Assinatura de ${atual.nome_responsavel}`} className="max-h-24 max-w-full object-contain" />
          </div>
          <p className="text-sm text-text-secondary">
            {atual.nome_responsavel}
            {atual.documento && ` · ${atual.documento}`} · {quando(atual.assinado_em)}
          </p>
          {atual.observacao && <p className="text-xs text-text-muted">“{atual.observacao}”</p>}
          {dados?.pode_assinar && (
            <button
              onClick={() => setColetando(true)}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-text-secondary"
            >
              <PenLine size={15} aria-hidden="true" /> Colher de novo
            </button>
          )}
        </section>
      )}

      {coletando && osId && (
        <section className="rounded-xl border border-border bg-panel p-4">
          <p className="mb-3 text-sm text-text-secondary">
            Entregue o aparelho ao cliente para conferir o atendimento e assinar.
          </p>
          <ConfirmacaoClienteForm
            osId={osId}
            agendamentoId={id}
            substitui={!!atual}
            campo
            onSalvo={() => {
              setColetando(false);
              carregar();
            }}
            onCancelar={atual ? () => setColetando(false) : undefined}
          />
        </section>
      )}

      {!atual && dados && !dados.pode_assinar && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <PenLine size={20} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            {dados.encerrada ? "A OS já foi encerrada." : "Seu cargo não permite colher a assinatura do cliente."}
          </p>
        </div>
      )}
    </div>
  );
}
