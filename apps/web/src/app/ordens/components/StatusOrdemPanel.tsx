import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { useCompany } from "../../context/CompanyContext";
import { ROTULO_CATEGORIA_STATUS, type StatusOSConfig } from "../../configuracoes/tipos";
import { MarcadorCor } from "../../configuracoes/components/Indicadores";
import { alterarStatus } from "../ordensService";
import type { OrdemDetalhe } from "../tipos";

export type ModoStatus = "alterar" | "finalizar" | "cancelar";

interface StatusOrdemPanelProps {
  modo: ModoStatus | null;
  ordem: OrdemDetalhe;
  status: StatusOSConfig[];
  onFechar: () => void;
  onConcluido: () => void;
}

const TITULOS: Record<ModoStatus, string> = {
  alterar: "Alterar status",
  finalizar: "Finalizar ordem de serviço",
  cancelar: "Cancelar ordem de serviço",
};

export function StatusOrdemPanel({ modo, ordem, status, onFechar, onConcluido }: StatusOrdemPanelProps) {
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const [statusId, setStatusId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const opcoes = useMemo(() => {
    const ativos = status.filter((s) => s.ativo && s.id !== ordem.status_id);
    if (modo === "finalizar") return ativos.filter((s) => s.categoria === "finalizado_sucesso");
    if (modo === "cancelar") return ativos.filter((s) => s.categoria === "finalizado_cancelado");
    return ativos.filter((s) =>
      s.categoria === "finalizado_sucesso"
        ? can("service_orders.finish")
        : s.categoria === "finalizado_cancelado"
          ? can("service_orders.cancel")
          : can("service_orders.edit"),
    );
  }, [status, ordem.status_id, modo, can]);

  const escolhido = opcoes.find((s) => s.id === statusId);
  const exigeMotivo = escolhido?.categoria === "finalizado_cancelado";

  useEffect(() => {
    if (!modo) return;
    setObservacao("");
    setErro(null);
    const preferida = modo === "finalizar" ? "finalizada" : modo === "cancelar" ? "cancelada" : null;
    setStatusId((opcoes.find((s) => s.chave === preferida) ?? (modo !== "alterar" ? opcoes[0] : undefined))?.id ?? "");
  }, [modo]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    if (!statusId) {
      setErro("Escolha o novo status.");
      return;
    }
    if (exigeMotivo && !observacao.trim()) {
      setErro("Informe o motivo do cancelamento.");
      return;
    }
    if (observacao.trim().length > 500) {
      setErro("Use até 500 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      await alterarStatus(ordem.id, statusId, observacao);
      notificarSucesso(
        escolhido?.categoria === "finalizado_sucesso"
          ? `Ordem ${ordem.numero} finalizada.`
          : escolhido?.categoria === "finalizado_cancelado"
            ? `Ordem ${ordem.numero} cancelada.`
            : `Status alterado para ${escolhido?.nome}.`,
      );
      onConcluido();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SidePanel
      aberto={modo !== null}
      onFechar={() => !salvando && onFechar()}
      titulo={modo ? TITULOS[modo] : ""}
      subtitulo={`${ordem.numero} · status atual: ${ordem.status.nome}`}
    >
      <form onSubmit={salvar} noValidate className="flex flex-col gap-5">
        {modo === "finalizar" && !ordem.servico_executado && (
          <p className="rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs text-text-secondary">
            O campo "Serviço executado" ainda está vazio. Você pode registrá-lo na aba Atendimento antes ou depois de finalizar.
          </p>
        )}

        {opcoes.length === 0 ? (
          <p className="text-sm text-text-secondary">Não há status disponíveis para esta ação com o seu cargo.</p>
        ) : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-secondary">{modo === "alterar" ? "Novo status" : "Status final"}</legend>
            <div role="radiogroup" className="flex flex-col gap-1.5">
              {opcoes.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    statusId === s.id ? "border-accent bg-accent-muted" : "border-border hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="novo_status"
                    checked={statusId === s.id}
                    onChange={() => {
                      setStatusId(s.id);
                      setErro(null);
                    }}
                    className="accent-accent"
                  />
                  <MarcadorCor cor={s.cor} />
                  <span className="flex-1 text-sm text-text-primary">{s.nome}</span>
                  <span className="text-xs text-text-muted">{ROTULO_CATEGORIA_STATUS[s.categoria]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <TextareaField
          id="status_observacao"
          label={exigeMotivo ? "Motivo do cancelamento" : "Observação (opcional)"}
          rows={3}
          maxLength={500}
          value={observacao}
          onChange={(e) => {
            setObservacao(e.target.value);
            setErro(null);
          }}
        />

        {erro && (
          <p role="alert" className="text-sm text-danger">
            {erro}
          </p>
        )}

        <div className="sticky -bottom-6 -mx-6 flex justify-end gap-3 border-t border-border bg-panel px-6 py-4">
          <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5">
            Voltar
          </button>
          <button
            type="submit"
            disabled={salvando || opcoes.length === 0}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${
              modo === "cancelar" ? "bg-danger hover:bg-danger/90" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {modo === "finalizar" ? "Finalizar OS" : modo === "cancelar" ? "Cancelar OS" : "Alterar status"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
