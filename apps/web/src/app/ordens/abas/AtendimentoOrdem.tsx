import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { salvarAtendimento } from "../ordensService";
import type { OrdemDetalhe } from "../tipos";

interface AtendimentoOrdemProps {
  ordem: OrdemDetalhe;
  podeEditar: boolean;
  onSalvo: () => void;
}

type CampoAtendimento = "diagnostico" | "servico_executado" | "solucao" | "observacoes_tecnicas";

const CAMPOS: { campo: CampoAtendimento; rotulo: string; dica: string }[] = [
  { campo: "diagnostico", rotulo: "Diagnóstico", dica: "O que foi encontrado na análise." },
  { campo: "servico_executado", rotulo: "Serviço executado", dica: "O que foi feito no atendimento." },
  { campo: "solucao", rotulo: "Solução", dica: "Como o problema foi resolvido." },
  { campo: "observacoes_tecnicas", rotulo: "Observações técnicas", dica: "Recomendações, pendências ou cuidados." },
];

function valores(o: OrdemDetalhe): Record<CampoAtendimento, string> {
  return {
    diagnostico: o.diagnostico ?? "",
    servico_executado: o.servico_executado ?? "",
    solucao: o.solucao ?? "",
    observacoes_tecnicas: o.observacoes_tecnicas ?? "",
  };
}

/** Registro técnico do atendimento (também usado pelo futuro Portal do Técnico). */
export function AtendimentoOrdem({ ordem, podeEditar, onSalvo }: AtendimentoOrdemProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState(() => valores(ordem));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm(valores(ordem));
  }, [ordem.id, ordem.versao]);

  const alterado = CAMPOS.some(({ campo }) => form[campo].trim() !== (ordem[campo] ?? ""));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !alterado) return;
    if (CAMPOS.some(({ campo }) => form[campo].length > 5000)) {
      notificarErro("Cada campo aceita até 5.000 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      await salvarAtendimento(ordem.id, ordem.versao, form);
      notificarSucesso("Atendimento salvo.");
      onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o atendimento.");
    } finally {
      setSalvando(false);
    }
  }

  if (!podeEditar) {
    return (
      <section className="rounded-xl border border-border bg-panel p-5">
        <dl className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {CAMPOS.map(({ campo, rotulo }) => (
            <div key={campo}>
              <dt className="text-xs text-text-muted">{rotulo}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                {ordem[campo] ?? <span className="text-text-muted">Não registrado</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  return (
    <form onSubmit={salvar} className="rounded-xl border border-border bg-panel p-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {CAMPOS.map(({ campo, rotulo, dica }) => (
          <div key={campo}>
            <TextareaField
              id={`atendimento_${campo}`}
              label={rotulo}
              rows={5}
              maxLength={5000}
              placeholder={dica}
              value={form[campo]}
              onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
        {alterado && <span className="text-xs text-text-muted">Alterações não salvas</span>}
        <button
          type="submit"
          disabled={salvando || !alterado}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          Salvar atendimento
        </button>
      </div>
    </form>
  );
}
