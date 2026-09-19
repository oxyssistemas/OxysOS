import { CatalogoSimplesPanel } from "@/components/CatalogoSimplesPanel";
import {
  criarCategoria,
  definirCategoriaAtiva,
  excluirCategoria,
  listarCategorias,
  renomearCategoria,
} from "../equipamentosService";

async function criar(lojaId: string, nome: string) {
  await criarCategoria(lojaId, nome);
}

interface CategoriasEquipamentoPanelProps {
  aberto: boolean;
  onFechar: () => void;
  onAlterado: () => void;
}

export function CategoriasEquipamentoPanel({ aberto, onFechar, onAlterado }: CategoriasEquipamentoPanelProps) {
  return (
    <CatalogoSimplesPanel
      aberto={aberto}
      titulo="Categorias de equipamento"
      subtitulo="Defina as categorias usadas pela sua empresa (ex.: câmera, DVR, split)."
      placeholder="Ex.: Central de alarme"
      unidadeUso={{ singular: "equipamento", plural: "equipamentos" }}
      listar={listarCategorias}
      criar={criar}
      renomear={renomearCategoria}
      definirAtivo={definirCategoriaAtiva}
      excluir={excluirCategoria}
      onFechar={onFechar}
      onAlterado={onAlterado}
    />
  );
}
