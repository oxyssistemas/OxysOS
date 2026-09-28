import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudUpload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { CAMPOS_ATENDIMENTO } from "@/app/ordens/tiposExecucao";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { descartarOperacao, tentarDeNovo, usarMinhaVersao, type OperacaoFila, type ServidorChecklist } from "../offline/fila";

const ROTULO_CAMPO = Object.fromEntries(CAMPOS_ATENDIMENTO.map((c) => [c.campo, c.rotulo]));

function valorServidor(s: ServidorChecklist | undefined): string {
  if (!s) return "—";
  const v = s.valor_texto ?? s.valor_opcao ?? s.valor_data ?? s.valor_hora ?? (s.valor_numero != null ? String(s.valor_numero) : null);
  if (v != null) return v;
  if (s.valor_booleano != null) return s.valor_booleano ? "Sim" : "Não";
  return "Sem resposta";
}

function valorMeu(op: OperacaoFila): string {
  if (op.tipo !== "checklist") return "";
  if (op.valor === null || op.valor === "") return "Sem resposta";
  if (typeof op.valor === "boolean") return op.valor ? "Sim" : "Não";
  return String(op.valor);
}

/** O que foi feito sem internet: pendente, recusado ou em conflito — e a decisão do técnico (§47). */
export function SincronizacaoPage() {
  const { fila, online, sincronizando, sincronizar, ativo } = useSincronizacao();
  const { notificarSucesso, notificarErro } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function agir(op: OperacaoFila, acao: () => Promise<void>, sucesso: string) {
    setOcupado(op.chave);
    try {
      await acao();
      notificarSucesso(sucesso);
      if (online) await sincronizar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/technician" className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Início
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-text-primary">Sincronização</h1>
        <button
          onClick={() => sincronizar()}
          disabled={!online || sincronizando || fila.length === 0}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary disabled:opacity-50"
        >
          {sincronizando ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
          Sincronizar agora
        </button>
      </div>
      {!online && (
        <p className="text-sm text-text-muted">Sem internet. As alterações sobem sozinhas quando a conexão voltar.</p>
      )}
      {!ativo && (
        <p className="text-sm text-text-muted">O plano da empresa não inclui o modo offline: nada é guardado no aparelho.</p>
      )}

      {fila.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <CheckCircle2 size={20} className="text-success" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Tudo sincronizado.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {fila.map((op) => (
            <li
              key={op.chave}
              className={`flex flex-col gap-2 rounded-xl border bg-panel p-4 ${
                op.estado === "pendente" ? "border-border" : op.estado === "conflito" ? "border-amber-400/40" : "border-danger/40"
              }`}
            >
              <div className="flex items-start gap-2">
                {op.estado === "pendente" ? (
                  <CloudUpload size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                ) : (
                  <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${op.estado === "conflito" ? "text-amber-300" : "text-danger"}`} aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{op.rotulo}</p>
                  <p className="text-xs text-text-muted">
                    {op.os_numero ?? "OS"} · feito em {new Date(op.criada_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {op.mensagem && <p className="mt-1 text-xs text-text-secondary">{op.mensagem}</p>}
                </div>
              </div>

              {op.estado === "conflito" && op.tipo === "checklist" && (
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-base p-3 text-xs">
                  <div>
                    <dt className="text-text-muted">No servidor{op.servidor?.respondido_por ? ` (${op.servidor.respondido_por})` : ""}</dt>
                    <dd className="text-text-primary">{valorServidor(op.servidor)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">A sua</dt>
                    <dd className="text-text-primary">{valorMeu(op)}</dd>
                  </div>
                </dl>
              )}
              {op.estado === "conflito" && op.tipo === "atendimento" && (
                <dl className="flex flex-col gap-2 rounded-lg bg-base p-3 text-xs">
                  {(op.conflitos ?? []).map((c) => (
                    <div key={c.campo}>
                      <dt className="font-medium text-text-secondary">{ROTULO_CAMPO[c.campo] ?? c.campo}</dt>
                      <dd className="text-text-muted">No servidor: <span className="text-text-primary">{c.servidor ?? "vazio"}</span></dd>
                      <dd className="text-text-muted">A sua: <span className="text-text-primary">{c.seu}</span></dd>
                    </div>
                  ))}
                </dl>
              )}

              {op.estado !== "pendente" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => agir(op, () => descartarOperacao(op.chave), op.estado === "conflito" ? "Mantida a versão do servidor." : "Alteração descartada.")}
                    disabled={ocupado === op.chave}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-text-secondary"
                  >
                    <Trash2 size={14} aria-hidden="true" /> {op.estado === "conflito" ? "Manter a do servidor" : "Descartar"}
                  </button>
                  <button
                    onClick={() =>
                      agir(op, () => (op.estado === "conflito" ? usarMinhaVersao(op) : tentarDeNovo(op)), "Vai ser enviada de novo.")
                    }
                    disabled={ocupado === op.chave}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-semibold text-white"
                  >
                    {ocupado === op.chave && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                    {op.estado === "conflito" ? "Usar a minha" : "Tentar de novo"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
