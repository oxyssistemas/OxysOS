import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import {
  atualizarPrioridade,
  criarPrioridade,
  definirPrioridadeAtiva,
  definirPrioridadePadrao,
  excluirPrioridade,
  listarPrioridades,
  obterUsoConfiguracaoOS,
  reordenarPrioridades,
} from "./configuracaoOsService";
import {
  COR_HEX,
  CORES_CONFIGURACAO,
  NIVEIS_PRIORIDADE,
  ROTULO_NIVEL_PRIORIDADE,
  type DadosPrioridadeForm,
  type NivelPrioridade,
  type PrioridadeOS,
  type UsoConfiguracaoOS,
} from "./tipos";
import { ListaOrdenavel } from "./components/ListaOrdenavel";
import { SeletorCor } from "./components/SeletorCor";
import { PrioridadeBadge, Selo } from "./components/Indicadores";

export function PrioridadesPage() {
  const { notificarSucesso, notificarErro } = useToast();

  const [prioridades, setPrioridades] = useState<PrioridadeOS[] | null>(null);
  const [uso, setUso] = useState<UsoConfiguracaoOS | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [reordenando, setReordenando] = useState(false);
  const [painel, setPainel] = useState<{ aberto: boolean; item: PrioridadeOS | null }>({ aberto: false, item: null });
  const [excluir, setExcluir] = useState<PrioridadeOS | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [lista, dadosUso] = await Promise.all([listarPrioridades(), obterUsoConfiguracaoOS()]);
      setPrioridades(lista);
      setUso(dadosUso);
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar as prioridades.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const usoTotal = (id: string) => uso?.prioridades[id] ?? 0;

  async function mover(indice: number, direcao: -1 | 1) {
    if (!prioridades || reordenando) return;
    const destino = indice + direcao;
    if (destino < 0 || destino >= prioridades.length) return;
    const nova = [...prioridades];
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    setPrioridades(nova);
    setReordenando(true);
    try {
      await reordenarPrioridades(nova.map((p) => p.id));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível reordenar.");
      await carregar();
    } finally {
      setReordenando(false);
    }
  }

  async function executar(id: string, acao: () => Promise<void>, sucesso: string) {
    setProcessandoId(id);
    try {
      await acao();
      notificarSucesso(sucesso);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-base font-semibold text-text-primary">Prioridades</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Nomes e cores são livres. O nível (baixa, normal, alta, urgente) é usado pelo sistema em relatórios e, no
            futuro, em prazos de atendimento. A prioridade padrão é aplicada às OS novas.
          </p>
        </div>
        <button
          onClick={() => setPainel({ aberto: true, item: null })}
          disabled={!prioridades}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> Nova prioridade
        </button>
      </div>

      {erroCarga ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          {erroCarga}
          <button onClick={carregar} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5">
            Tentar novamente
          </button>
        </div>
      ) : prioridades === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : (
        <ListaOrdenavel
          itens={prioridades}
          rotulo="Prioridades em ordem"
          processandoId={processandoId}
          bloqueada={reordenando || processandoId !== null}
          onMover={mover}
          onEditar={(item) => setPainel({ aberto: true, item })}
          selos={(p) => (
            <>
              {p.padrao && <Selo tom="destaque">Padrão</Selo>}
              {!p.ativo && <Selo tom="apagado">Inativa</Selo>}
            </>
          )}
          detalhe={(p) => (
            <>
              Nível {ROTULO_NIVEL_PRIORIDADE[p.nivel].toLowerCase()}
              {p.sla_horas ? ` · SLA ${p.sla_horas} h` : " · sem SLA"} · {usoTotal(p.id)} OS
            </>
          )}
          acoes={(p) => {
            const ocupado = processandoId !== null;
            return (
              <>
                {p.ativo && !p.padrao && (
                  <button
                    onClick={() => executar(p.id, () => definirPrioridadePadrao(p.id), `"${p.nome}" agora é a prioridade padrão.`)}
                    disabled={ocupado}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-50"
                  >
                    Tornar padrão
                  </button>
                )}
                <button
                  onClick={() =>
                    executar(p.id, () => definirPrioridadeAtiva(p.id, !p.ativo), p.ativo ? "Prioridade desativada." : "Prioridade reativada.")
                  }
                  disabled={ocupado || (p.ativo && p.padrao)}
                  title={p.ativo && p.padrao ? "Defina outra prioridade padrão antes" : undefined}
                  className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {p.ativo ? "Desativar" : "Reativar"}
                </button>
                <button
                  onClick={() => setExcluir(p)}
                  disabled={ocupado || p.padrao || usoTotal(p.id) > 0}
                  title={usoTotal(p.id) > 0 ? "Já usada em OS: desative em vez de excluir" : undefined}
                  aria-label={`Excluir ${p.nome}`}
                  className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              </>
            );
          }}
        />
      )}

      <PrioridadeFormPanel
        aberto={painel.aberto}
        item={painel.item}
        emUso={painel.item ? usoTotal(painel.item.id) > 0 : false}
        onFechar={() => setPainel((p) => ({ ...p, aberto: false }))}
        onSalvo={async () => {
          setPainel((p) => ({ ...p, aberto: false }));
          await carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir prioridade?"
        descricao={`"${excluir?.nome}" será removida. Nenhuma OS usou esta prioridade.`}
        textoConfirmar="Excluir"
        processando={!!excluir && processandoId === excluir.id}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (!excluir) return;
          executar(excluir.id, () => excluirPrioridade(excluir.id), "Prioridade excluída.").then(() => setExcluir(null));
        }}
      />
    </div>
  );
}

