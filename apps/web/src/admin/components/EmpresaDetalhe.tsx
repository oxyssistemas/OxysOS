import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useToast } from "@oxys/shared/components/Toast";
import { SelectField } from "@oxys/shared/components/Field";
import { listarPlanos } from "../data/planosService";
import { listarFuncionalidades } from "../data/funcionalidadesService";
import {
  alterarPlano,
  alterarStatusAssinatura,
  criarAssinatura,
  listarOverridesDaLoja,
  definirOverride,
  removerOverride,
} from "../data/assinaturasService";
import { alterarStatusEmpresa } from "../data/lojasService";
import { listarLogsDaLoja } from "../data/logsService";
import { supabase } from "@oxys/shared/supabase";
import type {
  EmpresaFeatureOverride,
  Funcionalidade,
  LogAuditoria,
  LojaComRelacoes,
  Plano,
  Segmento,
  StatusAssinatura,
} from "../types";

const ABAS = ["Visão Geral", "Gerentes", "Plano", "Recursos", "Assinatura", "Histórico"] as const;
type Aba = (typeof ABAS)[number];

const LABEL_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  trial: "Trial",
  active: "Ativa",
  past_due: "Pagamento atrasado",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function CriarAssinaturaForm({
  lojaId,
  planos,
  onCriada,
}: {
  lojaId: string;
  planos: Plano[];
  onCriada: () => Promise<void>;
}) {
  const { usuarioId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();
  const [planoId, setPlanoId] = useState("");
  const [ciclo, setCiclo] = useState<"mensal" | "anual">("mensal");
  const [ehTrial, setEhTrial] = useState(true);
  const [trialDias, setTrialDias] = useState(14);
  const [enviando, setEnviando] = useState(false);

  async function handleCriar() {
    if (!usuarioId || !planoId || enviando) return;
    setEnviando(true);
    try {
      await criarAssinatura({
        loja_id: lojaId,
        plano_id: planoId,
        ciclo_cobranca: ciclo,
        trial_dias: ehTrial ? trialDias : null,
        ator_usuario_id: usuarioId,
      });
      notificarSucesso("Assinatura criada.");
      await onCriada();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível criar a assinatura.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">
        Nenhuma assinatura registrada. Sem assinatura, a empresa não acessa o portal.
      </p>
      <SelectField id="nova_assinatura_plano" label="Plano" value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
        <option value="">Selecione…</option>
        {planos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="nova_assinatura_ciclo"
        label="Ciclo de cobrança"
        value={ciclo}
        onChange={(e) => setCiclo(e.target.value as "mensal" | "anual")}
      >
        <option value="mensal">Mensal</option>
        <option value="anual">Anual</option>
      </SelectField>
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" checked={ehTrial} onChange={(e) => setEhTrial(e.target.checked)} />
        Começar em período de teste
      </label>
      {ehTrial && (
        <label className="flex flex-col gap-1.5 text-sm text-text-secondary" htmlFor="nova_assinatura_trial">
          Dias de teste
          <input
            id="nova_assinatura_trial"
            type="number"
            min={1}
            max={90}
            value={trialDias}
            onChange={(e) => setTrialDias(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            className="rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary"
          />
        </label>
      )}
      <button
        onClick={handleCriar}
        disabled={!planoId || enviando}
        className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando && <Loader2 size={14} className="animate-spin" />}
        Criar assinatura
      </button>
    </div>
  );
}

interface EmpresaDetalheProps {
  empresa: LojaComRelacoes;
  onVoltar: () => void;
  onAtualizado: () => void;
}

export function EmpresaDetalhe({ empresa, onVoltar, onAtualizado }: EmpresaDetalheProps) {
  const { usuarioId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();
  const [aba, setAba] = useState<Aba>("Visão Geral");
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidade[]>([]);
  const [overrides, setOverrides] = useState<EmpresaFeatureOverride[]>([]);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [totalUsuarios, setTotalUsuarios] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);

  async function carregar() {
    setCarregando(true);
    const [dadosPlanos, dadosFuncionalidades, dadosOverrides, dadosLogs, contagem] = await Promise.all([
      listarPlanos(),
      listarFuncionalidades(),
      listarOverridesDaLoja(empresa.id),
      listarLogsDaLoja(empresa.id),
      supabase.from("usuarios").select("id", { count: "exact", head: true }).eq("loja_id", empresa.id),
    ]);
    setPlanos(dadosPlanos);
    setFuncionalidades(dadosFuncionalidades);
    setOverrides(dadosOverrides);
    setLogs(dadosLogs);
    setTotalUsuarios(contagem.count ?? 0);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [empresa.id]);

  async function handleSuspenderOuReativar() {
    if (!usuarioId || processando) return;
    const novoStatus = empresa.status === "ativa" ? "suspensa" : "ativa";
    const confirmacao = confirm(
      novoStatus === "suspensa"
        ? `Tem certeza que deseja suspender "${empresa.nome}"? Os dados não serão apagados, mas o acesso operacional será bloqueado.`
        : `Reativar "${empresa.nome}"?`,
    );
    if (!confirmacao) return;
    setProcessando(true);
    try {
      await alterarStatusEmpresa(empresa.id, novoStatus, usuarioId);
      notificarSucesso(novoStatus === "suspensa" ? "Empresa suspensa." : "Empresa reativada.");
      onAtualizado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleAlterarPlano(novoPlanoId: string) {
    if (!usuarioId || !empresa.assinatura) return;
    setProcessando(true);
    try {
      await alterarPlano({
        loja_id: empresa.id,
        plano_id: novoPlanoId,
        ator_usuario_id: usuarioId,
        plano_anterior_id: empresa.assinatura.plano_id,
      });
      notificarSucesso("Plano alterado.");
      onAtualizado();
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível alterar o plano.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleAlterarStatusAssinatura(status: StatusAssinatura) {
    if (!usuarioId) return;
    setProcessando(true);
    try {
      await alterarStatusAssinatura({ loja_id: empresa.id, status, ator_usuario_id: usuarioId });
      notificarSucesso("Status da assinatura atualizado.");
      onAtualizado();
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleOverride(f: Funcionalidade, valor: "plano" | "liberar" | "bloquear") {
    if (!usuarioId) return;
    try {
      if (valor === "plano") {
        await removerOverride(empresa.id, f.id);
      } else {
        await definirOverride({
          loja_id: empresa.id,
          funcionalidade_id: f.id,
          habilitado: valor === "liberar",
          ator_usuario_id: usuarioId,
          funcionalidade_nome: f.nome,
        });
      }
      await carregar();
      notificarSucesso("Recurso atualizado.");
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  return (
    <div>
      <button
        onClick={onVoltar}
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Voltar para Empresas
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-semibold text-text-primary">{empresa.nome}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                empresa.status === "ativa"
                  ? "bg-success/10 text-success"
                  : empresa.status === "suspensa"
                    ? "bg-[#EF9F27]/10 text-[#EF9F27]"
                    : "bg-danger/10 text-danger"
              }`}
            >
              {empresa.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {empresa.segmento?.nome ?? "Sem segmento"} · {empresa.planoAtual?.nome ?? "Sem plano"}
          </p>
        </div>
        <button
          onClick={handleSuspenderOuReativar}
          disabled={processando}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
            empresa.status === "ativa"
              ? "border border-danger/30 text-danger hover:bg-danger/10"
              : "bg-accent text-white hover:bg-accent-hover"
          }`}
        >
          {empresa.status === "ativa" ? "Suspender empresa" : "Reativar empresa"}
        </button>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
              aba === a ? "border-b-2 border-accent text-accent" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {carregando ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-accent" />
          </div>
        ) : (
          <>
            {aba === "Visão Geral" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ["CNPJ", empresa.cnpj ?? "—"],
                  ["Telefone", empresa.telefone ?? "—"],
                  ["Cidade/UF", empresa.cidade ? `${empresa.cidade}/${empresa.estado ?? ""}` : "—"],
                  ["Segmento", empresa.segmento?.nome ?? "—"],
                  ["Plano", empresa.planoAtual?.nome ?? "—"],
                  ["Criada em", formatarData(empresa.criado_em)],
                  ["Gerente principal", empresa.gerente?.nome ?? "—"],
                  ["Usuários vinculados", String(totalUsuarios)],
                ].map(([label, valor]) => (
                  <div key={label} className="rounded-lg border border-border bg-panel p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
                    <p className="mt-1 text-sm text-text-primary">{valor}</p>
                  </div>
                ))}
              </div>
            )}

            {aba === "Gerentes" && (
              <div className="rounded-xl border border-border bg-panel p-5">
                {empresa.gerente ? (
                  <div>
                    <p className="font-medium text-text-primary">{empresa.gerente.nome}</p>
                    <p className="text-sm text-text-secondary">{empresa.gerente.email}</p>
                    <p className="mt-2 text-xs text-text-muted">
                      Para editar dados do gerente, use o módulo "Gerentes" no menu lateral.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">Nenhum gerente vinculado.</p>
                )}
              </div>
            )}

            {aba === "Plano" && (
              <div className="max-w-sm rounded-xl border border-border bg-panel p-5">
                <SelectField
                  id="detalhe_plano"
                  label="Plano atual"
                  value={empresa.assinatura?.plano_id ?? ""}
                  onChange={(e) => handleAlterarPlano(e.target.value)}
                  disabled={processando || !empresa.assinatura}
                >
                  {!empresa.assinatura && <option value="">Sem assinatura</option>}
                  {planos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}

            {aba === "Recursos" && (
              <div className="overflow-hidden rounded-xl border border-border bg-panel">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                      <th className="px-5 py-3 font-medium">Funcionalidade</th>
                      <th className="px-5 py-3 font-medium">Origem</th>
                      <th className="px-5 py-3 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionalidades.map((f) => {
                      const override = overrides.find((o) => o.funcionalidade_id === f.id);
                      return (
                        <tr key={f.id} className="border-b border-border last:border-0">
                          <td className="px-5 py-3 text-text-primary">{f.nome}</td>
                          <td className="px-5 py-3 text-text-secondary">
                            {override
                              ? override.habilitado
                                ? "Liberado manualmente"
                                : "Bloqueado manualmente"
                              : "Definido pelo plano"}
                          </td>
                          <td className="px-5 py-3">
                            <select
                              value={override ? (override.habilitado ? "liberar" : "bloquear") : "plano"}
                              onChange={(e) => handleOverride(f, e.target.value as "plano" | "liberar" | "bloquear")}
                              className="rounded-lg border border-border bg-base px-2.5 py-1.5 text-xs text-text-primary"
                            >
                              <option value="plano">Seguir plano</option>
                              <option value="liberar">Liberar sempre</option>
                              <option value="bloquear">Bloquear sempre</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {aba === "Assinatura" && (
              <div className="max-w-sm rounded-xl border border-border bg-panel p-5">
                {empresa.assinatura ? (
                  <div className="flex flex-col gap-4">
                    <SelectField
                      id="detalhe_status_assinatura"
                      label="Status"
                      value={empresa.assinatura.status}
                      onChange={(e) => handleAlterarStatusAssinatura(e.target.value as StatusAssinatura)}
                      disabled={processando}
                    >
                      {Object.entries(LABEL_STATUS_ASSINATURA).map(([valor, label]) => (
                        <option key={valor} value={valor}>
                          {label}
                        </option>
                      ))}
                    </SelectField>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        Ciclo de cobrança
                      </p>
                      <p className="mt-1 text-sm capitalize text-text-primary">
                        {empresa.assinatura.ciclo_cobranca}
                      </p>
                    </div>
                    {empresa.assinatura.status === "trial" && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                          Trial termina em
                        </p>
                        <p className="mt-1 text-sm text-text-primary">
                          {formatarData(empresa.assinatura.trial_termina_em)}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <CriarAssinaturaForm
                    lojaId={empresa.id}
                    planos={planos.filter((p) => p.ativo)}
                    onCriada={async () => {
                      onAtualizado();
                      await carregar();
                    }}
                  />
                )}
              </div>
            )}

            {aba === "Histórico" && (
              <div className="overflow-hidden rounded-xl border border-border bg-panel">
                {logs.length === 0 ? (
                  <p className="p-5 text-sm text-text-muted">Nenhum evento registrado para esta empresa.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {logs.map((log) => (
                      <li key={log.id} className="px-5 py-3 text-sm">
                        <p className="text-text-primary">{log.acao.split("_").join(" ")}</p>
                        <p className="text-xs text-text-muted">{formatarData(log.criado_em)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
