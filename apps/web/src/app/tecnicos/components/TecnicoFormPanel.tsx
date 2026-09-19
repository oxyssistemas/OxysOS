import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Check, Loader2, Plus } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { cpfValido, isValidEmail, isValidPhone, maskCpf, maskPhone } from "@oxys/shared/masks";
import { useCompany } from "../../context/CompanyContext";
import {
  criarEspecialidade,
  listarEspecialidades,
  listarUsuariosVinculaveis,
  obterTecnico,
  salvarTecnico,
} from "../tecnicosService";
import {
  nomeCompleto,
  tecnicoFormVazio,
  type DadosTecnicoForm,
  type Especialidade,
  type Tecnico,
  type UsuarioVinculavel,
} from "../tipos";

interface TecnicoFormPanelProps {
  aberto: boolean;
  /** null = novo técnico */
  tecnicoId: string | null;
  somenteLeitura?: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}

type Erros = Partial<Record<keyof DadosTecnicoForm | "nova_especialidade", string>>;

function validar(d: DadosTecnicoForm): Erros {
  const erros: Erros = {};
  if (!d.nome.trim()) erros.nome = "Informe o nome do técnico.";
  else if (d.nome.trim().length > 100) erros.nome = "Use no máximo 100 caracteres.";
  if (d.sobrenome.trim().length > 100) erros.sobrenome = "Use no máximo 100 caracteres.";
  if (d.email.trim() && !isValidEmail(d.email)) erros.email = "E-mail inválido.";
  if (d.telefone.trim() && !isValidPhone(d.telefone)) erros.telefone = "Informe DDD + número (10 ou 11 dígitos).";
  if (d.documento.trim() && !cpfValido(d.documento)) erros.documento = "CPF inválido.";
  if (d.observacoes.length > 5000) erros.observacoes = "Use no máximo 5.000 caracteres.";
  return erros;
}

function formDoTecnico(t: Tecnico): DadosTecnicoForm {
  return {
    nome: t.nome,
    sobrenome: t.sobrenome ?? "",
    email: t.email ?? "",
    telefone: t.telefone ?? "",
    documento: t.documento ? maskCpf(t.documento) : "",
    observacoes: t.observacoes ?? "",
    usuario_id: t.usuario_id ?? "",
    especialidade_ids: t.especialidade_ids,
  };
}

