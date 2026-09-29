import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, Loader2, Plus, Star, Users } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  definirEquipeAtiva,
  excluirEquipe,
  listarEquipes,
  listarTecnicosAtivos,
  salvarEquipe,
} from "../equipesService";
import { CORES_EQUIPE, equipeFormVazia, type DadosEquipeForm, type Equipe } from "../tipos";

interface EquipesPanelProps {
  aberto: boolean;
  onFechar: () => void;
  /** avisa a listagem de técnicos para recarregar (a equipe aparece no técnico) */
  onAlterado: () => void;
}

type Erros = Partial<Record<"nome" | "descricao" | "membros", string>>;

function validar(d: DadosEquipeForm): Erros {
  const erros: Erros = {};
  const nome = d.nome.trim();
  if (nome.length < 2) erros.nome = "Informe o nome da equipe (mínimo 2 caracteres).";
  else if (nome.length > 60) erros.nome = "Use no máximo 60 caracteres.";
  if (d.descricao.trim().length > 200) erros.descricao = "Use no máximo 200 caracteres.";
  if (d.membros.filter((m) => m.lider).length > 1) erros.membros = "Escolha um único líder.";
  return erros;
}

function formDaEquipe(e: Equipe): DadosEquipeForm {
  return {
    nome: e.nome,
    descricao: e.descricao ?? "",
    cor: e.cor,
    membros: e.membros.map((m) => ({ tecnico_id: m.tecnico_id, lider: m.lider })),
  };
}