interface PrioridadeFormPanelProps {
  aberto: boolean;
  item: PrioridadeOS | null;
  emUso: boolean;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}

function PrioridadeFormPanel({ aberto, item, emUso, onFechar, onSalvo }: PrioridadeFormPanelProps) {
  const { company } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState<DadosPrioridadeForm>({ nome: "", nivel: "normal", cor: CORES_CONFIGURACAO[0], sla_horas: "" });
  const [erros, setErros] = useState<{ nome?: string; cor?: string; sla_horas?: string }>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm(
      item
        ? { nome: item.nome, nivel: item.nivel, cor: item.cor, sla_horas: item.sla_horas ? String(item.sla_horas) : "" }
        : { nome: "", nivel: "normal", cor: CORES_CONFIGURACAO[0], sla_horas: "" },
    );
    setErros({});
  }, [aberto, item]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !company) return;
    const novosErros: typeof erros = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome da prioridade.";
    else if (form.nome.trim().length > 30) novosErros.nome = "Use até 30 caracteres.";
    if (!COR_HEX.test(form.cor)) novosErros.cor = "Use uma cor no formato #RRGGBB.";
    if (form.sla_horas) {
      const horas = Number(form.sla_horas);
      if (!Number.isInteger(horas) || horas < 1 || horas > 8760) novosErros.sla_horas = "Informe de 1 a 8.760 horas ou deixe em branco.";
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      if (item) {
        await atualizarPrioridade(item.id, form);
        notificarSucesso("Prioridade atualizada.");
      } else {
        await criarPrioridade(company.id, form);
        notificarSucesso("Prioridade criada.");
      }
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SidePanel
      aberto={aberto}
      onFechar={() => !salvando && onFechar()}
      titulo={item ? "Editar prioridade" : "Nova prioridade"}
      subtitulo={item ? `Chave interna: ${item.chave}` : undefined}
    >
      <form onSubmit={salvar} className="flex flex-col gap-5" noValidate>
        <Field
          id="prioridade_nome"
          label="Nome"
          maxLength={30}
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          erro={erros.nome}
          autoFocus
        />

        <fieldset disabled={!!item && emUso}>
          <legend className="mb-1.5 text-sm font-medium text-text-secondary">Nível</legend>
          {item && emUso && (
            <p className="mb-2 text-xs text-text-muted">
              Esta prioridade já foi usada em OS, então o nível não muda. Para outro nível, crie uma nova prioridade.
            </p>
          )}
          <div role="radiogroup" className="grid grid-cols-2 gap-1.5">
            {NIVEIS_PRIORIDADE.map((n) => {
              const marcado = form.nivel === n.valor;
              return (
                <label
                  key={n.valor}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    marcado ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary hover:bg-white/5"
                  } ${item && emUso ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name="prioridade_nivel"
                    value={n.valor}
                    checked={marcado}
                    onChange={() => setForm({ ...form, nivel: n.valor as NivelPrioridade })}
                    className="accent-accent"
                  />
                  {n.rotulo}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field
          id="prioridade_sla"
          label="SLA sugerido em horas (opcional)"
          type="number"
          min={1}
          max={8760}
          step={1}
          inputMode="numeric"
          placeholder="Ex.: 24"
          value={form.sla_horas}
          onChange={(e) => setForm({ ...form, sla_horas: e.target.value })}
          erro={erros.sla_horas}
        />
        <p className="-mt-3 text-xs text-text-muted">OS novas com esta prioridade recebem este prazo, a menos que outro seja informado.</p>

        <SeletorCor id="prioridade_cor" valor={form.cor} onAlterar={(cor) => setForm({ ...form, cor })} erro={erros.cor} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-text-secondary">Prévia</p>
          <PrioridadeBadge
            nome={form.nome.trim() || "Nome da prioridade"}
            cor={COR_HEX.test(form.cor) ? form.cor : "#888780"}
            nivel={form.nivel}
          />
        </div>

        <div className="sticky -bottom-6 -mx-6 mt-2 flex justify-end gap-3 border-t border-border bg-panel px-6 py-4">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {item ? "Salvar alterações" : "Criar prioridade"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
