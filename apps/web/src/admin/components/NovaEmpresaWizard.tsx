import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Field, SelectField } from "@oxys/shared/components/Field";
import { maskCnpj, maskPhone, isValidCnpj, isValidPhone, isValidEmail, ESTADOS_BR } from "@oxys/shared/masks";
import { listarSegmentos } from "../data/segmentosService";
import { listarPlanos, listarFuncionalidadesDoPlano } from "../data/planosService";
import { listarFuncionalidades } from "../data/funcionalidadesService";
import { criarEmpresaEGerente } from "../data/lojasService";
import { useToast } from "@oxys/shared/components/Toast";
import type { Funcionalidade, Plano, Segmento } from "../types";

interface NovaEmpresaWizardProps {
  aberto: boolean;
  onFechar: () => void;
  onSucesso: () => void;
}

interface FormularioEmpresa {
  nome_loja: string;
  cnpj: string;
  telefone: string;
  cidade: string;
  estado: string;
  segmento_id: string;
  plano_id: string;
  ciclo_cobranca: "mensal" | "anual";
  eh_trial: boolean;
  trial_dias: number;
  nome_gerente: string;
  email_gerente: string;
  senha_gerente: string;
}

const VAZIO: FormularioEmpresa = {
  nome_loja: "",
  cnpj: "",
  telefone: "",
  cidade: "",
  estado: "",
  segmento_id: "",
  plano_id: "",
  ciclo_cobranca: "mensal",
  eh_trial: true,
  trial_dias: 14,
  nome_gerente: "",
  email_gerente: "",
  senha_gerente: "",
};

const ETAPAS = ["Empresa", "Configuração", "Gerente", "Recursos", "Confirmação"];

