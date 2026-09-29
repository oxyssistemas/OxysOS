-- =====================================================================
-- Fase 3 · 05 — Gatilhos fora da API (etapa 3)
-- Funções de gatilho nascem com execute para PUBLIC e ficam expostas em
-- /rest/v1/rpc. Ninguém precisa chamá-las: o gatilho roda como dono da
-- tabela. Revogado de todos os papéis do cliente.
-- =====================================================================
revoke execute on function public.trg_tecnico_jornada_sem_sobreposicao() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_equipe_ativa() from public, anon, authenticated;
