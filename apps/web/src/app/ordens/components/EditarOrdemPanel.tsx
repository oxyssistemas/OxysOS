import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { useToast } from "@oxys/shared/components/Toast";
import { atualizarOrdem } from "../ordensService";
import type { ApoioOrdem } from "../useApoioOrdem";
import { paraDatetimeLocal, type DadosOrdemForm, type OrdemDetalhe } from "../tipos";
import { CamposOrdem, validarOrdem, type ErrosOrdem } from "./CamposOrdem";

interface EditarOrdemPanelProps {
  aberto: boolean;
  ordem: OrdemDetalhe;
  apoio: ApoioOrdem | null;
  onFechar: () => void;
  onSalvo: () => void;
}

function formDaOrdem(o: OrdemDetalhe): DadosOrdemForm {
  return {
    titulo: o.titulo ?? "",
    descricao: o.descricao,
    objeto_atendimento: o.objeto_atendimento ?? "",
    local_atendimento: o.local_atendimento,
    cliente_endereco_id: o.cliente_endereco_id ?? "",
    equipamento_id: o.equipamento_id ?? "",
    tipo_servico_id: o.tipo_servico_id ?? "",
    prioridade_id: o.prioridade_id,
    data_agendada: o.data_agendada ?? "",
    hora_agendada: o.hora_agendada?.slice(0, 5) ?? "",
    modo_prazo: o.sla_horas ? "horas" : o.prazo_em ? "data" : "sem",
    sla_horas: o.sla_horas ? String(o.sla_horas) : "",
    prazo_data: paraDatetimeLocal(o.prazo_em),
    observacoes_internas: o.observacoes_internas ?? "",
  };
}

export function EditarOrdemPanel({ aberto, ordem, apoio, onFechar, onSalvo }: EditarOrdemPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [dados, setDados] = useState<DadosOrdemForm>(() => formDaOrdem(ordem));
  const [erros, setErros] = useState<ErrosOrdem>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setDados(formDaOrdem(ordem));
      setErros({});
    }
  }, [aberto, ordem]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const novosErros = validarOrdem(dados);
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;
    setSalvando(true);
    try {
      await atualizarOrdem(ordem.id, ordem.versao, dados);
      notificarSucesso("Ordem de serviço atualizada.");
      onSalvo();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SidePanel aberto={aberto} onFechar={() => !salvando && onFechar()} titulo="Editar ordem de serviço" subtitulo={`${ordem.numero} · ${ordem.cliente.nome}`} largo>
      {!apoio ? (
        <div className="flex justify-center py-16">
          <Loader2 size={22} className="animate-spin text-accent" aria-label="Carregando" />
        </div>
      ) : (
        <form onSubmit={salvar} noValidate className="flex flex-col gap-6">
          <CamposOrdem
            idPrefixo="editar_os"
            dados={dados}
            onAlterar={(parcial) => setDados((d) => ({ ...d, ...parcial }))}
            erros={erros}
            clienteId={ordem.cliente.id}
            apoio={apoio}
            modosPrazo={["horas", "data", "sem"]}
            atuais={{ tipo: ordem.tipo_servico_id, prioridade: ordem.prioridade_id }}
          />
          <div className="sticky -bottom-6 -mx-6 flex justify-end gap-3 border-t border-border bg-panel px-6 py-4">
            <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Salvar alterações
            </button>
          </div>
        </form>
      )}
    </SidePanel>
  );
}
