import { CatalogoSimplesPanel } from "@/components/CatalogoSimplesPanel";
import {
  criarEspecialidade,
  definirEspecialidadeAtiva,
  excluirEspecialidade,
  listarEspecialidades,
  renomearEspecialidade,
} from "../tecnicosService";

async function listar() {
  const itens = await listarEspecialidades();
  return itens.map((e) => ({ id: e.id, nome: e.nome, ativo: e.ativo, total_uso: e.total_tecnicos }));
}

async function criar(lojaId: string, nome: string) {
  await criarEspecialidade(lojaId, nome);
}

interface EspecialidadesPanelProps {
  aberto: boolean;
  onFechar: () => void;
  onAlterado: () => void;
}

export function EspecialidadesPanel({ aberto, onFechar, onAlterado }: EspecialidadesPanelProps) {
  return (
    <CatalogoSimplesPanel
      aberto={aberto}
      titulo="Especialidades"
      subtitulo="Configure as especialidades usadas pela sua equipe técnica."
      placeholder="Ex.: Ar-condicionado"
      unidadeUso={{ singular: "técnico", plural: "técnicos" }}
      listar={listar}
      criar={criar}
      renomear={renomearEspecialidade}
      definirAtivo={definirEspecialidadeAtiva}
      excluir={excluirEspecialidade}
      onFechar={onFechar}
      onAlterado={onAlterado}
    />
  );
}