export function NovaEmpresaWizard({ aberto, onFechar, onSucesso }: NovaEmpresaWizardProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [etapa, setEtapa] = useState(0);
  const [form, setForm] = useState<FormularioEmpresa>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidade[]>([]);
  const [funcionalidadesDoPlano, setFuncionalidadesDoPlano] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setEtapa(0);
    setForm(VAZIO);
    setErros({});
    Promise.all([listarSegmentos(), listarPlanos(), listarFuncionalidades()]).then(
      ([s, p, f]) => {
        setSegmentos(s.filter((seg) => seg.ativo));
        setPlanos(p.filter((pl) => pl.ativo));
        setFuncionalidades(f);
      },
    );
  }, [aberto]);

  useEffect(() => {
    if (!form.plano_id) {
      setFuncionalidadesDoPlano(new Set());
      return;
    }
    listarFuncionalidadesDoPlano(form.plano_id).then((ids) => setFuncionalidadesDoPlano(new Set(ids)));
  }, [form.plano_id]);

  const planoSelecionado = useMemo(() => planos.find((p) => p.id === form.plano_id), [planos, form.plano_id]);
  const segmentoSelecionado = useMemo(
    () => segmentos.find((s) => s.id === form.segmento_id),
    [segmentos, form.segmento_id],
  );

  function validarEtapa(): boolean {
    const novosErros: Record<string, string> = {};
    if (etapa === 0) {
      if (!form.nome_loja.trim()) novosErros.nome_loja = "Informe o nome da empresa.";
      if (form.cnpj && !isValidCnpj(form.cnpj)) novosErros.cnpj = "CNPJ incompleto.";
      if (form.telefone && !isValidPhone(form.telefone)) novosErros.telefone = "Telefone incompleto.";
      if (!form.cidade.trim()) novosErros.cidade = "Informe a cidade.";
      if (!form.estado) novosErros.estado = "Selecione o estado.";
    }
    if (etapa === 1) {
      if (!form.segmento_id) novosErros.segmento_id = "Selecione um segmento.";
      if (!form.plano_id) novosErros.plano_id = "Selecione um plano.";
    }
    if (etapa === 2) {
      if (!form.nome_gerente.trim()) novosErros.nome_gerente = "Informe o nome do responsável.";
      if (!form.email_gerente.trim()) novosErros.email_gerente = "Informe o e-mail.";
      else if (!isValidEmail(form.email_gerente)) novosErros.email_gerente = "E-mail inválido.";
      if (!form.senha_gerente || form.senha_gerente.length < 8) {
        novosErros.senha_gerente = "Mínimo de 8 caracteres.";
      }
    }
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  function avancar() {
    if (!validarEtapa()) return;
    setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1));
  }

  function voltar() {
    setEtapa((e) => Math.max(e - 1, 0));
  }

  async function handleCriar() {
    if (enviando) return;
    setEnviando(true);
    try {
      await criarEmpresaEGerente(form);
      notificarSucesso("Empresa criada com sucesso.");
      onSucesso();
      onFechar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível criar a empresa.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Nova empresa">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => !enviando && onFechar()} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-full flex-col bg-panel border-l border-border shadow-2xl animate-slide-in md:w-[640px]">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">Nova empresa</h2>
            <div className="mt-2 flex items-center gap-2">
              {ETAPAS.map((nomeEtapa, i) => (
                <div key={nomeEtapa} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                      i === etapa
                        ? "bg-accent text-white"
                        : i < etapa
                          ? "bg-success/20 text-success"
                          : "bg-white/5 text-text-muted"
                    }`}
                  >
                    {i < etapa ? <Check size={11} /> : i + 1}
                  </span>
                  <span className={`text-xs ${i === etapa ? "text-text-primary" : "text-text-muted"}`}>
                    {nomeEtapa}
                  </span>
                  {i < ETAPAS.length - 1 && <span className="h-px w-3 bg-border" />}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => !enviando && onFechar()}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {etapa === 0 && (
            <div className="flex flex-col gap-4">
              <Field
                id="w_nome"
                label="Nome da empresa"
                value={form.nome_loja}
                onChange={(e) => setForm({ ...form, nome_loja: e.target.value })}
                erro={erros.nome_loja}
              />
              <Field
                id="w_cnpj"
                label="CNPJ (opcional)"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                erro={erros.cnpj}
              />
              <Field
                id="w_telefone"
                label="Telefone (opcional)"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000"
                erro={erros.telefone}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="w_cidade"
                  label="Cidade"
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                  erro={erros.cidade}
                />
                <SelectField
                  id="w_estado"
                  label="Estado"
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  erro={erros.estado}
                >
                  <option value="">UF</option>
                  {ESTADOS_BR.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>
          )}

          {etapa === 1 && (
            <div className="flex flex-col gap-4">
              <SelectField
                id="w_segmento"
                label="Segmento"
                value={form.segmento_id}
                onChange={(e) => setForm({ ...form, segmento_id: e.target.value })}
                erro={erros.segmento_id}
              >
                <option value="">Selecione...</option>
                {segmentos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="w_plano"
                label="Plano"
                value={form.plano_id}
                onChange={(e) => setForm({ ...form, plano_id: e.target.value })}
                erro={erros.plano_id}
              >
                <option value="">Selecione...</option>
                {planos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — R$ {p.preco_mensal.toFixed(2)}/mês
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="w_ciclo"
                label="Ciclo de cobrança"
                value={form.ciclo_cobranca}
                onChange={(e) => setForm({ ...form, ciclo_cobranca: e.target.value as "mensal" | "anual" })}
              >
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </SelectField>

              <div className="rounded-lg border border-border p-4">
                <label className="flex items-center gap-2.5 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={form.eh_trial}
                    onChange={(e) => setForm({ ...form, eh_trial: e.target.checked })}
                    className="h-4 w-4 rounded border-border bg-base accent-accent"
                  />
                  Iniciar em período de teste (trial)
                </label>
                {form.eh_trial && (
                  <div className="mt-3">
                    <Field
                      id="w_trial_dias"
                      label="Duração do trial (dias)"
                      type="number"
                      min={1}
                      value={form.trial_dias}
                      onChange={(e) => setForm({ ...form, trial_dias: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {etapa === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-text-muted">
                Este será o login do Owner/Gerente responsável pela empresa.
              </p>
              <Field
                id="w_nome_gerente"
                label="Nome completo"
                value={form.nome_gerente}
                onChange={(e) => setForm({ ...form, nome_gerente: e.target.value })}
                erro={erros.nome_gerente}
              />
              <Field
                id="w_email_gerente"
                label="E-mail"
                type="email"
                value={form.email_gerente}
                onChange={(e) => setForm({ ...form, email_gerente: e.target.value })}
                erro={erros.email_gerente}
              />
              <Field
                id="w_senha_gerente"
                label="Senha de acesso"
                type="password"
                value={form.senha_gerente}
                onChange={(e) => setForm({ ...form, senha_gerente: e.target.value })}
                erro={erros.senha_gerente}
              />
            </div>
          )}

          {etapa === 3 && (
            <div>
              <p className="mb-3 text-sm text-text-secondary">
                Recursos que serão liberados para esta empresa, de acordo com o plano{" "}
                <span className="text-text-primary">{planoSelecionado?.nome ?? "—"}</span>:
              </p>
              <div className="flex flex-col gap-1">
                {funcionalidades.map((f) => {
                  const incluida = funcionalidadesDoPlano.has(f.id);
                  return (
                    <div key={f.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                      {incluida ? (
                        <Check size={15} className="text-success" />
                      ) : (
                        <X size={15} className="text-text-muted" />
                      )}
                      <span className={incluida ? "text-text-primary" : "text-text-muted"}>{f.nome}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {etapa === 4 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary">Confira os dados antes de criar a empresa:</p>
              {[
                ["Empresa", form.nome_loja],
                ["Cidade/UF", `${form.cidade}/${form.estado}`],
                ["Segmento", segmentoSelecionado?.nome ?? "—"],
                ["Plano", planoSelecionado?.nome ?? "—"],
                ["Ciclo", form.ciclo_cobranca === "anual" ? "Anual" : "Mensal"],
                ["Situação inicial", form.eh_trial ? `Trial de ${form.trial_dias} dias` : "Assinatura ativa"],
                ["Responsável", form.nome_gerente],
                ["E-mail do responsável", form.email_gerente],
              ].map(([label, valor]) => (
                <div key={label} className="flex justify-between border-b border-border py-2 text-sm">
                  <span className="text-text-secondary">{label}</span>
                  <span className="font-medium text-text-primary">{valor}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={etapa === 0 ? onFechar : voltar}
            disabled={enviando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            {etapa === 0 ? "Cancelar" : "Voltar"}
          </button>
          {etapa < ETAPAS.length - 1 ? (
            <button
              onClick={avancar}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Continuar
            </button>
          ) : (
            <button
              onClick={handleCriar}
              disabled={enviando}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {enviando && <Loader2 size={16} className="animate-spin" />}
              Criar empresa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
