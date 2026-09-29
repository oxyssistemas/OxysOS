import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Clock, Loader2, Navigation, Pause, Pencil, Play, Plus, Timer, Trash2, Users } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ajustarApontamento, excluirApontamento, lancarApontamento, obterHorasOs } from "../execucaoService";
import { formatarDataHora } from "../tipos";
import type { OpcaoTecnico } from "../tipos";
import {
  MOTIVOS_PAUSA_OS,
  ROTULO_MOTIVO_PAUSA,
  ROTULO_TIPO_APONTAMENTO,
  TIPOS_APONTAMENTO,
  deCampoDataHora,
  duracaoEmHoras,
  paraCampoDataHora,
  type Apontamento,
  type DadosApontamentoForm,
  type HorasOS,
  type TipoApontamento,
} from "../tiposExecucao";

interface HorasOrdemProps {
  osId: string;
  /** null = empresa sem o módulo de técnicos */
  tecnicos: OpcaoTecnico[] | null;
  /** a OS encerrada só é consultada */
  encerrada: boolean;
}

const ICONE: Record<TipoApontamento, typeof Timer> = {
  deslocamento: Navigation,
  atendimento: Play,
  pausa: Pause,
};

function horarios(a: Apontamento): string {
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return a.fim_em ? `${formatarDataHora(a.inicio_em)} às ${hora(a.fim_em)}` : `${formatarDataHora(a.inicio_em)} · em aberto`;
}

function formVazio(tecnicoId: string): DadosApontamentoForm {
  const agora = new Date();
  const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000);
  return {
    tecnico_id: tecnicoId,
    tipo: "atendimento",
    inicio: paraCampoDataHora(umaHoraAtras.toISOString()),
    fim: paraCampoDataHora(agora.toISOString()),
    motivo: "almoco",
    observacao: "",
  };
}

