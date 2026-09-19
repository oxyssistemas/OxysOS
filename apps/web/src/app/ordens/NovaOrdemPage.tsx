import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { SelectField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { TelaCarregando } from "@/components/TelaCarregando";
import { useCompany } from "../context/CompanyContext";
import { ClienteSeletor } from "../equipamentos/components/ClienteSeletor";
import { ClienteFormPanel } from "../clientes/components/ClienteFormPanel";
import { criarOrdem, obterClienteBasico, obterEquipamentoBasico } from "./ordensService";
import { useApoioOrdem } from "./useApoioOrdem";
import { CamposOrdem, validarOrdem, type ErrosOrdem } from "./components/CamposOrdem";
import type { DadosOrdemForm } from "./tipos";

function formularioVazio(prioridadePadrao: string): DadosOrdemForm {
  return {
    titulo: "",
    descricao: "",
    objeto_atendimento: "",
    local_atendimento: "loja",
    cliente_endereco_id: "",
    equipamento_id: "",
    tipo_servico_id: "",
    prioridade_id: prioridadePadrao,
    data_agendada: "",
    hora_agendada: "",
    modo_prazo: "prioridade",
    sla_horas: "",
    prazo_data: "",
    observacoes_internas: "",
  };
}

/** /app/service-orders/new — aceita ?cliente= e ?equipamento= para abrir já preenchida. */
export function NovaOrdemPage() {
  const { company, can, hasFeature } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { apoio, erro: erroApoio } = useApoioOrdem();

  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [tecnicoId, setTecnicoId] = useState("");
  const [dados, setDados] = useState<DadosOrdemForm | null>(null);
  const [erros, setErros] = useState<ErrosOrdem & { cliente?: string }>({});
  const [salvando, setSalvando] = useState(false);
  const [novoCliente, setNovoCliente] = useState(false);
  const preenchido = useRef(false);

  // formulário inicial, com a prioridade padrão da empresa
  useEffect(() => {
    if (!apoio || dados) return;
    const padrao = apoio.prioridades.find((p) => p.padrao && p.ativo) ?? apoio.prioridades.find((p) => p.ativo);
    setDados(formularioVazio(padrao?.id ?? ""));
  }, [apoio, dados]);

  // pré-preenchimento vindo do cliente ou do equipamento
  useEffect(() => {
    if (!dados || preenchido.current) return;
    preenchido.current = true;
    const clienteParam = params.get("cliente");
    const equipamentoParam = params.get("equipamento");
    (async () => {
      let clienteAlvo = clienteParam;
      let equipamentoAlvo = "";
      if (equipamentoParam) {
        const equipamento = await obterEquipamentoBasico(equipamentoParam);
        if (equipamento) {
          clienteAlvo = equipamento.cliente_id;
          equipamentoAlvo = equipamento.id;
        }
      }
      if (!clienteAlvo) return;
      const c = await obterClienteBasico(clienteAlvo);
      if (!c) return;
      setCliente(c);
      if (equipamentoAlvo) setDados((d) => (d ? { ...d, equipamento_id: equipamentoAlvo } : d));
    })();
  }, [dados, params]);

  function alterar(parcial: Partial<DadosOrdemForm>) {
    setDados((d) => (d ? { ...d, ...parcial } : d));
  }

  function trocarCliente(novo: { id: string; nome: string } | null) {
    setCliente(novo);
    // endereço e equipamento pertencem ao cliente anterior
    alterar({ cliente_endereco_id: "", equipamento_id: "" });
    setErros((e) => ({ ...e, cliente: undefined }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!dados || !company || salvando) return;
    const novosErros: ErrosOrdem & { cliente?: string } = validarOrdem(dados);
    if (!cliente) novosErros.cliente = "Selecione o cliente.";
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      notificarErro("Revise os campos destacados.");
      return;
    }
    setSalvando(true);
    try {
      const criada = await criarOrdem({
        lojaId: company.id,
        clienteId: cliente!.id,
        tecnicoId: tecnicoId || null,
        dados,
      });
      notificarSucesso(`Ordem ${criada.numero} aberta.`);
      navigate(`/app/service-orders/${criada.id}`, { replace: true });
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível abrir a OS.");
      setSalvando(false);
    }
  }

  if (erroApoio) {
    return (
      <div role="alert" className="mx-auto max-w-3xl rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
        <AlertTriangle size={16} className="mr-2 inline text-danger" aria-hidden="true" />
        {erroApoio}
      </div>
    );
  }
  if (!apoio || !dados) return <TelaCarregando />;

  const podeAtribuir = can("service_orders.assign") && apoio.tecnicos !== null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/app/service-orders" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
        <ArrowLeft size={16} aria-hidden="true" /> Ordens de serviço
      </Link>
      <h1 className="mt-3 font-display text-xl font-semibold text-text-primary">Nova ordem de serviço</h1>
      <p className="mt-1 text-sm text-text-secondary">O número da OS é gerado automaticamente ao salvar.</p>

      <form onSubmit={salvar} noValidate className="mt-6 flex flex-col gap-7 rounded-xl border border-border bg-panel p-5 sm:p-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">Cliente</legend>
          <ClienteSeletor id="nova_os_cliente" label="Cliente" valor={cliente} onAlterar={trocarCliente} erro={erros.cliente} />
          {!cliente && hasFeature("customers") && can("customers.create") && (
            <button
              type="button"
              onClick={() => setNovoCliente(true)}
              className="flex items-center gap-1.5 self-start text-sm font-medium text-accent hover:text-accent-hover"
            >
              <UserPlus size={15} aria-hidden="true" /> Cadastrar novo cliente
            </button>
          )}
        </fieldset>

        <CamposOrdem
          idPrefixo="nova_os"
          dados={dados}
          onAlterar={alterar}
          erros={erros}
          clienteId={cliente?.id ?? null}
          apoio={apoio}
          modosPrazo={["prioridade", "horas", "data"]}
          sugerirEndereco
        />

        {podeAtribuir && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-xs font-medium uppercase tracking-wide text-text-muted">Técnico</legend>
            <SelectField id="nova_os_tecnico" label="Técnico responsável (opcional)" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">{apoio.tecnicos!.length === 0 ? "Nenhum técnico ativo" : "Definir depois"}</option>
              {apoio.tecnicos!.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </SelectField>
          </fieldset>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Link
            to="/app/service-orders"
            className="rounded-lg px-4 py-2.5 text-center text-sm font-medium text-text-secondary hover:bg-white/5"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Abrir ordem de serviço
          </button>
        </div>
      </form>

      <ClienteFormPanel
        aberto={novoCliente}
        onFechar={() => setNovoCliente(false)}
        onSalvo={async (id) => {
          setNovoCliente(false);
          const c = await obterClienteBasico(id);
          if (c) trocarCliente(c);
        }}
      />
    </div>
  );
}
