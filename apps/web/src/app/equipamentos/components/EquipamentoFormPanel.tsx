import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, SelectField, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import type { ItemCatalogo } from "@/components/CatalogoSimplesPanel";
import { useCompany } from "../../context/CompanyContext";
import {
  atualizarEquipamento,
  criarCategoria,
  criarEquipamento,
  listarCategorias,
  listarEnderecosDoCliente,
  obterEquipamento,
  type EnderecoOpcao,
} from "../equipamentosService";
import {
  ROTULO_STATUS_EQUIPAMENTO,
  equipamentoFormVazio,
  type DadosEquipamentoForm,
  type Equipamento,
  type StatusEquipamento,
} from "../tipos";
import { ClienteSeletor } from "./ClienteSeletor";

interface EquipamentoFormPanelProps {
  aberto: boolean;
  /** null = novo equipamento */
  equipamentoId: string | null;
  /** pré-seleção ao cadastrar a partir da ficha do cliente */
  clienteInicial?: { id: string; nome: string } | null;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}

type Erros = Partial<Record<keyof DadosEquipamentoForm | "nova_categoria", string>>;

function validar(d: DadosEquipamentoForm): Erros {
  const erros: Erros = {};
  if (!d.cliente) erros.cliente = "Selecione o cliente.";
  if (!d.nome.trim()) erros.nome = "Informe o nome do equipamento.";
  else if (d.nome.trim().length > 150) erros.nome = "Use no máximo 150 caracteres.";
  if (d.marca.length > 80) erros.marca = "Use no máximo 80 caracteres.";
  if (d.modelo.length > 80) erros.modelo = "Use no máximo 80 caracteres.";
  if (d.numero_serie.length > 100) erros.numero_serie = "Use no máximo 100 caracteres.";
  if (d.localizacao.length > 200) erros.localizacao = "Use no máximo 200 caracteres.";
  if (d.observacoes.length > 5000) erros.observacoes = "Use no máximo 5.000 caracteres.";
  if (d.data_instalacao && d.data_instalacao < "1950-01-01") erros.data_instalacao = "Data inválida.";
  if (d.garantia_ate && d.garantia_ate < "1950-01-01") erros.garantia_ate = "Data inválida.";
  return erros;
}

function formDoEquipamento(e: Equipamento): DadosEquipamentoForm {
  return {
    cliente: e.cliente ? { id: e.cliente.id, nome: e.cliente.nome } : null,
    cliente_endereco_id: e.cliente_endereco_id ?? "",
    categoria_id: e.categoria_id ?? "",
    nome: e.nome,
    marca: e.marca ?? "",
    modelo: e.modelo ?? "",
    numero_serie: e.numero_serie ?? "",
    data_instalacao: e.data_instalacao ?? "",
    garantia_ate: e.garantia_ate ?? "",
    localizacao: e.localizacao ?? "",
    observacoes: e.observacoes ?? "",
    status: e.status,
  };
}

