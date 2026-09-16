-- =====================================================================
-- Fase 2 · 03 · Ajustes de desempenho apontados pelo Supabase Advisor
-- 1. auth.uid() em policies avaliado uma vez por consulta: (select auth.uid())
-- 2. Índices cobrindo as FKs compostas de tenant
-- Nenhuma regra de acesso muda.
-- =====================================================================

drop policy usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select
  using (
    ((select public.is_super_admin()) and papel in ('super_admin', 'gerente'))
    or (loja_id = (select public.usuario_loja_id()))
    or id = (select auth.uid())
  );

drop policy os_historico_insert on public.os_historico;
create policy os_historico_insert on public.os_historico for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.ordens_servico os where os.id = os_historico.os_id)
  );

drop policy os_fotos_insert on public.os_fotos;
create policy os_fotos_insert on public.os_fotos for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.ordens_servico os where os.id = os_fotos.os_id)
  );

drop policy os_observacoes_insert on public.os_observacoes;
create policy os_observacoes_insert on public.os_observacoes for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.ordens_servico os where os.id = os_observacoes.os_id)
  );

drop policy log_eventos_insert on public.log_eventos;
create policy log_eventos_insert on public.log_eventos for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and usuario_id = (select auth.uid()));

-- Índices das FKs compostas (substituem os de coluna única equivalentes)
create index idx_os_loja_cliente on public.ordens_servico(loja_id, cliente_id);
create index idx_os_loja_responsavel on public.ordens_servico(loja_id, responsavel_id);
create index idx_os_loja_criado_por on public.ordens_servico(loja_id, criado_por);
create index idx_usuarios_loja_cargo on public.usuarios(loja_id, cargo_id);
drop index if exists public.idx_os_cliente;
drop index if exists public.idx_os_responsavel;
drop index if exists public.idx_usuarios_cargo;
create index idx_log_eventos_usuario on public.log_eventos(usuario_id);
create index idx_os_historico_usuario on public.os_historico(usuario_id);
