import { useCallback, useEffect, useRef, useState } from "react";
import { listarNotificacoes, marcarNotificacoesLidas, type CaixaNotificacoes } from "./notificacoesService";

const INTERVALO_MS = 60_000;

/**
 * Caixa de avisos do usuário: busca ao abrir, a cada minuto com a aba visível
 * e ao voltar para a aba. Falha de rede não derruba a tela (mantém o que tinha).
 */
export function useNotificacoes() {
  const [caixa, setCaixa] = useState<CaixaNotificacoes>({ nao_lidas: 0, itens: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const ativo = useRef(true);

  const atualizar = useCallback(async () => {
    try {
      const nova = await listarNotificacoes();
      if (ativo.current) {
        setCaixa(nova);
        setErro(null);
      }
    } catch (e) {
      if (ativo.current) setErro(e instanceof Error ? e.message : "Não foi possível carregar os avisos.");
    } finally {
      if (ativo.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    ativo.current = true;
    atualizar();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, INTERVALO_MS);
    const aoVoltar = () => document.visibilityState === "visible" && atualizar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      ativo.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [atualizar]);

  const marcar = useCallback(
    async (ids?: string[]) => {
      // otimista: a contagem cai na hora; o banco confirma na próxima busca
      setCaixa((c) => {
        const alvo = (id: string) => !ids || ids.includes(id);
        const itens = c.itens.map((n) => (alvo(n.id) && !n.lida_em ? { ...n, lida_em: new Date().toISOString() } : n));
        const marcadas = c.itens.filter((n) => alvo(n.id) && !n.lida_em).length;
        return { itens, nao_lidas: ids ? Math.max(0, c.nao_lidas - marcadas) : 0 };
      });
      try {
        await marcarNotificacoesLidas(ids);
      } finally {
        atualizar();
      }
    },
    [atualizar],
  );

  return { ...caixa, carregando, erro, atualizar, marcar };
}
