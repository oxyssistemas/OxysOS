import { useEffect, useState, type FormEvent } from "react";
import { Building2, Loader2, User } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field, TextareaField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { formatarDocumento, maskCnpjAlfanumerico, maskCpf, maskPhone } from "@oxys/shared/masks";
import { ConflitoVersaoError, atualizarCliente, criarCliente, listarTagsClientes } from "../clientesService";
import { clienteFormVazio, enderecoFormVazio, type Cliente, type DadosClienteForm, type TipoPessoa } from "../tipos";
import { enderecoPreenchido, validarCliente, validarEndereco, type ErrosForm } from "../validacao";
import { TagsInput } from "./TagsInput";
import { CamposEndereco } from "./CamposEndereco";

interface ClienteFormPanelProps {
  aberto: boolean;
  /** undefined = novo cliente */
  cliente?: Cliente;
  onFechar: () => void;
  onSalvo: (id: string) => void;
}

function formDoCliente(c: Cliente): DadosClienteForm {
  return {
    tipo_pessoa: c.tipo_pessoa,
    nome: c.tipo_pessoa === "pf" ? c.nome : "",
    documento: formatarDocumento(c.documento, c.tipo_pessoa),
    razao_social: c.razao_social ?? "",
    nome_fantasia: c.nome_fantasia ?? "",
    email: c.email ?? "",
    telefone: c.telefone ?? "",
    whatsapp: c.whatsapp ?? "",
    observacoes: c.observacoes ?? "",
    tags: c.tags,
  };
}

export function ClienteFormPanel({ aberto, cliente, onFechar, onSalvo }: ClienteFormPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const edicao = !!cliente;

  const [dados, setDados] = useState<DadosClienteForm>(clienteFormVazio());
  const [endereco, setEndereco] = useState(enderecoFormVazio());
  const [erros, setErros] = useState<ErrosForm>({});
  const [sugestoesTags, setSugestoesTags] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDados(cliente ? formDoCliente(cliente) : clienteFormVazio());
    setEndereco(enderecoFormVazio());
    setErros({});
    listarTagsClientes().then(setSugestoesTags);
  }, [aberto, cliente]);

  const set = <K extends keyof DadosClienteForm>(campo: K, valor: DadosClienteForm[K]) =>
    setDados((d) => ({ ...d, [campo]: valor }));

  function alterarTipo(tipo: TipoPessoa) {
    if (tipo === dados.tipo_pessoa) return;
    setDados((d) => ({ ...d, tipo_pessoa: tipo, documento: "" }));
    setErros({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;

    const incluirEndereco = !edicao && enderecoPreenchido(endereco);
    const novosErros = {
      ...validarCliente(dados),
      ...(incluirEndereco ? validarEndereco(endereco, "end_") : {}),
    };
    setErros(novosErros);
    const primeiroCampo = Object.keys(novosErros)[0];
    if (primeiroCampo) {
      document.getElementById(primeiroCampo === "tags" ? "cliente_tags" : primeiroCampo)?.focus();
      return;
    }

    setEnviando(true);
    try {
      if (cliente) {
        await atualizarCliente(cliente.id, cliente.versao, dados);
        notificarSucesso("Cliente atualizado.");
        onSalvo(cliente.id);
      } else {
        const id = await criarCliente(dados, incluirEndereco ? endereco : null);
        notificarSucesso("Cliente cadastrado.");
        onSalvo(id);
      }
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o cliente.");
      if (err instanceof ConflitoVersaoError) onFechar();
    } finally {
      setEnviando(false);
    }
  }

  const pj = dados.tipo_pessoa === "pj";

  return (
    <SidePanel
      aberto={aberto}
      largo
      titulo={edicao ? "Editar cliente" : "Novo cliente"}
      subtitulo={edicao ? cliente?.nome : "Campos com * são obrigatórios"}
      onFechar={onFechar}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-secondary">Tipo de cliente</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(
              [
                { tipo: "pf", label: "Pessoa física", icone: User },
                { tipo: "pj", label: "Pessoa jurídica", icone: Building2 },
              ] as const
            ).map(({ tipo, label, icone: Icone }) => (
              <button
                key={tipo}
                type="button"
                role="radio"
                aria-checked={dados.tipo_pessoa === tipo}
                onClick={() => alterarTipo(tipo)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  dados.tipo_pessoa === tipo
                    ? "border-accent bg-accent-muted text-text-primary"
                    : "border-border text-text-secondary hover:bg-white/5"
                }`}
              >
                <Icone size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pj ? (
            <>
              <div className="sm:col-span-2">
                <Field
                  id="razao_social"
                  label="Razão social *"
                  maxLength={200}
                  value={dados.razao_social}
                  onChange={(e) => set("razao_social", e.target.value)}
                  erro={erros.razao_social}
                />
              </div>
              <Field
                id="nome_fantasia"
                label="Nome fantasia"
                maxLength={200}
                value={dados.nome_fantasia}
                onChange={(e) => set("nome_fantasia", e.target.value)}
                erro={erros.nome_fantasia}
              />
              <Field
                id="documento"
                label="CNPJ"
                placeholder="00.000.000/0000-00"
                autoCapitalize="characters"
                value={dados.documento}
                onChange={(e) => set("documento", maskCnpjAlfanumerico(e.target.value))}
                erro={erros.documento}
              />
            </>
          ) : (
            <>
              <Field
                id="nome"
                label="Nome *"
                autoComplete="name"
                maxLength={200}
                value={dados.nome}
                onChange={(e) => set("nome", e.target.value)}
                erro={erros.nome}
              />
              <Field
                id="documento"
                label="CPF"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={dados.documento}
                onChange={(e) => set("documento", maskCpf(e.target.value))}
                erro={erros.documento}
              />
            </>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Contato</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field
                id="email"
                label="E-mail"
                type="email"
                autoComplete="email"
                value={dados.email}
                onChange={(e) => set("email", e.target.value)}
                erro={erros.email}
              />
            </div>
            <Field
              id="telefone"
              label="Telefone"
              type="tel"
              inputMode="tel"
              placeholder="(00) 0000-0000"
              value={dados.telefone}
              onChange={(e) => set("telefone", maskPhone(e.target.value))}
              erro={erros.telefone}
            />
            <div className="flex flex-col gap-1">
              <Field
                id="whatsapp"
                label="WhatsApp"
                type="tel"
                inputMode="tel"
                placeholder="(00) 00000-0000"
                value={dados.whatsapp}
                onChange={(e) => set("whatsapp", maskPhone(e.target.value))}
                erro={erros.whatsapp}
              />
              {dados.telefone && !dados.whatsapp && (
                <button
                  type="button"
                  onClick={() => set("whatsapp", dados.telefone)}
                  className="self-start text-xs font-medium text-accent hover:text-accent-hover"
                >
                  Usar o mesmo número do telefone
                </button>
              )}
            </div>
          </div>
        </section>

        {!edicao && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Endereço principal</h3>
            <p className="mb-3 text-xs text-text-muted">Opcional. Outros endereços podem ser adicionados depois.</p>
            <CamposEndereco dados={endereco} onAlterar={setEndereco} erros={erros} prefixo="end_" />
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Outras informações</h3>
          <TagsInput
            id="cliente_tags"
            label="Tags"
            valor={dados.tags}
            onAlterar={(tags) => set("tags", tags)}
            sugestoes={sugestoesTags}
            erro={erros.tags}
          />
          <TextareaField
            id="observacoes"
            label="Observações"
            maxLength={5000}
            value={dados.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            erro={erros.observacoes}
          />
        </section>

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
            {edicao ? "Salvar alterações" : "Cadastrar cliente"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
