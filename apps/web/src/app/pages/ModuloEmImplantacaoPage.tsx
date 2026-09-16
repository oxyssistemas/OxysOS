import type { LucideIcon } from "lucide-react";
import { TelaAviso } from "@/components/TelaAviso";

interface ModuloEmImplantacaoPageProps {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
}

/** Rota já protegida por feature/permissão cujo módulo ainda está sendo construído. */
export function ModuloEmImplantacaoPage({ icone, titulo, descricao }: ModuloEmImplantacaoPageProps) {
  return <TelaAviso icone={icone} titulo={titulo} descricao={descricao} />;
}
