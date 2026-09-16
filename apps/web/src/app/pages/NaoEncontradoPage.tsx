import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { TelaAviso } from "@/components/TelaAviso";

export function NaoEncontradoPage({ telaCheia, voltarPara = "/" }: { telaCheia?: boolean; voltarPara?: string }) {
  return (
    <TelaAviso
      telaCheia={telaCheia}
      icone={SearchX}
      titulo="Página não encontrada"
      descricao="O endereço acessado não existe ou foi movido."
      acoes={
        <Link
          to={voltarPara}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5"
        >
          Voltar ao início
        </Link>
      }
    />
  );
}