function Total({ rotulo, minutos, destaque }: { rotulo: string; minutos: number; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-3 ${destaque ? "border-accent/30 bg-accent-muted" : "border-border bg-panel"}`}>
      <p className="font-display text-xl font-semibold tabular-nums text-text-primary">{duracaoEmHoras(minutos)}</p>
      <p className="mt-0.5 text-xs text-text-secondary">{rotulo}</p>
    </div>
  );
}

/** Horas apontadas na OS: o que o relógio de campo marcou e as correções feitas à mão. */
export function HorasOrdem({ osId, tecnicos, encerrada }: HorasOrdemProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [dados, setDados] = useState<HorasOS | null>(null);
  const [painel, setPainel] = useState<{ aberto: boolean; apontamento: Apontamento | null }>({ aberto: false, apontamento: null });
  const [form, setForm] = useState<DadosApontamentoForm>(() => formVazio(""));
  const [erros, setErros] = useState<Partial<Record<keyof DadosApontamentoForm, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [remover, setRemover] = useState<Apontamento | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await obterHorasOs(osId));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar as horas.");
    }
  }, [osId, notificarErro]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const ativos = tecnicos ?? [];
  const podeLancar = !!dados?.pode_gerenciar && !encerrada && ativos.length > 0;

  function abrir(apontamento: Apontamento | null) {
    setErros({});
    setForm(
      apontamento
        ? {
            tecnico_id: apontamento.tecnico_id,
            tipo: apontamento.tipo,
            inicio: paraCampoDataHora(apontamento.inicio_em),
            fim: apontamento.fim_em ? paraCampoDataHora(apontamento.fim_em) : "",
            motivo: apontamento.motivo ?? "almoco",
            observacao: apontamento.observacao ?? "",
          }
        : formVazio(ativos[0]?.id ?? ""),
    );
    setPainel({ aberto: true, apontamento });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const editando = painel.apontamento;
    const novosErros: typeof erros = {};
    const inicio = deCampoDataHora(form.inicio);
    const fim = form.fim ? deCampoDataHora(form.fim) : null;
    if (!form.tecnico_id) novosErros.tecnico_id = "Escolha o técnico.";
    if (!inicio) novosErros.inicio = "Informe o início.";
    // só o apontamento que ainda está correndo pode ficar sem fim
    if (!fim && !editando?.aberto) novosErros.fim = "Informe o fim.";
    if (inicio && fim && new Date(fim) <= new Date(inicio)) novosErros.fim = "O fim precisa ser depois do início.";
    if (form.observacao.length > 300) novosErros.observacao = "Use até 300 caracteres.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0 || !inicio) return;

    setSalvando(true);
    try {
      if (editando) {
        await ajustarApontamento({
          id: editando.id,
          inicio,
          fim,
          motivo: editando.tipo === "pausa" ? form.motivo : null,
          observacao: form.observacao.trim(),
        });
        notificarSucesso("Apontamento corrigido.");
      } else {
        await lancarApontamento({
          osId,
          tecnicoId: form.tecnico_id,
          tipo: form.tipo,
          inicio,
          fim: fim!,
          motivo: form.motivo,
          observacao: form.observacao.trim(),
        });
        notificarSucesso("Horas lançadas.");
      }
      setPainel({ aberto: false, apontamento: null });
      carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o apontamento.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    setRemovendo(true);
    try {
      await excluirApontamento(remover.id);
      notificarSucesso("Apontamento excluído.");
      setRemover(null);
      carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível excluir o apontamento.");
    } finally {
      setRemovendo(false);
    }
  }

  if (!dados) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-panel" />
        ))}
      </div>
    );
  }

  const editandoAberto = painel.apontamento?.aberto ?? false;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
          <Total rotulo="Trabalhado" minutos={dados.totais.trabalhado_min} destaque />
          <Total rotulo="Deslocamento" minutos={dados.totais.deslocamento_min} />
          <Total rotulo="Atendimento" minutos={dados.totais.atendimento_min} />
          <Total rotulo="Pausas" minutos={dados.totais.pausa_min} />
        </div>
        {podeLancar && (
          <button
            onClick={() => abrir(null)}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus size={16} aria-hidden="true" /> Lançar horas
          </button>
        )}
      </div>

      {dados.por_tecnico.length > 1 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Users size={14} className="text-text-muted" aria-hidden="true" /> Por técnico
          </h3>
          <ul className="flex flex-col gap-1.5">
            {dados.por_tecnico.map((t) => (
              <li key={t.tecnico_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 py-2">
                <span className="text-sm text-text-primary">{t.nome}</span>
                <span className="text-xs text-text-secondary">
                  <span className="font-medium tabular-nums text-text-primary">{duracaoEmHoras(t.trabalhado_min)}</span> trabalhados
                  {t.pausa_min > 0 && ` · ${duracaoEmHoras(t.pausa_min)} em pausa`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dados.apontamentos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-14 text-center">
          <Clock size={22} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Nenhuma hora apontada nesta OS.</p>
          <p className="text-xs text-text-muted">
            O tempo é marcado pelo técnico no portal{podeLancar ? " — ou lançado aqui, quando ele esquecer." : "."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {dados.apontamentos.map((a) => {
            const Icone = ICONE[a.tipo];
            return (
              <li key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-panel p-3.5">
                <Icone size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-text-primary">{ROTULO_TIPO_APONTAMENTO[a.tipo]}</span>
                    {a.motivo && <span className="text-xs text-text-secondary">· {ROTULO_MOTIVO_PAUSA[a.motivo]}</span>}
                    <span className="font-display text-sm font-semibold tabular-nums text-text-primary">
                      {duracaoEmHoras(a.duracao_min)}
                    </span>
                    {a.aberto && (
                      <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">correndo agora</span>
                    )}
                    {a.origem === "manual" && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">lançamento manual</span>
                    )}
                    {a.ajustado && a.origem !== "manual" && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">corrigido</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {a.tecnico} · {horarios(a)}
                  </p>
                  {a.observacao && <p className="mt-1 text-xs text-text-secondary">{a.observacao}</p>}
                </div>
                {dados.pode_gerenciar && !encerrada && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => abrir(a)}
                      aria-label={`Corrigir ${ROTULO_TIPO_APONTAMENTO[a.tipo].toLowerCase()} de ${a.tecnico}`}
                      className="rounded-lg p-2 text-text-secondary hover:bg-white/5 hover:text-text-primary"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setRemover(a)}
                      aria-label={`Excluir ${ROTULO_TIPO_APONTAMENTO[a.tipo].toLowerCase()} de ${a.tecnico}`}
                      className="rounded-lg p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {encerrada && dados.pode_gerenciar && (
        <p className="text-center text-xs text-text-muted">OS encerrada: reabra a OS para lançar ou corrigir horas.</p>
      )}

      <SidePanel
        aberto={painel.aberto}
        titulo={painel.apontamento ? "Corrigir apontamento" : "Lançar horas"}
        subtitulo={
          painel.apontamento
            ? `${ROTULO_TIPO_APONTAMENTO[painel.apontamento.tipo]} de ${painel.apontamento.tecnico}`
            : "Para o tempo que o técnico esqueceu de marcar"
        }
        onFechar={() => setPainel({ aberto: false, apontamento: null })}
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          {!painel.apontamento && (
            <>
              <SelectField
                label="Técnico"
                id="hora-tecnico"
                value={form.tecnico_id}
                erro={erros.tecnico_id}
                onChange={(e) => setForm({ ...form, tecnico_id: e.target.value })}
              >
                {ativos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Tipo"
                id="hora-tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoApontamento })}
              >
                {TIPOS_APONTAMENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </SelectField>
            </>
          )}

          {(painel.apontamento?.tipo ?? form.tipo) === "pausa" && (
            <SelectField
              label="Motivo da pausa"
              id="hora-motivo"
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value as DadosApontamentoForm["motivo"] })}
            >
              {MOTIVOS_PAUSA_OS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.rotulo}
                </option>
              ))}
            </SelectField>
          )}

          <Field
            label="Início"
            id="hora-inicio"
            type="datetime-local"
            value={form.inicio}
            erro={erros.inicio}
            onChange={(e) => setForm({ ...form, inicio: e.target.value })}
          />
          <Field
            label={editandoAberto ? "Fim (deixe em branco para seguir correndo)" : "Fim"}
            id="hora-fim"
            type="datetime-local"
            value={form.fim}
            erro={erros.fim}
            onChange={(e) => setForm({ ...form, fim: e.target.value })}
          />

          <TextareaField
            label="Observação"
            id="hora-observacao"
            rows={3}
            maxLength={300}
            placeholder="Opcional: o que justifica esse tempo."
            value={form.observacao}
            erro={erros.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
          />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPainel({ aberto: false, apontamento: null })}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {salvando && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {painel.apontamento ? "Salvar correção" : "Lançar"}
            </button>
          </div>
        </form>
      </SidePanel>

      <ConfirmDialog
        aberto={!!remover}
        titulo="Excluir apontamento"
        descricao={
          remover
            ? `${duracaoEmHoras(remover.duracao_min)} de ${ROTULO_TIPO_APONTAMENTO[remover.tipo].toLowerCase()} de ${remover.tecnico}. O tempo sai do total da OS.`
            : ""
        }
        textoConfirmar="Excluir"
        tom="perigo"
        processando={removendo}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}
