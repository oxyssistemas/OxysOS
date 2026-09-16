-- Ativa RLS em todas as tabelas
alter table public.lojas enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuarios_seguranca enable row level security;
alter table public.clientes enable row level security;
alter table public.status_os enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.os_itens enable row level security;
alter table public.os_historico enable row level security;
alter table public.log_eventos enable row level security;

-- ==================== LOJAS ====================
-- Super admin: acesso total. Gerente/funcionario: só enxergam a própria loja (dados básicos).
create policy "lojas_select" on public.lojas for select
  using (public.is_super_admin() or id = public.usuario_loja_id());

create policy "lojas_insert" on public.lojas for insert
  with check (public.is_super_admin());

create policy "lojas_update" on public.lojas for update
  using (public.is_super_admin());

create policy "lojas_delete" on public.lojas for delete
  using (public.is_super_admin());

-- ==================== USUARIOS ====================
-- Super admin só vê/gerencia super_admins e gerentes (nunca funcionarios cadastrados pelo gerente)
create policy "usuarios_select" on public.usuarios for select
  using (
    (public.is_super_admin() and papel in ('super_admin', 'gerente'))
    or (loja_id = public.usuario_loja_id())
    or id = auth.uid()
  );

create policy "usuarios_insert" on public.usuarios for insert
  with check (
    (public.is_super_admin() and papel = 'gerente')
    or (public.is_gerente() and papel = 'funcionario' and loja_id = public.usuario_loja_id())
  );

create policy "usuarios_update" on public.usuarios for update
  using (
    (public.is_super_admin() and papel = 'gerente')
    or (public.is_gerente() and loja_id = public.usuario_loja_id())
  );

create policy "usuarios_delete" on public.usuarios for delete
  using (
    (public.is_super_admin() and papel = 'gerente')
    or (public.is_gerente() and papel = 'funcionario' and loja_id = public.usuario_loja_id())
  );

-- ==================== USUARIOS_SEGURANCA (código de autorização) ====================
-- Só o gerente da própria loja acessa; super_admin e funcionario nunca.
create policy "usuarios_seguranca_select" on public.usuarios_seguranca for select
  using (
    public.is_gerente() and exists (
      select 1 from public.usuarios u
      where u.id = usuarios_seguranca.usuario_id and u.loja_id = public.usuario_loja_id()
    )
  );

create policy "usuarios_seguranca_insert" on public.usuarios_seguranca for insert
  with check (
    public.is_gerente() and exists (
      select 1 from public.usuarios u
      where u.id = usuarios_seguranca.usuario_id and u.loja_id = public.usuario_loja_id()
    )
  );

create policy "usuarios_seguranca_update" on public.usuarios_seguranca for update
  using (
    public.is_gerente() and exists (
      select 1 from public.usuarios u
      where u.id = usuarios_seguranca.usuario_id and u.loja_id = public.usuario_loja_id()
    )
  );

-- ==================== CLIENTES ====================
create policy "clientes_select" on public.clientes for select
  using (loja_id = public.usuario_loja_id());

create policy "clientes_insert" on public.clientes for insert
  with check (loja_id = public.usuario_loja_id());

create policy "clientes_update" on public.clientes for update
  using (loja_id = public.usuario_loja_id());

create policy "clientes_delete" on public.clientes for delete
  using (loja_id = public.usuario_loja_id() and public.is_gerente());

-- ==================== STATUS_OS ====================
create policy "status_os_select" on public.status_os for select
  using (loja_id = public.usuario_loja_id());

create policy "status_os_insert" on public.status_os for insert
  with check (loja_id = public.usuario_loja_id() and public.is_gerente());

create policy "status_os_update" on public.status_os for update
  using (loja_id = public.usuario_loja_id() and public.is_gerente());

create policy "status_os_delete" on public.status_os for delete
  using (loja_id = public.usuario_loja_id() and public.is_gerente());

-- ==================== ORDENS_SERVICO ====================
create policy "os_select" on public.ordens_servico for select
  using (loja_id = public.usuario_loja_id());

create policy "os_insert" on public.ordens_servico for insert
  with check (loja_id = public.usuario_loja_id());

create policy "os_update" on public.ordens_servico for update
  using (loja_id = public.usuario_loja_id());

create policy "os_delete" on public.ordens_servico for delete
  using (loja_id = public.usuario_loja_id() and public.is_gerente());

-- ==================== OS_ITENS ====================
create policy "os_itens_select" on public.os_itens for select
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_itens.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_itens_insert" on public.os_itens for insert
  with check (exists (
    select 1 from public.ordens_servico os
    where os.id = os_itens.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_itens_update" on public.os_itens for update
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_itens.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_itens_delete" on public.os_itens for delete
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_itens.os_id and os.loja_id = public.usuario_loja_id()
  ));

-- ==================== OS_HISTORICO (log imutável: só select e insert) ====================
create policy "os_historico_select" on public.os_historico for select
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_historico.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_historico_insert" on public.os_historico for insert
  with check (exists (
    select 1 from public.ordens_servico os
    where os.id = os_historico.os_id and os.loja_id = public.usuario_loja_id()
  ));

-- ==================== LOG_EVENTOS (auditoria: select só gerente, insert qualquer papel da loja) ====================
create policy "log_eventos_select" on public.log_eventos for select
  using (loja_id = public.usuario_loja_id() and public.is_gerente());

create policy "log_eventos_insert" on public.log_eventos for insert
  with check (loja_id = public.usuario_loja_id());
