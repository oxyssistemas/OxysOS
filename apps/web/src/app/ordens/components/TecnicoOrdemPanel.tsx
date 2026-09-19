import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { SidePanel } from "@oxys/shared/components/SidePanel";
import { SelectField } from "@oxys/shared/components/Field";
import { useToast } from "@oxys/shared/components/Toast";
import { atribuirTecnico } from "../ordensService";
import type { OpcaoTecnico, OrdemDetalhe } from "../tipos";

interface TecnicoOrdemPanelProps {
  aberto: boolean;
  ordem: OrdemDetalhe;
  tecnicos: OpcaoTecnico[];
  onFechar: () => void;
  onConcluido: () => void;
}

export function TecnicoOrdemPanel({ aberto, ordem, tecnicos, onFechar, onConcluido }: TecnicoOrdemPanelProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [tecnicoId, setTecnicoId] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) setTecnicoId(ordem.tecnico_id ?? "");
  }, [aberto, ordem.tecnico_id]);

  // técnico atual desativado continua listado para não sumir do campo
  const opcoes =
    ordem.tecnico && !tecnicos.some((t) => t.id === ordem.tecnico!.id)
      ? [{ id: ordem.tecnico.id, nome: `${ordem.tecnico.nome} (inativo)` }, ...tecnicos]
      : tecnicos;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (salvando) return;
    if ((tecnicoId || null) === ordem.tecnico_id) {
      onFechar();
      return;
    }
    setSalvando(true);
    try {
      await atribuirTecnico(ordem.id, ordem.versao, tecnicoId || null);
      notificarSucesso(tecnicoId ? "Técnico atribuído." : "Técnico removido da OS.");
      onConcluido();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível atribuir o técnico.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SidePanel aberto={aberto} onFechar={() => !salvando && onFechar()} titulo="Atribuir técnico" subtitulo={ordem.numero}>
      <form onSubmit={salvar} className="flex flex-col gap-5">
        <SelectField id="os_tecnico" label="Técnico" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
          <option value="">Sem técnico</option>
          {opcoes.map((t) => (
            <option key={t.id} value={t.id} disabled={t.nome.endsWith("(inativo)")}>
              {t.nome}
            </option>
          ))}
        </SelectField>
        {tecnicos.length === 0 && <p className="text-xs text-text-muted">Nenhum técnico ativo cadastrado.</p>}
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-white/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Salvar
          </button>
        </div>
      </form>
    </SidePanel>
  );
}
