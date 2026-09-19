import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertTriangle, QrCode } from "lucide-react";
import { TelaAviso } from "@/components/TelaAviso";
import { TelaCarregando } from "@/components/TelaCarregando";
import { equipamentoPorCodigo } from "./equipamentosService";

/**
 * Destino do QR Code: /app/assets/qr/:codigo. O código só é resolvido pelo banco
 * para usuários logados da mesma empresa; para os demais, "não encontrado".
 */
export function EquipamentoQrPage() {
  const { codigo = "" } = useParams();
  const [resultado, setResultado] = useState<{ id: string | null } | { erro: string } | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(codigo)) {
      setResultado({ id: null });
      return;
    }
    equipamentoPorCodigo(codigo)
      .then((id) => !cancelado && setResultado({ id }))
      .catch((err) => !cancelado && setResultado({ erro: err instanceof Error ? err.message : "Erro ao ler o código." }));
    return () => {
      cancelado = true;
    };
  }, [codigo]);

  if (!resultado) return <TelaCarregando />;

  if ("erro" in resultado) {
    return <TelaAviso icone={AlertTriangle} tom="perigo" titulo="Não foi possível ler o QR Code" descricao={resultado.erro} />;
  }

  if (resultado.id) return <Navigate to={`/app/assets/${resultado.id}`} replace />;

  return (
    <TelaAviso
      icone={QrCode}
      tom="alerta"
      titulo="Equipamento não encontrado"
      descricao="Este QR Code não pertence a um equipamento da sua empresa ou foi substituído por um novo código."
      acoes={
        <Link to="/app/assets" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5">
          Ver equipamentos
        </Link>
      }
    />
  );
}
