import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { TelaCarregando } from "@/components/TelaCarregando";
import { CAMPOS_ATENDIMENTO, type CampoAtendimento } from "@/app/ordens/tiposExecucao";
import { ehErroRede } from "@/lib/erros";
import { obterFinalizacaoAtendimento, registrarAtendimentoCampo } from "../tecnicoService";
import type { FinalizacaoAtendimento } from "../tipos";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { enfileirarAtendimento } from "../offline/fila";

type Form = Record<CampoAtendimento, string>;

function paraForm(dados: FinalizacaoAtendimento): Form {
  return Object.fromEntries(CAMPOS_ATENDIMENTO.map(({ campo }) => [campo, dados.atendimento[campo] ?? ""])) as Form;
}

/** Diagnóstico, causa, solução e recomendação preenchidos em campo (§36). */
export function DiagnosticoAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { notificarSucesso, notificarErro } = useToast();
  const { ativo: offlineAtivo } = useSincronizacao();
  const [dados, setDados] = useState<FinalizacaoAtendimento | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const d = await obterFinalizacaoAtendimento(id);
      setDados(d);
      setForm(paraForm(d));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o atendimento.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados && !erro) return <TelaCarregando />;

  // só o que mudou vai para o banco
  const alterados =
    dados && form
      ? CAMPOS_ATENDIMENTO.filter(({ campo }) => form[campo].trim() !== (dados.atendimento[campo] ?? ""))
      : [];

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form || salvando || alterados.length === 0) return;
    if (alterados.some(({ campo }) => form[campo].length > 5000)) {
      notificarErro("Cada campo aceita até 5.000 caracteres.");
      return;
    }
    setSalvando(true);
    const campos = Object.fromEntries(alterados.map(({ campo }) => [campo, form[campo]]));
    // a versão vista de cada campo é o que veio do servidor (sem as pendências locais por cima)
    const guardar = () =>
      enfileirarAtendimento({
        agendamentoId: id,
        campos,
        vistos: Object.fromEntries(alterados.map(({ campo }) => [campo, dados?.atendimento[campo] ?? null])),
        osNumero: dados?.numero ?? null,
      });
    try {
      if (offlineAtivo && !navigator.onLine) {
        await guardar();
        notificarSucesso("Sem internet: registro guardado no aparelho.");
      } else {
        await registrarAtendimentoCampo(id, campos);
        notificarSucesso("Registro do atendimento salvo.");
      }
      await carregar();
    } catch (err) {
      if (offlineAtivo && ehErroRede(err)) {
        await guardar();
        notificarSucesso("Sem internet: registro guardado no aparelho.");
        await carregar();
      } else {
        notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
      }
    } finally {
      setSalvando(false);
    }
  }

  const exigeDiagnostico = dados?.requisitos.some((r) => r.chave === "diagnostico");

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Diagnóstico e solução</h1>
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

      {dados && form && (
        <form onSubmit={salvar} noValidate className="flex flex-col gap-4">
          {!dados.pode_registrar && (
            <p className="rounded-xl border border-border bg-panel px-4 py-3 text-sm text-text-secondary">
              {dados.encerrada ? "A OS já foi encerrada; o registro fica com o escritório." : "Seu cargo não permite registrar o atendimento."}
            </p>
          )}
          {CAMPOS_ATENDIMENTO.map(({ campo, rotulo, dica }) => (
            <label key={campo} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-secondary">
                {rotulo}
                {campo === "diagnostico" && exigeDiagnostico && (
                  <span className="ml-1 text-danger" aria-label="obrigatório para finalizar">
                    *
                  </span>
                )}
              </span>
              <textarea
                value={form[campo]}
                rows={campo === "observacoes_tecnicas" ? 2 : 3}
                maxLength={5000}
                placeholder={dica}
                disabled={!dados.pode_registrar || salvando}
                onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                className="rounded-lg border border-border bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-60"
              />
            </label>
          ))}

          {dados.pode_registrar && (
            <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-xl border border-border bg-panel/95 p-3 backdrop-blur">
              <button
                type="submit"
                disabled={salvando || alterados.length === 0}
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white disabled:opacity-50"
              >
                {salvando && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
                {alterados.length === 0 ? "Nada para salvar" : "Salvar registro"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