export function EquipesPanel({ aberto, onFechar, onAlterado }: EquipesPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();

  const [equipes, setEquipes] = useState<Equipe[] | null>(null);
  const [tecnicos, setTecnicos] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [editando, setEditando] = useState<Equipe | null>(null);
  const [criando, setCriando] = useState(false);
  const [dados, setDados] = useState<DadosEquipeForm>(equipeFormVazia());
  const [erros, setErros] = useState<Erros>({});
  const [enviando, setEnviando] = useState(false);

  const [alternar, setAlternar] = useState<Equipe | null>(null);
  const [excluir, setExcluir] = useState<Equipe | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const [lista, ativos] = await Promise.all([listarEquipes(), listarTecnicosAtivos()]);
      setEquipes(lista);
      setTecnicos(ativos);
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : "Erro ao carregar as equipes.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    setEditando(null);
    setCriando(false);
    setErros({});
    carregar();
  }, [aberto, carregar]);

  const emFormulario = criando || !!editando;

  function abrirNova() {
    setDados(equipeFormVazia());
    setErros({});
    setEditando(null);
    setCriando(true);
  }

  function abrirEdicao(e: Equipe) {
    setDados(formDaEquipe(e));
    setErros({});
    setCriando(false);
    setEditando(e);
  }

  function fecharFormulario() {
    setCriando(false);
    setEditando(null);
    setErros({});
  }

  function alternarMembro(tecnicoId: string) {
    setDados((d) => ({
      ...d,
      membros: d.membros.some((m) => m.tecnico_id === tecnicoId)
        ? d.membros.filter((m) => m.tecnico_id !== tecnicoId)
        : [...d.membros, { tecnico_id: tecnicoId, lider: false }],
    }));
  }

  function definirLider(tecnicoId: string) {
    setDados((d) => ({
      ...d,
      membros: d.membros.map((m) => ({ ...m, lider: m.tecnico_id === tecnicoId && !m.lider })),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const novosErros = validar(dados);
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      document.getElementById("equipe_nome")?.focus();
      return;
    }
    setEnviando(true);
    try {
      await salvarEquipe(editando?.id ?? null, editando?.versao ?? null, dados);
      notificarSucesso(editando ? "Equipe atualizada." : "Equipe criada.");
      fecharFormulario();
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar a equipe.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarAlternancia() {
    if (!alternar) return;
    setProcessando(true);
    try {
      await definirEquipeAtiva(alternar.id, !alternar.ativo);
      notificarSucesso(alternar.ativo ? "Equipe desativada." : "Equipe reativada.");
      setAlternar(null);
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
      setAlternar(null);
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setProcessando(true);
    try {
      await excluirEquipe(excluir.id);
      notificarSucesso("Equipe excluída.");
      setExcluir(null);
      await carregar();
      onAlterado();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível excluir.");
      setExcluir(null);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <SidePanel
      aberto={aberto}
      largo
      titulo="Equipes"
      subtitulo="Agrupe técnicos para distribuir ordens de serviço em conjunto."
      onFechar={onFechar}
    >
      {carregando && !equipes ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={20} className="animate-spin text-accent" aria-hidden="true" />
          <span className="sr-only">Carregando…</span>
        </div>
      ) : erroCarga ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          {erroCarga}
        </div>
      ) : emFormulario ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <Field
            id="equipe_nome"
            label="Nome *"
            maxLength={60}
            value={dados.nome}
            onChange={(e) => setDados((d) => ({ ...d, nome: e.target.value }))}
            erro={erros.nome}
          />
          <TextareaField
            id="equipe_descricao"
            label="Descrição"
            rows={2}
            maxLength={200}
            value={dados.descricao}
            onChange={(e) => setDados((d) => ({ ...d, descricao: e.target.value }))}
            erro={erros.descricao}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-secondary">Cor na agenda</legend>
            <div className="flex flex-wrap gap-2">
              {CORES_EQUIPE.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  role="radio"
                  aria-checked={dados.cor === cor}
                  aria-label={`Cor ${cor}`}
                  onClick={() => setDados((d) => ({ ...d, cor }))}
                  style={{ backgroundColor: cor }}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform ${
                    dados.cor === cor ? "ring-2 ring-text-primary ring-offset-2 ring-offset-panel" : "hover:scale-110"
                  }`}
                >
                  {dados.cor === cor && <Check size={14} className="text-white" aria-hidden="true" />}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-secondary">
              Membros {dados.membros.length > 0 && <span className="text-text-muted">({dados.membros.length})</span>}
            </legend>
            {tecnicos.length === 0 ? (
              <p className="text-sm text-text-muted">Cadastre técnicos ativos para montar a equipe.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                {tecnicos.map((t) => {
                  const membro = dados.membros.find((m) => m.tecnico_id === t.id);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={!!membro}
                          onChange={() => alternarMembro(t.id)}
                          className="h-4 w-4 rounded border-border bg-base accent-accent"
                        />
                        {t.nome}
                      </label>
                      {membro && (
                        <button
                          type="button"
                          onClick={() => definirLider(t.id)}
                          aria-pressed={membro.lider}
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                            membro.lider
                              ? "border-accent bg-accent-muted text-text-primary"
                              : "border-border text-text-muted hover:bg-white/5"
                          }`}
                        >
                          <Star size={11} aria-hidden="true" /> Líder
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {erros.membros && <p className="mt-1 text-xs text-danger">{erros.membros}</p>}
          </fieldset>

          <div className="sticky -bottom-6 -mx-6 -mb-6 flex justify-end gap-2 border-t border-border bg-panel px-6 py-4">
            <button
              type="button"
              onClick={fecharFormulario}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {editando ? "Salvar alterações" : "Criar equipe"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            onClick={abrirNova}
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary"
          >
            <Plus size={16} aria-hidden="true" /> Nova equipe
          </button>

          {equipes && equipes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-base px-4 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-text-muted">
                <Users size={20} aria-hidden="true" />
              </div>
              <p className="font-display text-sm font-medium text-text-primary">Nenhuma equipe criada.</p>
              <p className="max-w-xs text-sm text-text-secondary">
                Use equipes quando mais de um técnico atende a mesma ordem de serviço.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {equipes?.map((e) => (
                <li key={e.id} className="rounded-xl border border-border bg-base p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: e.cor }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{e.nome}</p>
                        {e.descricao && <p className="mt-0.5 text-xs text-text-secondary">{e.descricao}</p>}
                      </div>
                    </div>
                    {!e.ativo && (
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
                        Inativa
                      </span>
                    )}
                  </div>

                  {e.membros.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {e.membros.map((m) => (
                        <span
                          key={m.tecnico_id}
                          className={`flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] ${
                            m.ativo ? "text-text-secondary" : "text-text-muted line-through"
                          }`}
                        >
                          {m.lider && <Star size={10} className="text-accent" aria-label="Líder" />}
                          {m.nome}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2.5 text-xs text-text-muted">Sem membros.</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-text-muted">
                      {e.os_abertas === 0 ? "Nenhuma OS em aberto" : `${e.os_abertas} OS em aberto`}
                    </p>
                    <div className="flex gap-3 text-xs">
                      <button onClick={() => abrirEdicao(e)} className="font-medium text-text-secondary hover:text-text-primary">
                        Editar
                      </button>
                      <button onClick={() => setAlternar(e)} className="font-medium text-text-secondary hover:text-text-primary">
                        {e.ativo ? "Desativar" : "Reativar"}
                      </button>
                      <button onClick={() => setExcluir(e)} className="font-medium text-text-secondary hover:text-danger">
                        Excluir
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        aberto={!!alternar}
        tom={alternar?.ativo ? "perigo" : "neutro"}
        titulo={alternar?.ativo ? "Desativar equipe?" : "Reativar equipe?"}
        descricao={
          alternar?.ativo
            ? `${alternar.nome} deixa de aparecer na distribuição de ordens de serviço. O histórico é preservado.`
            : `${alternar?.nome ?? ""} volta a aparecer na distribuição de ordens de serviço.`
        }
        textoConfirmar={alternar?.ativo ? "Desativar" : "Reativar"}
        processando={processando}
        onConfirmar={confirmarAlternancia}
        onCancelar={() => setAlternar(null)}
      />

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir equipe?"
        descricao={`${excluir?.nome ?? ""} será removida definitivamente. Equipes já usadas em ordens de serviço não podem ser excluídas — desative-as.`}
        textoConfirmar="Excluir"
        processando={processando}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setExcluir(null)}
      />
    </SidePanel>
  );
}
