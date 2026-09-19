-- =====================================================================
-- Fase 2 · 22 — Auditoria final: execute das funções de apoio
-- As funções ainda tinham execute para PUBLIC (o revoke de anon não
-- alcança um grant a PUBLIC). Agora só authenticated as executa.
-- =====================================================================
revoke execute on function public.is_super_admin() from public;
revoke execute on function public.is_gerente() from public;
revoke execute on function public.usuario_loja_id() from public;
revoke execute on function public.usuario_papel() from public;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_gerente() to authenticated;
grant execute on function public.usuario_loja_id() to authenticated;
grant execute on function public.usuario_papel() to authenticated;
