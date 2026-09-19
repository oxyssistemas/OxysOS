import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { normalizarBusca } from "@oxys/shared/masks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../context/CompanyContext";
import { LocalAtendimentoBadge } from "../legado/components/LocalAtendimento";
import type { LocalAtendimento } from "../legado/types";
import {
  atualizarTipoServico,
  criarTipoServico,
  definirTipoServicoAtivo,
  excluirTipoServico,
  listarTiposServico,
  obterUsoConfiguracaoOS,
} from "./configuracaoOsService";
import { SUGESTOES_TIPOS_SERVICO, type DadosTipoServicoForm, type TipoServico, type UsoConfiguracaoOS } from "./tipos";
import { Selo } from "./components/Indicadores";

export function TiposServicoPage() {
  const { company } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [tipos, setTipos] = useState<TipoServico[] | null>(null);
  const [uso, setUso] = useState<UsoConfiguracaoOS | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [painel, setPainel] = useState<{ aberto: boolean; item: TipoServico | null }>({ aberto: false, item: null });
  const [excluir, setExcluir] = useState<TipoServico | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [lista, dadosUso] = await Promise.all([listarTiposServico(), obterUsoConfiguracaoOS()]);
      setTipos(lista);
      setUso(dadosUso);
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar os tipos de serviço.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const usoTotal = (id: string) => uso?.tipos[id] ?? 0;

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return (tipos ?? []).filter(
      (t) =>
        (mostrarInativos || t.ativo) &&
        (!termo || normalizarBusca(`${t.nome} ${t.descricao ?? ""}`).includes(termo)),
    );
  }, [tipos, busca, mostrarInativos]);

  const sugestoes = useMemo(() => {
    if (!tipos) return [];
    const existentes = new Set(tipos.map((t) => normalizarBusca(t.nome)));
    return SUGESTOES_TIPOS_SERVICO.filter((s) => !existentes.has(normalizarBusca(s.nome)));
  }, [tipos]);

  const totalInativos = (tipos ?? []).filter((t) => !t.ativo).length;

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

  function adicionarSugestao(nome: string, local: LocalAtendimento | null) {
    if (!company) return;
    executar(
      `sugestao:${nome}`,
      () => criarTipoServico(company.id, { nome, descricao: "", local_atendimento_padrao: local ?? "" }),
      `"${nome}" adicionado.`,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-base font-semibold text-text-primary">Tipos de serviço</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Classifique as OS pelo tipo de trabalho. O local sugerido já vem marcado ao abrir a OS (ex.: instalação no
            cliente), mas pode ser trocado.
          </p>
        </div>
        <button
          onClick={() => setPainel({ aberto: true, item: null })}
          disabled={!tipos}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={16} aria-hidden="true" /> Novo tipo
        </button>
      </div>

      {sugestoes.length > 0 && (
        <section aria-labelledby="sugestoes_tipos" className="rounded-xl border border-border bg-panel px-4 py-3">
          <h3 id="sugestoes_tipos" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Sugestões — clique para adicionar
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {sugestoes.map((s) => {
              const ocupado = processandoId === `sugestao:${s.nome}`;
              return (
                <button
                  key={s.nome}
                  onClick={() => adicionarSugestao(s.nome, s.local)}
                  disabled={processandoId !== null}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 py-1 text-xs text-text-secondary hover:border-accent hover:text-text-primary disabled:opacity-50"
                >
                  {ocupado ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                  {s.nome}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tipo de serviço"
            aria-label="Buscar tipo de serviço"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        {totalInativos > 0 && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Mostrar inativos ({totalInativos})
          </label>
        )}
      </div>

      {erroCarga ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          {erroCarga}
          <button onClick={carregar} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-white/5">
            Tentar novamente
          </button>
        </div>
      ) : tipos === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <Wrench size={22} className="text-text-muted" aria-hidden="true" />
          <p className="font-display text-sm font-medium text-text-primary">
            {tipos.length === 0 ? "Nenhum tipo de serviço cadastrado" : "Nenhum tipo encontrado"}
          </p>
          <p className="max-w-sm text-xs text-text-muted">
            {tipos.length === 0
              ? "Crie os tipos que sua empresa atende ou use as sugestões acima."
              : "Ajuste a busca ou mostre os inativos."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {visiveis.map((t) => {
            const ocupado = processandoId !== null;
            const n = usoTotal(t.id);
            return (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`text-sm font-medium ${t.ativo ? "text-text-primary" : "text-text-muted"}`}>{t.nome}</p>
                    {t.local_atendimento_padrao && <LocalAtendimentoBadge local={t.local_atendimento_padrao} />}
                    {!t.ativo && <Selo tom="apagado">Inativo</Selo>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {t.descricao ? `${t.descricao} · ` : ""}
                    {n} OS
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {processandoId === t.id && <Loader2 size={14} className="mr-1 animate-spin text-text-muted" aria-hidden="true" />}
                  <button
                    onClick={() => setPainel({ aberto: true, item: t })}
                    disabled={ocupado}
                    aria-label={`Editar ${t.nome}`}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() =>
                      executar(t.id, () => definirTipoServicoAtivo(t.id, !t.ativo), t.ativo ? "Tipo desativado." : "Tipo reativado.")
                    }
                    disabled={ocupado}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:opacity-40"
                  >
                    {t.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button
                    onClick={() => setExcluir(t)}
                    disabled={ocupado || n > 0}
                    title={n > 0 ? "Já usado em OS: desative em vez de excluir" : undefined}
                    aria-label={`Excluir ${t.nome}`}
                    className="rounded-md p-1.5 text-text-muted hover:bg-white/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TipoServicoFormPanel
        aberto={painel.aberto}
        item={painel.item}
        onFechar={() => setPainel((p) => ({ ...p, aberto: false }))}
        onSalvo={async () => {
          setPainel((p) => ({ ...p, aberto: false }));
          await carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!excluir}
        tom="perigo"
        titulo="Excluir tipo de serviço?"
        descricao={`"${excluir?.nome}" será removido. Nenhuma OS usou este tipo.`}
        textoConfirmar="Excluir"
        processando={!!excluir && processandoId === excluir.id}
        onCancelar={() => setExcluir(null)}
        onConfirmar={() => {
          if (!excluir) return;
          executar(excluir.id, () => excluirTipoServico(excluir.id), "Tipo excluído.").then(() => setExcluir(null));
        }}
      />
    </div>
  );
}

interface TipoServicoFormPanelProps {
  aberto: boolean;
  item: TipoServico | null;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}

const FORM_VAZIO: DadosTipoServicoForm = { nome: "", descricao: "", local_atendimento_padrao: "" };

function TipoServicoFormPanel({ aberto, item, onFechar, onSalvo }: TipoServicoFormPanelProps) {
  const { company } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState<DadosTipoServicoForm>(FORM_VAZIO);
  const [erros, setErros] = useState<{ nome?: string; descricao?: string }>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setForm(
      item
        ? { nome: item.nome, descricao: item.descricao ?? "", local_atendimento_padrao: item.local_atendimento_padrao ?? "" }
        : FORM_VAZIO,
    );
    setErros({});
  }, [aberto, item]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando || !company) return;
    const novosErros: typeof erros = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome do tipo de serviço.";
    else if (form.nome.trim().length > 60) novosErros.nome = "Use até 60 caracteres.";
    if (form.descricao.trim().length > 300) novosErros.descricao = "Use até 300 caracteres.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      if (item) {
        await atualizarTipoServico(item.id, form);
        notificarSucesso("Tipo de serviço atualizado.");
      } else {
        await criarTipoServico(company.id, form);
        notificarSucesso("Tipo de serviço criado.");
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
      titulo={item ? "Editar tipo de serviço" : "Novo tipo de serviço"}
    >
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <Field
          id="tipo_nome"
          label="Nome"
          maxLength={60}
          placeholder="Ex.: Instalação de câmeras"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          erro={erros.nome}
          autoFocus
        />
        <TextareaField
          id="tipo_descricao"
          label="Descrição (opcional)"
          maxLength={300}
          rows={3}
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          erro={erros.descricao}
        />
        <SelectField
          id="tipo_local"
          label="Local sugerido ao abrir a OS"
          value={form.local_atendimento_padrao}
          onChange={(e) => setForm({ ...form, local_atendimento_padrao: e.target.value as LocalAtendimento | "" })}
        >
          <option value="">Sem sugestão</option>
          <option value="loja">Na loja (balcão)</option>
          <option value="externo">Externo (no cliente)</option>
        </SelectField>

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
            {item ? "Salvar alterações" : "Criar tipo"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
