import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTecnico } from "../TecnicoContext";
import { listarAgendaTecnico, listarChecklistsCampo, obterAtendimento, obterFinalizacaoAtendimento } from "../tecnicoService";
import { configurarOffline } from "./estado";
import { aoMudarFila, listarFila, processarFila, type OperacaoFila } from "./fila";

interface ValorSincronizacao {
  online: boolean;
  /** o plano tem offline_mode: guarda cópias e aceita a fila */
  ativo: boolean;
  fila: OperacaoFila[];
  pendentes: number;
  conflitos: number;
  erros: number;
  sincronizando: boolean;
  sincronizar: () => Promise<void>;
}

const Contexto = createContext<ValorSincronizacao | undefined>(undefined);

const PRE_CARGA_MS = 15 * 60 * 1000;
const REENVIO_MS = 30 * 1000;
const MAX_PRE_CARGA = 12;

/** Guarda no aparelho os atendimentos de hoje e dos próximos dias (§45). */
async function preCarregar() {
  const cards = [...(await listarAgendaTecnico("hoje")), ...(await listarAgendaTecnico("proximos"))]
    .filter((c) => c.status !== "cancelado" && c.status !== "concluido")
    .slice(0, MAX_PRE_CARGA);
  for (const c of cards) {
    // cada leitura já guarda a própria cópia
    await Promise.allSettled([
      obterAtendimento(c.agendamento_id),
      obterFinalizacaoAtendimento(c.agendamento_id),
      listarChecklistsCampo(c.os_id),
    ]);
  }
}

export function SincronizacaoProvider({ children }: { children: ReactNode }) {
  const { dados } = useTecnico();
  const [pronto, setPronto] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [fila, setFila] = useState<OperacaoFila[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const ativo = !!dados?.offline;
  const dono = dados?.usuario && dados.empresa ? `${dados.usuario.id}:${dados.empresa.id}` : null;
  const preCarregado = useRef(0);

  // configura antes de mostrar as telas (elas leem com ou sem cópia conforme o plano)
  useEffect(() => {
    if (!dono) return;
    let vivo = true;
    configurarOffline({ ativo, dono }).finally(() => vivo && setPronto(true));
    return () => {
      vivo = false;
    };
  }, [ativo, dono]);

  const recarregarFila = useCallback(() => {
    listarFila().then(setFila);
  }, []);

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine) return;
    setSincronizando(true);
    try {
      await processarFila();
    } finally {
      setSincronizando(false);
      recarregarFila();
    }
  }, [recarregarFila]);

  useEffect(() => {
    if (!pronto) return;
    recarregarFila();
    const parar = aoMudarFila(recarregarFila);
    const aoFicarOnline = () => {
      setOnline(true);
      sincronizar();
    };
    const aoFicarOffline = () => setOnline(false);
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);
    sincronizar();
    return () => {
      parar();
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
  }, [pronto, recarregarFila, sincronizar]);

  const pendentes = fila.filter((o) => o.estado === "pendente").length;

  // reenvio periódico enquanto houver pendência (a rede pode ter voltado sem o evento "online")
  useEffect(() => {
    if (!pronto || pendentes === 0) return;
    const t = setInterval(() => navigator.onLine && sincronizar(), REENVIO_MS);
    return () => clearInterval(t);
  }, [pronto, pendentes, sincronizar]);

  // pré-carga com internet: ao abrir e a cada 15 minutos
  useEffect(() => {
    if (!pronto || !ativo || !online) return;
    const rodar = () => {
      if (Date.now() - preCarregado.current < PRE_CARGA_MS - 1000) return;
      preCarregado.current = Date.now();
      preCarregar().catch((e) => console.error("[offline] pré-carga", e));
    };
    rodar();
    const t = setInterval(rodar, PRE_CARGA_MS);
    return () => clearInterval(t);
  }, [pronto, ativo, online]);

  const valor = useMemo<ValorSincronizacao>(
    () => ({
      online,
      ativo,
      fila,
      pendentes,
      conflitos: fila.filter((o) => o.estado === "conflito").length,
      erros: fila.filter((o) => o.estado === "erro").length,
      sincronizando,
      sincronizar,
    }),
    [online, ativo, fila, pendentes, sincronizando, sincronizar],
  );

  if (!pronto) return null;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSincronizacao(): ValorSincronizacao {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSincronizacao precisa estar dentro de SincronizacaoProvider.");
  return ctx;
}
