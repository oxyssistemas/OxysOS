import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, KeyRound, Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField } from "@oxys/shared/components/Field";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import {
  listarStatusOS,
  criarStatusOS,
  atualizarStatusOS,
  excluirStatusOS,
  reordenarStatusOS,
} from "../data/apoioService";
import { listarFuncionarios, criarFuncionario, atualizarFuncionario } from "../data/equipeService";
import type { CategoriaStatus, Funcionario, StatusOS } from "../types";
import { isValidEmail } from "@oxys/shared/masks";

const CATEGORIAS: { valor: CategoriaStatus; label: string }[] = [
  { valor: "aberto", label: "Aberto" },
  { valor: "em_andamento", label: "Em andamento" },
  { valor: "pausado", label: "Pausado" },
  { valor: "finalizado_sucesso", label: "Finalizado (sucesso)" },
  { valor: "finalizado_cancelado", label: "Finalizado (cancelado)" },
];

const CORES_SUGERIDAS = ["#1565FF", "#378ADD", "#EF9F27", "#639922", "#E24B4A", "#8B5CF6"];

type Aba = "status" | "equipe";

export function ConfiguracoesPage() {
  const [aba, setAba] = useState<Aba>("status");

  return (
    <div>
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Configurações</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Personalize os status de OS e gerencie a equipe da loja.
        </p>
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        <button
          onClick={() => setAba("status")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            aba === "status"
              ? "border-b-2 border-accent text-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Status de OS
        </button>
        <button
          onClick={() => setAba("equipe")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            aba === "equipe"
              ? "border-b-2 border-accent text-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Equipe
        </button>
      </div>

      <div className="mt-6">{aba === "status" ? <AbaStatus /> : <AbaEquipe />}</div>
    </div>
  );
}

interface FormularioStatus {
  nome: string;
  categoria: CategoriaStatus;
  cor: string;
}

const STATUS_VAZIO: FormularioStatus = { nome: "", categoria: "aberto", cor: CORES_SUGERIDAS[0] };

function AbaStatus() {
  const { lojaId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();

  const [status, setStatus] = useState<StatusOS[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [painelAberto, setPainelAberto] = useState(false);
  const [statusEmEdicao, setStatusEmEdicao] = useState<StatusOS | null>(null);
  const [form, setForm] = useState<FormularioStatus>(STATUS_VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof FormularioStatus, string>>>({});
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    if (!lojaId) return;
    setCarregando(true);
    try {
      setStatus(await listarStatusOS(lojaId));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar status.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [lojaId]);

  function abrirCadastro() {
    setStatusEmEdicao(null);
    setForm(STATUS_VAZIO);
    setErros({});
    setPainelAberto(true);
  }

  function abrirEdicao(s: StatusOS) {
    setStatusEmEdicao(s);
    setForm({ nome: s.nome, categoria: s.categoria, cor: s.cor ?? CORES_SUGERIDAS[0] });
    setErros({});
    setPainelAberto(true);
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormularioStatus, string>> = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome do status.";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit() {
    if (enviando || !lojaId) return;
    if (!validar()) return;

    setEnviando(true);
    try {
      if (statusEmEdicao) {
        await atualizarStatusOS({ id: statusEmEdicao.id, ...form });
        notificarSucesso("Status atualizado.");
      } else {
        await criarStatusOS({ loja_id: lojaId, ordem: status.length + 1, ...form });
        notificarSucesso("Status criado.");
      }
      setPainelAberto(false);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleExcluir(s: StatusOS) {
    if (!confirm(`Excluir o status "${s.nome}"?`)) return;
    try {
      await excluirStatusOS(s.id);
      notificarSucesso("Status excluído.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  async function mover(indice: number, direcao: -1 | 1) {
    const novoIndice = indice + direcao;
    if (novoIndice < 0 || novoIndice >= status.length) return;
    const copia = [...status];
    [copia[indice], copia[novoIndice]] = [copia[novoIndice], copia[indice]];
    setStatus(copia);
    await reordenarStatusOS(copia.map((s, i) => ({ id: s.id, ordem: i + 1 })));
  }

  return (
    <div>
      <div className="flex justify-end">
        <button
          onClick={abrirCadastro}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Novo status
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium">Categoria</th>
                <th className="px-5 py-3.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={3} />}
              {!carregando &&
                status.map((s, indice) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2 font-medium text-text-primary">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.cor ?? "#6B6B6B" }}
                        />
                        {s.nome}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-text-secondary">
                      {CATEGORIAS.find((c) => c.valor === s.categoria)?.label}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => mover(indice, -1)}
                          disabled={indice === 0}
                          aria-label="Mover para cima"
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 disabled:opacity-30"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() => mover(indice, 1)}
                          disabled={indice === status.length - 1}
                          aria-label="Mover para baixo"
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 disabled:opacity-30"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          onClick={() => abrirEdicao(s)}
                          aria-label={`Editar ${s.nome}`}
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 hover:text-accent"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleExcluir(s)}
                          aria-label={`Excluir ${s.nome}`}
                          className="rounded-lg p-1.5 text-text-secondary hover:bg-white/5 hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <SidePanel
        aberto={painelAberto}
        onFechar={() => !enviando && setPainelAberto(false)}
        titulo={statusEmEdicao ? "Editar status" : "Novo status"}
      >
        <div className="flex flex-col gap-4">
          <Field
            id="status_nome"
            label="Nome do status"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
          />
          <SelectField
            id="status_categoria"
            label="Categoria"
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaStatus })}
          >
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.label}
              </option>
            ))}
          </SelectField>
          <div>
            <p className="mb-1.5 text-sm font-medium text-text-secondary">Cor</p>
            <div className="flex flex-wrap gap-2">
              {CORES_SUGERIDAS.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setForm({ ...form, cor })}
                  aria-label={`Cor ${cor}`}
                  className={`h-8 w-8 rounded-full transition-transform ${
                    form.cor === cor ? "scale-110 ring-2 ring-white/40" : ""
                  }`}
                  style={{ backgroundColor: cor }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-border pt-5">
          <button
            onClick={() => setPainelAberto(false)}
            disabled={enviando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            {statusEmEdicao ? "Salvar alterações" : "Criar status"}
          </button>
        </div>
      </SidePanel>
    </div>
  );
}

interface FormularioFuncionario {
  nome: string;
  email: string;
  senha: string;
  codigo_autorizacao: string;
  ativo: boolean;
}

const FUNCIONARIO_VAZIO: FormularioFuncionario = {
  nome: "",
  email: "",
  senha: "",
  codigo_autorizacao: "",
  ativo: true,
};

function AbaEquipe() {
  const { lojaId } = useAuth();
  const { notificarSucesso, notificarErro } = useToast();

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  const [painelAberto, setPainelAberto] = useState(false);
  const [funcionarioEmEdicao, setFuncionarioEmEdicao] = useState<Funcionario | null>(null);
  const [form, setForm] = useState<FormularioFuncionario>(FUNCIONARIO_VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof FormularioFuncionario, string>>>({});
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    if (!lojaId) return;
    setCarregando(true);
    try {
      setFuncionarios(await listarFuncionarios(lojaId));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar equipe.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [lojaId]);

  const funcionariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return funcionarios;
    return funcionarios.filter(
      (f) => f.nome.toLowerCase().includes(termo) || f.email.toLowerCase().includes(termo),
    );
  }, [funcionarios, busca]);

  function abrirCadastro() {
    setFuncionarioEmEdicao(null);
    setForm(FUNCIONARIO_VAZIO);
    setErros({});
    setPainelAberto(true);
  }

  function abrirEdicao(f: Funcionario) {
    setFuncionarioEmEdicao(f);
    setForm({
      nome: f.nome,
      email: f.email,
      senha: "",
      codigo_autorizacao: f.codigo_autorizacao ?? "",
      ativo: f.ativo,
    });
    setErros({});
    setPainelAberto(true);
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormularioFuncionario, string>> = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome.";
    if (!form.email.trim()) novosErros.email = "Informe o e-mail.";
    else if (!isValidEmail(form.email)) novosErros.email = "E-mail inválido.";
    if (!funcionarioEmEdicao && (!form.senha || form.senha.length < 8)) {
      novosErros.senha = "Mínimo de 8 caracteres.";
    }
    if (form.codigo_autorizacao && form.codigo_autorizacao.length < 4) {
      novosErros.codigo_autorizacao = "Use ao menos 4 dígitos.";
    }
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit() {
    if (enviando) return;
    if (!validar()) return;

    setEnviando(true);
    try {
      if (funcionarioEmEdicao) {
        await atualizarFuncionario({
          funcionario_id: funcionarioEmEdicao.id,
          nome: form.nome,
          email: form.email,
          ativo: form.ativo,
          codigo_autorizacao: form.codigo_autorizacao,
        });
        notificarSucesso("Funcionário atualizado.");
      } else {
        await criarFuncionario({
          nome: form.nome,
          email: form.email,
          senha: form.senha,
          codigo_autorizacao: form.codigo_autorizacao,
        });
        notificarSucesso("Funcionário cadastrado.");
      }
      setPainelAberto(false);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
          />
        </div>
        <button
          onClick={abrirCadastro}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Cadastrar funcionário
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Nome</th>
                <th className="px-5 py-3.5 font-medium">E-mail</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={4} />}
              {!carregando &&
                funcionariosFiltrados.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-medium text-text-primary">{f.nome}</td>
                    <td className="px-5 py-4 text-text-secondary">{f.email}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          f.ativo ? "bg-success/10 text-success" : "bg-white/5 text-text-muted"
                        }`}
                      >
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => abrirEdicao(f)}
                        aria-label={`Editar ${f.nome}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/5 hover:text-accent"
                      >
                        <Pencil size={14} />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!carregando && funcionariosFiltrados.length === 0 && (
          <EmptyState
            icone={Users}
            titulo={busca ? "Nenhum funcionário encontrado" : "Nenhum funcionário cadastrado"}
            descricao={
              busca
                ? "Tente buscar por outro nome ou e-mail."
                : "Cadastre o primeiro funcionário da sua equipe."
            }
            acao={!busca ? { label: "Cadastrar funcionário", onClick: abrirCadastro } : undefined}
          />
        )}
      </div>

      <SidePanel
        aberto={painelAberto}
        onFechar={() => !enviando && setPainelAberto(false)}
        titulo={funcionarioEmEdicao ? "Editar funcionário" : "Cadastrar funcionário"}
      >
        <div className="flex flex-col gap-4">
          <Field
            id="func_nome"
            label="Nome completo"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
          />
          <Field
            id="func_email"
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            erro={erros.email}
          />
          {!funcionarioEmEdicao && (
            <Field
              id="func_senha"
              label="Senha de acesso"
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              erro={erros.senha}
            />
          )}
          <Field
            id="func_codigo"
            label="Código de autorização (opcional)"
            placeholder="Usado para ações sensíveis"
            value={form.codigo_autorizacao}
            onChange={(e) => setForm({ ...form, codigo_autorizacao: e.target.value })}
            erro={erros.codigo_autorizacao}
          />
          <p className="-mt-2 flex items-start gap-1.5 text-xs text-text-muted">
            <KeyRound size={13} className="mt-0.5 shrink-0" />
            Visível só para você, o gerente. O funcionário não enxerga esse código.
          </p>

          {funcionarioEmEdicao && (
            <label className="flex items-center gap-2.5 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 rounded border-border bg-base accent-accent"
              />
              Funcionário ativo
            </label>
          )}
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-border pt-5">
          <button
            onClick={() => setPainelAberto(false)}
            disabled={enviando}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" />}
            {funcionarioEmEdicao ? "Salvar alterações" : "Cadastrar funcionário"}
          </button>
        </div>
      </SidePanel>
    </div>
  );
}
