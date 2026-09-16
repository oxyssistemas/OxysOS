import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { Field } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { atualizarEndereco, criarEndereco } from "../clientesService";
import { enderecoFormVazio, type DadosEnderecoForm, type EnderecoCliente } from "../tipos";
import { validarEndereco, type ErrosForm } from "../validacao";
import { CamposEndereco } from "./CamposEndereco";

interface EnderecoFormPanelProps {
  aberto: boolean;
  lojaId: string;
  clienteId: string;
  endereco?: EnderecoCliente;
  /** primeiro endereço do cliente vira principal automaticamente */
  primeiroEndereco: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}

function formDoEndereco(e: EnderecoCliente): DadosEnderecoForm {
  return {
    rotulo: e.rotulo,
    cep: e.cep ?? "",
    logradouro: e.logradouro,
    numero: e.numero ?? "",
    complemento: e.complemento ?? "",
    bairro: e.bairro ?? "",
    cidade: e.cidade,
    estado: e.estado,
    referencia: e.referencia ?? "",
    principal: e.principal,
  };
}

export function EnderecoFormPanel({
  aberto,
  lojaId,
  clienteId,
  endereco,
  primeiroEndereco,
  onFechar,
  onSalvo,
}: EnderecoFormPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [dados, setDados] = useState<DadosEnderecoForm>(enderecoFormVazio());
  const [erros, setErros] = useState<ErrosForm>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDados(endereco ? formDoEndereco(endereco) : { ...enderecoFormVazio(primeiroEndereco ? "Principal" : "Filial"), principal: primeiroEndereco });
    setErros({});
  }, [aberto, endereco, primeiroEndereco]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const novosErros = validarEndereco(dados);
    setErros(novosErros);
    const primeiro = Object.keys(novosErros)[0];
    if (primeiro) {
      document.getElementById(primeiro === "rotulo" ? "rotulo_texto" : primeiro)?.focus();
      return;
    }

    setEnviando(true);
    try {
      if (endereco) {
        await atualizarEndereco(endereco.id, dados, endereco.principal);
        notificarSucesso("Endereço atualizado.");
      } else {
        await criarEndereco(lojaId, clienteId, dados);
        notificarSucesso("Endereço adicionado.");
      }
      onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar o endereço.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SidePanel aberto={aberto} largo titulo={endereco ? "Editar endereço" : "Novo endereço"} onFechar={onFechar}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <CamposEndereco dados={dados} onAlterar={setDados} erros={erros} />
        <Field
          id="referencia"
          label="Ponto de referência"
          maxLength={300}
          value={dados.referencia}
          onChange={(e) => setDados({ ...dados, referencia: e.target.value })}
        />
        <label className="flex items-start gap-2.5 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={dados.principal}
            disabled={endereco?.principal || primeiroEndereco}
            onChange={(e) => setDados({ ...dados, principal: e.target.checked })}
          />
          <span>
            Endereço principal
            {(endereco?.principal || primeiroEndereco) && (
              <span className="block text-xs text-text-muted">
                Para trocar, marque outro endereço como principal.
              </span>
            )}
          </span>
        </label>

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
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {endereco ? "Salvar endereço" : "Adicionar endereço"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