export function TecnicoFormPanel({ aberto, tecnicoId, somenteLeitura, onFechar, onSalvo }: TecnicoFormPanelProps) {
  const { company, can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [tecnico, setTecnico] = useState<Tecnico | null>(null);
  const [dados, setDados] = useState<DadosTecnicoForm>(tecnicoFormVazio());
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioVinculavel[]>([]);
  const [vinculados, setVinculados] = useState<Map<string, string>>(new Map());
  const [erros, setErros] = useState<Erros>({});
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [novaEspecialidade, setNovaEspecialidade] = useState("");
  const [criandoEspecialidade, setCriandoEspecialidade] = useState(false);

  const podeGerenciar = can("technicians.manage") && !somenteLeitura;

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    setErros({});
    setErroCarga(null);
    setNovaEspecialidade("");
    setCarregando(true);
    Promise.all([
      tecnicoId ? obterTecnico(tecnicoId) : Promise.resolve(null),
      listarEspecialidades(),
      podeGerenciar ? listarUsuariosVinculaveis() : Promise.resolve(null),
    ])
      .then(([t, esps, equipe]) => {
        if (cancelado) return;
        if (tecnicoId && !t) {
          setErroCarga("Técnico não encontrado.");
          return;
        }
        setTecnico(t);
        setDados(t ? formDoTecnico(t) : tecnicoFormVazio());
        setEspecialidades(esps);
        if (equipe) {
          setUsuarios(equipe.usuarios);
          setVinculados(equipe.vinculados);
        }
      })
      .catch((err) => !cancelado && setErroCarga(err instanceof Error ? err.message : "Erro ao carregar."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [aberto, tecnicoId, podeGerenciar]);

  const set = <K extends keyof DadosTecnicoForm>(campo: K, valor: DadosTecnicoForm[K]) =>
    setDados((d) => ({ ...d, [campo]: valor }));

  function alternarEspecialidade(id: string) {
    set(
      "especialidade_ids",
      dados.especialidade_ids.includes(id)
        ? dados.especialidade_ids.filter((e) => e !== id)
        : [...dados.especialidade_ids, id],
    );
  }

  async function adicionarEspecialidade() {
    const nome = novaEspecialidade.trim();
    if (!nome || !company || criandoEspecialidade) return;
    if (nome.length > 60) {
      setErros((e) => ({ ...e, nova_especialidade: "Use no máximo 60 caracteres." }));
      return;
    }
    setCriandoEspecialidade(true);
    try {
      const criada = await criarEspecialidade(company.id, nome);
      setEspecialidades((lista) => [...lista, criada].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      set("especialidade_ids", [...dados.especialidade_ids, criada.id]);
      setNovaEspecialidade("");
      setErros((e) => ({ ...e, nova_especialidade: undefined }));
    } catch (err) {
      setErros((e) => ({ ...e, nova_especialidade: err instanceof Error ? err.message : "Não foi possível criar." }));
    } finally {
      setCriandoEspecialidade(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando || !podeGerenciar) return;
    const novosErros = validar(dados);
    setErros(novosErros);
    const primeiro = Object.keys(novosErros)[0];
    if (primeiro) {
      document.getElementById(`tecnico_${primeiro}`)?.focus();
      return;
    }
    setEnviando(true);
    try {
      await salvarTecnico(tecnico?.id ?? null, tecnico?.versao ?? null, dados);
      notificarSucesso(tecnico ? "Técnico atualizado." : "Técnico cadastrado.");
      onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o técnico.");
    } finally {
      setEnviando(false);
    }
  }

  // ativas + as inativas que o técnico já possui
  const especialidadesVisiveis = especialidades.filter((e) => e.ativo || dados.especialidade_ids.includes(e.id));
  const usuariosDisponiveis = usuarios.filter(
    (u) => (u.ativo && !vinculados.has(u.id)) || u.id === dados.usuario_id || vinculados.get(u.id) === tecnico?.id,
  );

  const titulo = somenteLeitura || !can("technicians.manage") ? "Técnico" : tecnicoId ? "Editar técnico" : "Novo técnico";

  return (
    <SidePanel
      aberto={aberto}
      largo
      titulo={titulo}
      subtitulo={tecnico ? nomeCompleto(tecnico) : podeGerenciar ? "Campos com * são obrigatórios" : undefined}
      onFechar={onFechar}
    >
      {carregando ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 size={20} className="animate-spin text-accent" aria-hidden="true" />
          <span className="sr-only">Carregando…</span>
        </div>
      ) : erroCarga ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          {erroCarga}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {tecnico && !tecnico.ativo && (
            <p className="rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-text-secondary">
              Técnico inativo desde {new Date(tecnico.desativado_em as string).toLocaleDateString("pt-BR")}. Não pode
              receber novas ordens de serviço.
            </p>
          )}

          <fieldset disabled={!podeGerenciar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <legend className="sr-only">Dados pessoais</legend>
            <Field
              id="tecnico_nome"
              label={podeGerenciar ? "Nome *" : "Nome"}
              autoComplete="given-name"
              maxLength={100}
              value={dados.nome}
              onChange={(e) => set("nome", e.target.value)}
              erro={erros.nome}
            />
            <Field
              id="tecnico_sobrenome"
              label="Sobrenome"
              autoComplete="family-name"
              maxLength={100}
              value={dados.sobrenome}
              onChange={(e) => set("sobrenome", e.target.value)}
              erro={erros.sobrenome}
            />
            <Field
              id="tecnico_email"
              label="E-mail"
              type="email"
              autoComplete="email"
              value={dados.email}
              onChange={(e) => set("email", e.target.value)}
              erro={erros.email}
            />
            <Field
              id="tecnico_telefone"
              label="Telefone"
              type="tel"
              inputMode="tel"
              placeholder="(00) 00000-0000"
              value={dados.telefone}
              onChange={(e) => set("telefone", maskPhone(e.target.value))}
              erro={erros.telefone}
            />
            <Field
              id="tecnico_documento"
              label="CPF (quando necessário)"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={dados.documento}
              onChange={(e) => set("documento", maskCpf(e.target.value))}
              erro={erros.documento}
            />
          </fieldset>

          <fieldset disabled={!podeGerenciar}>
            <legend className="mb-2 text-sm font-medium text-text-secondary">Especialidades</legend>
            {especialidadesVisiveis.length === 0 ? (
              <p className="text-sm text-text-muted">
                {podeGerenciar ? "Nenhuma especialidade cadastrada. Crie a primeira abaixo." : "Nenhuma especialidade."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {especialidadesVisiveis.map((esp) => {
                  const marcada = dados.especialidade_ids.includes(esp.id);
                  return (
                    <button
                      key={esp.id}
                      type="button"
                      role="checkbox"
                      aria-checked={marcada}
                      onClick={() => alternarEspecialidade(esp.id)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${
                        marcada
                          ? "border-accent bg-accent-muted text-text-primary"
                          : "border-border text-text-secondary hover:bg-white/5"
                      }`}
                    >
                      {marcada && <Check size={12} aria-hidden="true" />}
                      {esp.nome}
                      {!esp.ativo && <span className="text-text-muted">(inativa)</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {podeGerenciar && (
              <div className="mt-3">
                <div className="flex gap-2">
                  <label htmlFor="tecnico_nova_especialidade" className="sr-only">
                    Nova especialidade
                  </label>
                  <input
                    id="tecnico_nova_especialidade"
                    value={novaEspecialidade}
                    maxLength={60}
                    placeholder="Nova especialidade (ex.: CFTV)"
                    onChange={(e) => setNovaEspecialidade(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        adicionarEspecialidade();
                      }
                    }}
                    aria-invalid={!!erros.nova_especialidade}
                    aria-describedby={erros.nova_especialidade ? "tecnico_nova_especialidade-erro" : undefined}
                    className="flex-1 rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={adicionarEspecialidade}
                    disabled={!novaEspecialidade.trim() || criandoEspecialidade}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-50"
                  >
                    {criandoEspecialidade ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                    Criar
                  </button>
                </div>
                {erros.nova_especialidade && (
                  <p id="tecnico_nova_especialidade-erro" className="mt-1 text-xs text-danger">
                    {erros.nova_especialidade}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {podeGerenciar && (
            <SelectField
              id="tecnico_usuario_id"
              label="Usuário vinculado (opcional)"
              value={dados.usuario_id}
              onChange={(e) => set("usuario_id", e.target.value)}
              aria-describedby="tecnico_usuario_dica"
            >
              <option value="">Sem login no sistema</option>
              {usuariosDisponiveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} · {u.email}
                  {!u.ativo ? " (inativo)" : ""}
                </option>
              ))}
            </SelectField>
          )}
          {podeGerenciar && (
            <p id="tecnico_usuario_dica" className="-mt-4 text-xs text-text-muted">
              Vincule quando o técnico também acessa o sistema com login próprio.
            </p>
          )}

          <fieldset disabled={!podeGerenciar}>
            <legend className="sr-only">Observações</legend>
            <TextareaField
              id="tecnico_observacoes"
              label="Observações"
              maxLength={5000}
              value={dados.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              erro={erros.observacoes}
            />
          </fieldset>

          {podeGerenciar && (
            <div className="sticky -bottom-6 -mx-6 -mb-6 flex justify-end gap-2 border-t border-border bg-panel px-6 py-4">
              <button
                type="button"
                onClick={onFechar}
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
                {tecnicoId ? "Salvar alterações" : "Cadastrar técnico"}
              </button>
            </div>
          )}
        </form>
      )}
    </SidePanel>
  );
}
