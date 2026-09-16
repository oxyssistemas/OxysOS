import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users, Pencil, Loader2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField } from "@oxys/shared/components/Field";
import { EmptyState, TabelaSkeleton } from "@oxys/shared/components/EstadosLista";
import { useToast } from "@oxys/shared/components/Toast";
import { isValidEmail } from "@oxys/shared/masks";
import {
  listarGerentesComLoja,
  criarGerente,
  atualizarGerente,
  listarLojasParaSelecao,
  type GerenteComLoja,
} from "../data/gerentesService";
import type { Loja } from "../types";

interface FormularioGerente {
  nome: string;
  email: string;
  senha: string;
  loja_id: string;
}

const FORMULARIO_VAZIO: FormularioGerente = { nome: "", email: "", senha: "", loja_id: "" };

export function GerentesPage() {
  const { notificarSucesso, notificarErro } = useToast();
  const [gerentes, setGerentes] = useState<GerenteComLoja[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  const [painelAberto, setPainelAberto] = useState(false);
  const [gerenteEmEdicao, setGerenteEmEdicao] = useState<GerenteComLoja | null>(null);
  const [form, setForm] = useState<FormularioGerente>(FORMULARIO_VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof FormularioGerente, string>>>({});
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const [dadosGerentes, dadosLojas] = await Promise.all([
        listarGerentesComLoja(),
        listarLojasParaSelecao(),
      ]);
      setGerentes(dadosGerentes);
      setLojas(dadosLojas);
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Erro ao carregar gerentes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const gerentesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return gerentes;
    return gerentes.filter(
      (g) => g.nome.toLowerCase().includes(termo) || g.email.toLowerCase().includes(termo),
    );
  }, [gerentes, busca]);

  function abrirCadastro() {
    setGerenteEmEdicao(null);
    setForm(FORMULARIO_VAZIO);
    setErros({});
    setPainelAberto(true);
  }

  function abrirEdicao(gerente: GerenteComLoja) {
    setGerenteEmEdicao(gerente);
    setForm({ nome: gerente.nome, email: gerente.email, senha: "", loja_id: gerente.loja_id });
    setErros({});
    setPainelAberto(true);
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormularioGerente, string>> = {};
    if (!form.nome.trim()) novosErros.nome = "Informe o nome completo.";
    if (!form.email.trim()) novosErros.email = "Informe o e-mail.";
    else if (!isValidEmail(form.email)) novosErros.email = "E-mail inválido.";
    if (!form.loja_id) novosErros.loja_id = "Selecione uma loja.";
    if (!gerenteEmEdicao && (!form.senha || form.senha.length < 8)) {
      novosErros.senha = "Mínimo de 8 caracteres.";
    }
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSubmit() {
    if (enviando) return;
    if (!validar()) return;

    setEnviando(true);
    try {
      if (gerenteEmEdicao) {
        await atualizarGerente({
          gerente_id: gerenteEmEdicao.id,
          nome: form.nome,
          email: form.email,
          loja_id: form.loja_id,
        });
        notificarSucesso("Gerente atualizado com sucesso.");
      } else {
        await criarGerente({
          loja_id: form.loja_id,
          nome_gerente: form.nome,
          email_gerente: form.email,
          senha_gerente: form.senha,
        });
        notificarSucesso("Gerente cadastrado com sucesso.");
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
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Gerentes</h1>
          <p className="mt-1 text-sm text-text-secondary">Gerencie os responsáveis por cada loja.</p>
        </div>
        <button
          onClick={abrirCadastro}
          disabled={lojas.length === 0}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} />
          Cadastrar gerente
        </button>
      </div>

      <div className="relative mt-6 max-w-sm">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar por nome ou e-mail"
          className="w-full rounded-lg border border-border bg-panel py-2.5 pl-10 pr-3.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3.5 font-medium">Nome</th>
                <th className="px-5 py-3.5 font-medium">E-mail</th>
                <th className="px-5 py-3.5 font-medium">Loja vinculada</th>
                <th className="px-5 py-3.5 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <TabelaSkeleton colunas={4} />}
              {!carregando &&
                gerentesFiltrados.map((gerente) => (
                  <tr key={gerente.id} className="border-b border-border last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-medium text-text-primary">{gerente.nome}</td>
                    <td className="px-5 py-4 text-text-secondary">{gerente.email}</td>
                    <td className="px-5 py-4 text-text-secondary">{gerente.loja?.nome ?? "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => abrirEdicao(gerente)}
                        aria-label={`Editar ${gerente.nome}`}
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

        {!carregando && gerentesFiltrados.length === 0 && (
          <EmptyState
            icone={Users}
            titulo={busca ? "Nenhum gerente encontrado" : "Nenhum gerente cadastrado"}
            descricao={
              busca
                ? "Tente buscar por outro nome ou e-mail."
                : lojas.length === 0
                  ? "Cadastre uma loja primeiro para poder vincular um gerente."
                  : "Cadastre um gerente e vincule a uma loja existente."
            }
            acao={!busca && lojas.length > 0 ? { label: "Cadastrar gerente", onClick: abrirCadastro } : undefined}
          />
        )}
      </div>

      <SidePanel
        aberto={painelAberto}
        onFechar={() => !enviando && setPainelAberto(false)}
        titulo={gerenteEmEdicao ? "Editar gerente" : "Cadastrar gerente"}
        subtitulo={
          gerenteEmEdicao ? gerenteEmEdicao.email : "Vincule o gerente a uma loja já cadastrada."
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            id="nome_gerente_form"
            label="Nome completo"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            erro={erros.nome}
          />
          <Field
            id="email_gerente_form"
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            erro={erros.email}
          />
          {!gerenteEmEdicao && (
            <Field
              id="senha_gerente_form"
              label="Senha de acesso"
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              erro={erros.senha}
            />
          )}
          <SelectField
            id="loja_id_form"
            label="Loja vinculada"
            value={form.loja_id}
            onChange={(e) => setForm({ ...form, loja_id: e.target.value })}
            erro={erros.loja_id}
          >
            <option value="">Selecione uma loja</option>
            {lojas.map((loja) => (
              <option key={loja.id} value={loja.id}>
                {loja.nome}
              </option>
            ))}
          </SelectField>
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
            {gerenteEmEdicao ? "Salvar alterações" : "Cadastrar gerente"}
          </button>
        </div>
      </SidePanel>
    </div>
  );
}
