-- =====================================================================
-- Fase 2 · 21 — Auditoria final: endurecimento das políticas (etapa 15)
-- Políticas herdadas eram avaliadas também para o papel anon (to public),
-- o que obrigava a conceder execute das funções de apoio ao anônimo.
-- Agora valem só para usuários autenticados; o anônimo não alcança nada.
-- =====================================================================

drop policy planos_super_admin on public.planos;
create policy planos_super_admin on public.planos for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy segmentos_super_admin on public.segmentos;
create policy segmentos_super_admin on public.segmentos for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy funcionalidades_super_admin on public.funcionalidades;
create policy funcionalidades_super_admin on public.funcionalidades for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy plano_funcionalidades_super_admin on public.plano_funcionalidades;
create policy plano_funcionalidades_super_admin on public.plano_funcionalidades for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy segmento_funcionalidades_super_admin on public.segmento_funcionalidades;
create policy segmento_funcionalidades_super_admin on public.segmento_funcionalidades for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy assinaturas_super_admin on public.assinaturas;
create policy assinaturas_super_admin on public.assinaturas for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy addons_super_admin on public.empresa_addons;
create policy addons_super_admin on public.empresa_addons for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy overrides_super_admin on public.empresa_feature_overrides;
create policy overrides_super_admin on public.empresa_feature_overrides for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy logs_super_admin on public.logs_auditoria;
create policy logs_super_admin on public.logs_auditoria for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy lojas_select on public.lojas;
create policy lojas_select on public.lojas for select to authenticated
  using ((select public.is_super_admin()) or id = (select public.usuario_loja_id()));

drop policy lojas_insert on public.lojas;
create policy lojas_insert on public.lojas for insert to authenticated
  with check (public.is_super_admin());

drop policy lojas_update on public.lojas;
create policy lojas_update on public.lojas for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy lojas_delete on public.lojas;
create policy lojas_delete on public.lojas for delete to authenticated
  using (public.is_super_admin());

drop policy usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
  using (
    ((select public.is_super_admin()) and papel in ('super_admin', 'gerente'))
    or loja_id = (select public.usuario_loja_id())
    or id = (select auth.uid())
  );

-- anônimo não precisa mais das funções de apoio (nenhuma política o alcança)
revoke execute on function public.is_super_admin() from anon;
revoke execute on function public.is_gerente() from anon;
revoke execute on function public.usuario_loja_id() from anon;
revoke execute on function public.usuario_papel() from anon;