export function EquipamentoFormPanel({ aberto, equipamentoId, clienteInicial, onFechar, onSalvo }: EquipamentoFormPanelProps) {
  const { company, can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();

  const [equipamento, setEquipamento] = useState<Equipamento | null>(null);
  const [dados, setDados] = useState<DadosEquipamentoForm>(equipamentoFormVazio());
  const [categorias, setCategorias] = useState<ItemCatalogo[]>([]);
  const [enderecos, setEnderecos] = useState<EnderecoOpcao[]>([]);
  const [erros, setErros] = useState<Erros>({});
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [mostrarNovaCategoria, setMostrarNovaCategoria] = useState(false);
  const [criandoCategoria, setCriandoCategoria] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    setErros({});
    setErroCarga(null);
    setNovaCategoria("");
    setMostrarNovaCategoria(false);
    setCarregando(true);
    Promise.all([equipamentoId ? obterEquipamento(equipamentoId) : Promise.resolve(null), listarCategorias()])
      .then(([eq, cats]) => {
        if (cancelado) return;
        if (equipamentoId && !eq) {
          setErroCarga("Equipamento não encontrado.");
          return;
        }
        setEquipamento(eq);
        setDados(eq ? formDoEquipamento(eq) : equipamentoFormVazio(clienteInicial ?? null));
        setCategorias(cats);
      })
      .catch((err) => !cancelado && setErroCarga(err instanceof Error ? err.message : "Erro ao carregar."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [aberto, equipamentoId, clienteInicial]);

  // endereços do cliente escolhido
  const clienteId = dados.cliente?.id ?? null;
  useEffect(() => {
    if (!aberto || !clienteId) {
      setEnderecos([]);
      return;
    }
    let cancelado = false;
    listarEnderecosDoCliente(clienteId)
      .then((lista) => !cancelado && setEnderecos(lista))
      .catch(() => !cancelado && setEnderecos([]));
    return () => {
      cancelado = true;
    };
  }, [aberto, clienteId]);

  const set = <K extends keyof DadosEquipamentoForm>(campo: K, valor: DadosEquipamentoForm[K]) =>
    setDados((d) => ({ ...d, [campo]: valor }));

  async function adicionarCategoria() {
    const nome = novaCategoria.trim();
    if (!nome || !company || criandoCategoria) return;
    setCriandoCategoria(true);
    try {
      const criada = await criarCategoria(company.id, nome);
      setCategorias((lista) => [...lista, criada].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      set("categoria_id", criada.id);
      setNovaCategoria("");
      setMostrarNovaCategoria(false);
      setErros((e) => ({ ...e, nova_categoria: undefined }));
    } catch (err) {
      setErros((e) => ({ ...e, nova_categoria: err instanceof Error ? err.message : "Não foi possível criar." }));
    } finally {
      setCriandoCategoria(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const novosErros = validar(dados);
    setErros(novosErros);
    const primeiro = Object.keys(novosErros)[0];
    if (primeiro) {
      document.getElementById(`equipamento_${primeiro}`)?.focus();
      return;
    }
    if (!company) return;
    setEnviando(true);
    try {
      if (equipamento) {
        await atualizarEquipamento(equipamento.id, equipamento.versao, dados);
        notificarSucesso("Equipamento atualizado.");
        onSalvo(equipamento.id);
      } else {
        const id = await criarEquipamento(company.id, dados);
        notificarSucesso("Equipamento cadastrado.");
        onSalvo(id);
      }
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o equipamento.");
    } finally {
      setEnviando(false);
    }
  }

  const categoriasVisiveis = categorias.filter((c) => c.ativo || c.id === dados.categoria_id);
  const podeCriarCategoria = can("assets.edit");
  const clienteFixo = !!clienteInicial && !equipamentoId;

  return (
    <SidePanel
      aberto={aberto}
      largo
      titulo={equipamentoId ? "Editar equipamento" : "Novo equipamento"}
      subtitulo={equipamento ? equipamento.nome : "Campos com * são obrigatórios"}
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
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <ClienteSeletor
                id="equipamento_cliente"
                label="Cliente *"
                valor={dados.cliente}
                disabled={clienteFixo}
                onAlterar={(cliente) => setDados((d) => ({ ...d, cliente, cliente_endereco_id: "" }))}
                erro={erros.cliente}
              />
            </div>
            <div className="sm:col-span-2">
              <SelectField
                id="equipamento_cliente_endereco_id"
                label="Endereço do cliente"
                value={dados.cliente_endereco_id}
                disabled={!dados.cliente}
                onChange={(e) => set("cliente_endereco_id", e.target.value)}
              >
                <option value="">{dados.cliente ? (enderecos.length ? "Não informado" : "Cliente sem endereços cadastrados") : "Selecione o cliente primeiro"}</option>
                {enderecos.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.rotulo} · {en.logradouro}
                    {en.numero ? `, ${en.numero}` : ""} · {en.cidade}/{en.estado}
                  </option>
                ))}
              </SelectField>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                id="equipamento_nome"
                label="Nome *"
                placeholder="Ex.: DVR da portaria"
                maxLength={150}
                value={dados.nome}
                onChange={(e) => set("nome", e.target.value)}
                erro={erros.nome}
              />
            </div>
            <div className="flex flex-col gap-1">
              <SelectField
                id="equipamento_categoria_id"
                label="Categoria"
                value={dados.categoria_id}
                onChange={(e) => set("categoria_id", e.target.value)}
              >
                <option value="">Sem categoria</option>
                {categoriasVisiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {!c.ativo ? " (inativa)" : ""}
                  </option>
                ))}
              </SelectField>
              {podeCriarCategoria && !mostrarNovaCategoria && (
                <button
                  type="button"
                  onClick={() => setMostrarNovaCategoria(true)}
                  className="flex items-center gap-1 self-start text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <Plus size={12} aria-hidden="true" /> Nova categoria
                </button>
              )}
              {mostrarNovaCategoria && (
                <div>
                  <div className="flex gap-2">
                    <label htmlFor="equipamento_nova_categoria" className="sr-only">
                      Nome da nova categoria
                    </label>
                    <input
                      id="equipamento_nova_categoria"
                      autoFocus
                      maxLength={60}
                      value={novaCategoria}
                      placeholder="Ex.: Câmera"
                      onChange={(e) => setNovaCategoria(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          adicionarCategoria();
                        }
                      }}
                      aria-invalid={!!erros.nova_categoria}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={adicionarCategoria}
                      disabled={!novaCategoria.trim() || criandoCategoria}
                      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-white/5 disabled:opacity-50"
                    >
                      {criandoCategoria ? <Loader2 size={14} className="animate-spin" aria-label="Criando" /> : "Criar"}
                    </button>
                  </div>
                  {erros.nova_categoria && <p className="mt-1 text-xs text-danger">{erros.nova_categoria}</p>}
                </div>
              )}
            </div>
            <SelectField
              id="equipamento_status"
              label="Situação"
              value={dados.status}
              onChange={(e) => set("status", e.target.value as StatusEquipamento)}
            >
              {(Object.keys(ROTULO_STATUS_EQUIPAMENTO) as StatusEquipamento[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS_EQUIPAMENTO[s]}
                </option>
              ))}
            </SelectField>
            <Field id="equipamento_marca" label="Marca" maxLength={80} value={dados.marca} onChange={(e) => set("marca", e.target.value)} erro={erros.marca} />
            <Field id="equipamento_modelo" label="Modelo" maxLength={80} value={dados.modelo} onChange={(e) => set("modelo", e.target.value)} erro={erros.modelo} />
            <div className="sm:col-span-2">
              <Field
                id="equipamento_numero_serie"
                label="Número de série"
                maxLength={100}
                value={dados.numero_serie}
                onChange={(e) => set("numero_serie", e.target.value)}
                erro={erros.numero_serie}
              />
            </div>
            <Field
              id="equipamento_data_instalacao"
              label="Data de instalação"
              type="date"
              value={dados.data_instalacao}
              onChange={(e) => set("data_instalacao", e.target.value)}
              erro={erros.data_instalacao}
            />
            <Field
              id="equipamento_garantia_ate"
              label="Garantia até"
              type="date"
              value={dados.garantia_ate}
              onChange={(e) => set("garantia_ate", e.target.value)}
              erro={erros.garantia_ate}
            />
            <div className="sm:col-span-2">
              <Field
                id="equipamento_localizacao"
                label="Localização"
                placeholder="Ex.: Sala de monitoramento, rack 2"
                maxLength={200}
                value={dados.localizacao}
                onChange={(e) => set("localizacao", e.target.value)}
                erro={erros.localizacao}
              />
            </div>
          </section>

          <TextareaField
            id="equipamento_observacoes"
            label="Observações"
            maxLength={5000}
            value={dados.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            erro={erros.observacoes}
          />

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
              {equipamentoId ? "Salvar alterações" : "Cadastrar equipamento"}
            </button>
          </div>
        </form>
      )}
    </SidePanel>
  );
}
