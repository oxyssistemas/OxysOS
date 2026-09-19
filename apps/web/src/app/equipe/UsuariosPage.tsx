import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Pencil, Plus, Search, ShieldAlert, UserPlus, Users2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField } from "@oxys/shared/components/Field";
import { EmptyState } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import { isValidEmail, normalizarBusca } from "@oxys/shared/masks";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Selo } from "../configuracoes/components/Indicadores";
import {
  alterarAcesso,
  criarUsuario,
  definirCargoUsuario,
  definirUsuarioAtivo,
  listarCargosPermissoes,
  listarEquipe,
  renomearUsuario,
} from "./equipeService";
import {
  ROTULO_PAPEL,
  formatarUltimoAcesso,
  type CargoEquipe,
  type DadosAcessoForm,
  type DadosUsuarioForm,
  type UsuarioEquipe,
} from "./tipos";

type Painel = { tipo: "novo" } | { tipo: "editar"; usuario: UsuarioEquipe } | { tipo: "acesso"; usuario: UsuarioEquipe } | null;

const USUARIO_VAZIO: DadosUsuarioForm = { nome: "", email: "", senha: "", cargo_id: "" };

export function UsuariosPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioEquipe[] | null>(null);
  const [cargos, setCargos] = useState<CargoEquipe[]>([]);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [painel, setPainel] = useState<Painel>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<UsuarioEquipe | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [equipe, cargosPermissoes] = await Promise.all([listarEquipe(), listarCargosPermissoes()]);
      setUsuarios(equipe);
      setCargos(cargosPermissoes.cargos);
      setErroCarga(null);
    } catch (err) {
      setErroCarga(err instanceof Error ? err.message : "Não foi possível carregar a equipe.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return (usuarios ?? []).filter(
      (u) =>
        (mostrarInativos || u.ativo) &&
        (!termo || normalizarBusca(`${u.nome} ${u.email} ${u.cargo?.nome ?? ""}`).includes(termo)),
    );
  }, [usuarios, busca, mostrarInativos]);

  const totalInativos = (usuarios ?? []).filter((u) => !u.ativo).length;
  const cargosAtivos = cargos.filter((c) => c.ativo);

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
        <p className="max-w-2xl text-sm text-text-secondary">
          Cada pessoa acessa com o próprio login e vê apenas o que o cargo permite. O acesso é desativado, não excluído,
          para preservar o histórico das OS.
        </p>
        <button
          onClick={() => setPainel({ tipo: "novo" })}
          disabled={!usuarios || cargosAtivos.length === 0}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <UserPlus size={16} aria-hidden="true" /> Novo usuário
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou cargo"
            aria-label="Buscar usuário"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        {totalInativos > 0 && (
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} className="h-4 w-4 accent-accent" />
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
      ) : usuarios === null ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel">
          <EmptyState
            icone={Users2}
            titulo={usuarios.length === 0 ? "Nenhum usuário na equipe" : "Nenhum usuário encontrado"}
            descricao={
              usuarios.length === 0
                ? "Cadastre quem vai atender, executar e acompanhar as ordens de serviço."
                : "Ajuste a busca ou mostre os inativos."
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-panel">
          {visiveis.map((u) => {
            const ocupado = processandoId !== null;
            return (
              <li key={u.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className={`text-sm font-medium ${u.ativo ? "text-text-primary" : "text-text-muted"}`}>{u.nome}</p>
                    {u.eh_voce && <Selo tom="destaque">Você</Selo>}
                    {u.papel === "gerente" && <Selo>Responsável</Selo>}
                    {!u.ativo && <Selo tom="apagado">Inativo</Selo>}
                  </div>
                  <p className="truncate text-xs text-text-muted">{u.email}</p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:max-w-[16rem]">
                  <p className="text-sm text-text-secondary">
                    {u.cargo ? (
                      <>
                        {u.cargo.nome}
                        {!u.cargo.ativo && <span className="text-text-muted"> (cargo inativo)</span>}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <ShieldAlert size={13} aria-hidden="true" /> Sem cargo — nenhum acesso
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    {ROTULO_PAPEL[u.papel]} · {formatarUltimoAcesso(u.ultimo_acesso)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {processandoId === u.id && <Loader2 size={14} className="mr-1 animate-spin text-text-muted" aria-hidden="true" />}
                  <button
                    onClick={() => setPainel({ tipo: "editar", usuario: u })}
                    disabled={ocupado}
                    aria-label={`Editar ${u.nome}`}
                    className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setPainel({ tipo: "acesso", usuario: u })}
                    disabled={ocupado}
                    aria-label={`Alterar acesso de ${u.nome}`}
                    title="E-mail e senha"
                    className="rounded-md p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                  >
                    <KeyRound size={14} />
                  </button>
                  <button
                    onClick={() => (u.ativo ? setConfirmar(u) : executar(u.id, () => definirUsuarioAtivo(u.id, true), "Acesso reativado."))}
                    disabled={ocupado || u.eh_voce}
                    title={u.eh_voce ? "Você não pode desativar o seu próprio acesso" : undefined}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {u.ativo ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cargosAtivos.length === 0 && usuarios !== null && (
        <p className="text-xs text-text-muted">Crie um cargo ativo em "Cargos e permissões" para cadastrar usuários.</p>
      )}

      <UsuarioPanel
        painel={painel}
        cargos={cargosAtivos}
        onFechar={() => setPainel(null)}
        onSalvo={async () => {
          setPainel(null);
          await carregar();
        }}
      />

      <ConfirmDialog
        aberto={!!confirmar}
        tom="perigo"
        titulo="Desativar acesso?"
        descricao={`${confirmar?.nome} não conseguirá mais entrar no portal. O histórico e as OS continuam com o nome dele.`}
        textoConfirmar="Desativar"
        processando={!!confirmar && processandoId === confirmar.id}
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => {
          if (!confirmar) return;
          executar(confirmar.id, () => definirUsuarioAtivo(confirmar.id, false), "Acesso desativado.").then(() =>
            setConfirmar(null),
          );
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painéis
// ---------------------------------------------------------------------------

interface UsuarioPanelProps {
  painel: Painel;
  cargos: CargoEquipe[];
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}

function UsuarioPanel({ painel, cargos, onFechar, onSalvo }: UsuarioPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [form, setForm] = useState<DadosUsuarioForm>(USUARIO_VAZIO);
  const [acesso, setAcesso] = useState<DadosAcessoForm>({ email: "", senha: "" });
  const [erros, setErros] = useState<Partial<Record<keyof DadosUsuarioForm, string>>>({});
  const [salvando, setSalvando] = useState(false);

  const usuario = painel && painel.tipo !== "novo" ? painel.usuario : null;

  useEffect(() => {
    if (!painel) return;
    setErros({});
    if (painel.tipo === "novo") {
      setForm({ ...USUARIO_VAZIO, cargo_id: cargos.find((c) => c.chave === "attendant")?.id ?? cargos[0]?.id ?? "" });
    } else if (painel.tipo === "editar") {
      setForm({ nome: painel.usuario.nome, email: painel.usuario.email, senha: "", cargo_id: painel.usuario.cargo?.id ?? "" });
    } else {
      setAcesso({ email: painel.usuario.email, senha: "" });
    }
  }, [painel, cargos]);

  async function salvarNovo(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novosErros: typeof erros = {};
    if (form.nome.trim().length < 2) novosErros.nome = "Informe o nome completo.";
    else if (form.nome.trim().length > 80) novosErros.nome = "Use até 80 caracteres.";
    if (!isValidEmail(form.email.trim())) novosErros.email = "Informe um e-mail válido.";
    if (form.senha.length < 8) novosErros.senha = "A senha deve ter ao menos 8 caracteres.";
    if (!form.cargo_id) novosErros.cargo_id = "Escolha o cargo.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      await criarUsuario({ ...form, nome: form.nome.trim(), email: form.email.trim() });
      notificarSucesso("Usuário cadastrado. Informe a senha a ele com segurança.");
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault();
    if (salvando || !usuario) return;
    const novosErros: typeof erros = {};
    if (form.nome.trim().length < 2) novosErros.nome = "Informe o nome completo.";
    else if (form.nome.trim().length > 80) novosErros.nome = "Use até 80 caracteres.";
    if (!form.cargo_id) novosErros.cargo_id = "Escolha o cargo.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      if (form.nome.trim() !== usuario.nome) await renomearUsuario(usuario.id, form.nome.trim());
      if (form.cargo_id !== (usuario.cargo?.id ?? "")) await definirCargoUsuario(usuario.id, form.cargo_id);
      notificarSucesso("Usuário atualizado.");
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarAcesso(e: FormEvent) {
    e.preventDefault();
    if (salvando || !usuario) return;
    const mudouEmail = acesso.email.trim().toLowerCase() !== usuario.email.toLowerCase();
    const novosErros: typeof erros = {};
    if (mudouEmail && !isValidEmail(acesso.email.trim())) novosErros.email = "Informe um e-mail válido.";
    if (acesso.senha && acesso.senha.length < 8) novosErros.senha = "A senha deve ter ao menos 8 caracteres.";
    if (!mudouEmail && !acesso.senha) novosErros.senha = "Informe a nova senha ou altere o e-mail.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setSalvando(true);
    try {
      await alterarAcesso(usuario.id, {
        ...(mudouEmail ? { email: acesso.email.trim() } : {}),
        ...(acesso.senha ? { senha: acesso.senha } : {}),
      });
      notificarSucesso("Acesso atualizado.");
      await onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível alterar o acesso.");
    } finally {
      setSalvando(false);
    }
  }

  const titulo =
    painel?.tipo === "novo" ? "Novo usuário" : painel?.tipo === "acesso" ? "Acesso do usuário" : "Editar usuário";

  const rodape = (
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
        {painel?.tipo === "novo" ? "Cadastrar" : "Salvar"}
      </button>
    </div>
  );

  const seletorCargo = (
    <SelectField
      id="usuario_cargo"
      label="Cargo"
      value={form.cargo_id}
      onChange={(e) => setForm({ ...form, cargo_id: e.target.value })}
      erro={erros.cargo_id}
    >
      <option value="">Selecione…</option>
      {cargos.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </SelectField>
  );

  return (
    <SidePanel
      aberto={painel !== null}
      onFechar={() => !salvando && onFechar()}
      titulo={titulo}
      subtitulo={usuario?.nome}
    >
      {painel?.tipo === "novo" && (
        <form onSubmit={salvarNovo} className="flex flex-col gap-4" noValidate>
          <Field
            id="usuario_nome"
            label="Nome"
            maxLength={80}
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
            autoFocus
          />
          <Field
            id="usuario_email"
            label="E-mail (login)"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            erro={erros.email}
          />
          <Field
            id="usuario_senha"
            label="Senha inicial"
            type="password"
            autoComplete="new-password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            erro={erros.senha}
          />
          {seletorCargo}
          <p className="text-xs text-text-muted">
            O usuário entra com esse e-mail e senha e pode trocar a senha depois. Ele nunca vê dados de outras empresas.
          </p>
          {rodape}
        </form>
      )}

      {painel?.tipo === "editar" && (
        <form onSubmit={salvarEdicao} className="flex flex-col gap-4" noValidate>
          <Field
            id="usuario_nome"
            label="Nome"
            maxLength={80}
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
            autoFocus
          />
          {usuario?.eh_voce ? (
            <div>
              <p className="text-sm text-text-secondary">
                Cargo: <span className="text-text-primary">{usuario.cargo?.nome ?? "sem cargo"}</span>
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Você não pode alterar o seu próprio cargo — pedimos isso para ninguém perder o acesso por engano.
              </p>
            </div>
          ) : (
            seletorCargo
          )}
          {rodape}
        </form>
      )}

      {painel?.tipo === "acesso" && (
        <form onSubmit={salvarAcesso} className="flex flex-col gap-4" noValidate>
          <Field
            id="acesso_email"
            label="E-mail (login)"
            type="email"
            autoComplete="off"
            value={acesso.email}
            onChange={(e) => setAcesso({ ...acesso, email: e.target.value })}
            erro={erros.email}
            autoFocus
          />
          <Field
            id="acesso_senha"
            label="Nova senha (opcional)"
            type="password"
            autoComplete="new-password"
            placeholder="Deixe em branco para manter"
            value={acesso.senha}
            onChange={(e) => setAcesso({ ...acesso, senha: e.target.value })}
            erro={erros.senha}
          />
          <p className="text-xs text-text-muted">
            A troca de e-mail e senha é feita no servidor. Combine a nova senha com a pessoa por um canal seguro.
          </p>
          {rodape}
        </form>
      )}
    </SidePanel>
  );
}
