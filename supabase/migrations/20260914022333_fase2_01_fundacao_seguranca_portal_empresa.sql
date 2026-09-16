-- =====================================================================
-- Fase 2 · 01 · Fundação de segurança do Portal da Empresa (/app)
--
-- 1. Usuário desativado perde acesso aos dados da loja
-- 2. Situação de acesso da empresa (loja ativa + assinatura/trial válido)
-- 3. RBAC por empresa: permissões, cargos, cargo_permissoes, usuarios.cargo_id
-- 4. Helpers tem_feature() / tem_permissao() para RLS
-- 5. RPC obter_contexto_empresa() (CompanyContext)
-- 6. RLS das tabelas operacionais existentes passa a exigir empresa liberada
--    + feature do plano; gravações de histórico/log não aceitam autor forjado
-- 7. FKs compostas impedem referenciar registros de outra empresa
-- 8. Bucket os-fotos deixa de ser público
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funções de identidade passam a exigir usuário ativo
-- ---------------------------------------------------------------------
create or replace function public.usuario_loja_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select loja_id from public.usuarios where id = auth.uid() and ativo;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'super_admin' from public.usuarios where id = auth.uid() and ativo), false);
$$;

create or replace function public.is_gerente()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'gerente' from public.usuarios where id = auth.uid() and ativo), false);
$$;

-- ---------------------------------------------------------------------
-- 2. Situação de acesso da empresa
--    Retorna: liberado | loja_inexistente | loja_suspensa | loja_cancelada |
--             sem_assinatura | trial_expirado | pagamento_pendente |
--             assinatura_suspensa | assinatura_cancelada
-- ---------------------------------------------------------------------
create or replace function public.loja_situacao_acesso(p_loja_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_status_loja status_loja;
  v_status_assinatura status_assinatura;
  v_trial_termina_em timestamptz;
begin
  select status into v_status_loja from public.lojas where id = p_loja_id;
  if v_status_loja is null then return 'loja_inexistente'; end if;
  if v_status_loja = 'suspensa' then return 'loja_suspensa'; end if;
  if v_status_loja = 'cancelada' then return 'loja_cancelada'; end if;

  select status, trial_termina_em into v_status_assinatura, v_trial_termina_em
    from public.assinaturas where loja_id = p_loja_id;
  if v_status_assinatura is null then return 'sem_assinatura'; end if;

  case v_status_assinatura
    when 'active' then return 'liberado';
    when 'trial' then
      if v_trial_termina_em is not null and now() > v_trial_termina_em then
        return 'trial_expirado';
      end if;
      return 'liberado';
    when 'past_due' then return 'pagamento_pendente';
    when 'suspended' then return 'assinatura_suspensa';
    else return 'assinatura_cancelada';
  end case;
end;
$$;

-- empresa_tem_feature passa a reutilizar a mesma regra de acesso (comportamento idêntico)
create or replace function public.empresa_tem_feature(p_loja_id uuid, p_feature_key text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_plano_id uuid;
  v_funcionalidade record;
  v_resultado boolean;
  v_override boolean;
begin
  if public.loja_situacao_acesso(p_loja_id) <> 'liberado' then
    return false;
  end if;

  select * into v_funcionalidade from public.funcionalidades where key = p_feature_key;
  if v_funcionalidade is null or not v_funcionalidade.ativo then
    return false;
  end if;

  select plano_id into v_plano_id from public.assinaturas where loja_id = p_loja_id;

  v_resultado := exists (
      select 1 from public.plano_funcionalidades pf
      where pf.plano_id = v_plano_id and pf.funcionalidade_id = v_funcionalidade.id
    ) or exists (
      select 1 from public.empresa_addons ea
      where ea.loja_id = p_loja_id and ea.funcionalidade_id = v_funcionalidade.id and ea.ativo
    );

  select habilitado into v_override from public.empresa_feature_overrides
    where loja_id = p_loja_id and funcionalidade_id = v_funcionalidade.id;
  if v_override is not null then
    v_resultado := v_override;
  end if;

  return v_resultado;
end;
$$;

-- Loja do usuário logado, somente se usuário ativo e empresa liberada
create or replace function public.loja_operacional_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select u.loja_id
  from public.usuarios u
  where u.id = auth.uid()
    and u.ativo
    and u.loja_id is not null
    and public.loja_situacao_acesso(u.loja_id) = 'liberado';
$$;

-- Feature da empresa do usuário logado (a loja nunca vem do cliente)
create or replace function public.tem_feature(p_feature_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.empresa_tem_feature(public.loja_operacional_id(), p_feature_key), false);
$$;

-- ---------------------------------------------------------------------
-- 3. RBAC por empresa
-- ---------------------------------------------------------------------
create table public.permissoes (
  chave text primary key,
  modulo text not null,
  descricao text not null,
  feature_key text references public.funcionalidades(key) on update cascade,
  ordem int not null default 0
);

create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  -- chave só é preenchida nos cargos de sistema: owner, manager, attendant, technician, finance, inventory
  chave text,
  descricao text,
  sistema boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cargos_loja_id_id_key unique (loja_id, id),
  constraint cargos_loja_chave_key unique (loja_id, chave),
  constraint cargos_loja_nome_key unique (loja_id, nome)
);

create table public.cargo_permissoes (
  cargo_id uuid not null references public.cargos(id) on delete cascade,
  permissao_chave text not null references public.permissoes(chave) on delete cascade,
  primary key (cargo_id, permissao_chave)
);

create index idx_cargos_loja on public.cargos(loja_id);
create index idx_cargo_permissoes_permissao on public.cargo_permissoes(permissao_chave);

alter table public.usuarios add constraint usuarios_loja_id_id_key unique (loja_id, id);
alter table public.usuarios add column cargo_id uuid;
alter table public.usuarios
  add constraint usuarios_cargo_mesma_loja_fkey
  foreign key (loja_id, cargo_id) references public.cargos(loja_id, id);
create index idx_usuarios_cargo on public.usuarios(cargo_id);

insert into public.permissoes (chave, modulo, descricao, feature_key, ordem) values
  ('dashboard.view',         'dashboard',      'Visualizar dashboard',                 null,             10),
  ('customers.view',         'customers',      'Visualizar clientes',                  'customers',      20),
  ('customers.create',       'customers',      'Cadastrar clientes',                   'customers',      21),
  ('customers.edit',         'customers',      'Editar clientes',                      'customers',      22),
  ('customers.archive',      'customers',      'Arquivar clientes',                    'customers',      23),
  ('assets.view',            'assets',         'Visualizar equipamentos',              'assets',         30),
  ('assets.create',          'assets',         'Cadastrar equipamentos',               'assets',         31),
  ('assets.edit',            'assets',         'Editar equipamentos',                  'assets',         32),
  ('assets.archive',         'assets',         'Arquivar equipamentos',                'assets',         33),
  ('service_orders.view',    'service_orders', 'Visualizar ordens de serviço',         'service_orders', 40),
  ('service_orders.create',  'service_orders', 'Criar ordens de serviço',              'service_orders', 41),
  ('service_orders.edit',    'service_orders', 'Editar ordens de serviço',             'service_orders', 42),
  ('service_orders.assign',  'service_orders', 'Atribuir técnico à OS',                'service_orders', 43),
  ('service_orders.finish',  'service_orders', 'Finalizar ordens de serviço',          'service_orders', 44),
  ('service_orders.cancel',  'service_orders', 'Cancelar ordens de serviço',           'service_orders', 45),
  ('technicians.view',       'technicians',    'Visualizar técnicos',                  'technicians',    50),
  ('technicians.manage',     'technicians',    'Cadastrar e gerenciar técnicos',       'technicians',    51),
  ('team.manage',            'team',           'Gerenciar usuários e cargos',          null,             60),
  ('reports.view',           'reports',        'Visualizar relatórios',                null,             70),
  ('settings.manage',        'settings',       'Gerenciar configurações da empresa',   null,             80);

-- Cria os cargos de sistema de uma empresa (idempotente)
create or replace function public.criar_cargos_padrao(p_loja_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.cargos (loja_id, nome, chave, descricao, sistema) values
    (p_loja_id, 'Proprietário', 'owner',      'Acesso total à empresa',                         true),
    (p_loja_id, 'Gerente',      'manager',    'Gestão da operação, sem equipe e configurações', true),
    (p_loja_id, 'Atendente',    'attendant',  'Atendimento, clientes e abertura de OS',          true),
    (p_loja_id, 'Técnico',      'technician', 'Execução das ordens de serviço',                  true),
    (p_loja_id, 'Financeiro',   'finance',    'Consulta de OS e relatórios',                     true),
    (p_loja_id, 'Estoque',      'inventory',  'Consulta de equipamentos',                        true)
  on conflict (loja_id, chave) do nothing;

  -- owner não precisa de linhas: tem_permissao() concede todas as permissões ao cargo owner
  insert into public.cargo_permissoes (cargo_id, permissao_chave)
  select c.id, p.chave
  from public.cargos c
  join public.permissoes p on
    (c.chave = 'manager' and p.chave not in ('team.manage', 'settings.manage'))
    or (c.chave = 'attendant' and p.chave in (
      'dashboard.view', 'customers.view', 'customers.create', 'customers.edit',
      'assets.view', 'assets.create', 'assets.edit',
      'service_orders.view', 'service_orders.create', 'service_orders.edit', 'service_orders.assign',
      'technicians.view'))
    or (c.chave = 'technician' and p.chave in (
      'dashboard.view', 'customers.view', 'assets.view',
      'service_orders.view', 'service_orders.edit', 'service_orders.finish'))
    or (c.chave = 'finance' and p.chave in (
      'dashboard.view', 'customers.view', 'service_orders.view', 'reports.view'))
    or (c.chave = 'inventory' and p.chave in ('dashboard.view', 'assets.view'))
  where c.loja_id = p_loja_id and c.sistema
  on conflict do nothing;
end;
$$;

create or replace function public.trg_lojas_criar_cargos_padrao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.criar_cargos_padrao(new.id);
  return new;
end;
$$;

create trigger lojas_criar_cargos_padrao
  after insert on public.lojas
  for each row execute function public.trg_lojas_criar_cargos_padrao();

-- Cargo padrão conforme papel; ao trocar de loja (Super Admin), o cargo acompanha a nova loja
create or replace function public.trg_usuarios_cargo_padrao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.loja_id is null then
    new.cargo_id := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.loja_id is distinct from old.loja_id then
    new.cargo_id := null;
  end if;

  if new.cargo_id is null then
    select id into new.cargo_id
    from public.cargos
    where loja_id = new.loja_id
      and chave = case new.papel when 'gerente' then 'owner' else 'attendant' end;
  end if;

  return new;
end;
$$;

create trigger usuarios_cargo_padrao
  before insert or update of loja_id, papel, cargo_id on public.usuarios
  for each row execute function public.trg_usuarios_cargo_padrao();

-- Usuário da empresa não altera identidade/papel/loja; cargo e ativação exigem team.manage;
-- a empresa nunca fica sem proprietário ativo. Service role (auth.uid() nulo) e super admin
-- seguem as regras das Edge Functions já existentes.
create or replace function public.trg_usuarios_proteger_alteracoes()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.id <> old.id
     or new.papel <> old.papel
     or new.loja_id is distinct from old.loja_id
     or new.email <> old.email then
    raise exception 'Alteração não permitida para este usuário.' using errcode = '42501';
  end if;

  if (new.cargo_id is distinct from old.cargo_id or new.ativo <> old.ativo)
     and not public.tem_permissao('team.manage') then
    raise exception 'Sem permissão para alterar cargo ou status de usuários.' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger usuarios_proteger_alteracoes
  before update on public.usuarios
  for each row execute function public.trg_usuarios_proteger_alteracoes();

create or replace function public.trg_usuarios_garantir_proprietario()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() or old.loja_id is null then
    return null;
  end if;

  if exists (select 1 from public.lojas where id = old.loja_id)
     and not exists (
       select 1 from public.usuarios u
       join public.cargos c on c.id = u.cargo_id
       where u.loja_id = old.loja_id and u.ativo and c.chave = 'owner'
     ) then
    raise exception 'A empresa precisa de ao menos um proprietário ativo.' using errcode = '23514';
  end if;

  return null;
end;
$$;

create trigger usuarios_garantir_proprietario
  after update or delete on public.usuarios
  for each row execute function public.trg_usuarios_garantir_proprietario();

-- Proteção dos cargos de sistema
create or replace function public.trg_cargos_proteger_sistema()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- service role, super admin e exclusão em cascata da própria empresa não são bloqueados
  if auth.uid() is null or public.is_super_admin()
     or (tg_op = 'DELETE' and not exists (select 1 from public.lojas where id = old.loja_id)) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.sistema or new.chave is not null then
      raise exception 'Cargos de sistema não podem ser criados manualmente.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.sistema then
    if tg_op = 'DELETE' then
      raise exception 'Cargos de sistema não podem ser excluídos.' using errcode = '42501';
    end if;
    if new.chave is distinct from old.chave or new.sistema <> old.sistema
       or new.loja_id <> old.loja_id or (old.chave = 'owner' and not new.ativo) then
      raise exception 'Cargo de sistema não pode ter chave, tipo ou empresa alterados.' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' and (new.sistema or new.chave is not null or new.loja_id <> old.loja_id) then
    raise exception 'Alteração não permitida.' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger cargos_proteger_sistema
  before insert or update or delete on public.cargos
  for each row execute function public.trg_cargos_proteger_sistema();

-- Backfill: cargos para empresas existentes e cargo para usuários existentes
select public.criar_cargos_padrao(id) from public.lojas;
update public.usuarios set cargo_id = null where loja_id is not null and cargo_id is null;

-- ---------------------------------------------------------------------
-- 4. Permissão do usuário logado
-- ---------------------------------------------------------------------
create or replace function public.tem_permissao(p_chave text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.usuarios u
    join public.cargos c on c.id = u.cargo_id and c.loja_id = u.loja_id and c.ativo
    where u.id = auth.uid()
      and u.ativo
      and public.loja_situacao_acesso(u.loja_id) = 'liberado'
      and exists (select 1 from public.permissoes p where p.chave = p_chave)
      and (
        c.chave = 'owner'
        or exists (
          select 1 from public.cargo_permissoes cp
          where cp.cargo_id = c.id and cp.permissao_chave = p_chave
        )
      )
  );
$$;

-- RLS do RBAC
alter table public.permissoes enable row level security;
alter table public.cargos enable row level security;
alter table public.cargo_permissoes enable row level security;

create policy permissoes_select on public.permissoes for select to authenticated using (true);

create policy cargos_select on public.cargos for select to authenticated
  using (loja_id = (select public.usuario_loja_id()));
create policy cargos_insert on public.cargos for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('team.manage')));
create policy cargos_update on public.cargos for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('team.manage')))
  with check (loja_id = (select public.loja_operacional_id()));
create policy cargos_delete on public.cargos for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('team.manage')));

create policy cargo_permissoes_select on public.cargo_permissoes for select to authenticated
  using (exists (
    select 1 from public.cargos c
    where c.id = cargo_permissoes.cargo_id and c.loja_id = (select public.usuario_loja_id())
  ));
create policy cargo_permissoes_insert on public.cargo_permissoes for insert to authenticated
  with check (
    (select public.tem_permissao('team.manage'))
    and exists (
      select 1 from public.cargos c
      where c.id = cargo_permissoes.cargo_id
        and c.loja_id = (select public.loja_operacional_id())
        and c.chave is distinct from 'owner'
    )
  );
create policy cargo_permissoes_delete on public.cargo_permissoes for delete to authenticated
  using (
    (select public.tem_permissao('team.manage'))
    and exists (
      select 1 from public.cargos c
      where c.id = cargo_permissoes.cargo_id
        and c.loja_id = (select public.loja_operacional_id())
        and c.chave is distinct from 'owner'
    )
  );

-- ---------------------------------------------------------------------
-- 5. Contexto da empresa (CompanyContext) — tudo resolvido no servidor
-- ---------------------------------------------------------------------
create or replace function public.obter_contexto_empresa()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_usuario public.usuarios;
  v_situacao text;
  v_usuario_json jsonb;
begin
  select * into v_usuario from public.usuarios where id = auth.uid();
  if not found then
    return jsonb_build_object('situacao', 'sem_perfil');
  end if;

  v_usuario_json := jsonb_build_object(
    'id', v_usuario.id,
    'nome', v_usuario.nome,
    'email', v_usuario.email,
    'papel', v_usuario.papel,
    'cargo', (select jsonb_build_object('id', c.id, 'nome', c.nome, 'chave', c.chave)
              from public.cargos c where c.id = v_usuario.cargo_id)
  );

  if v_usuario.papel = 'super_admin' then
    return jsonb_build_object('situacao', 'super_admin', 'usuario', v_usuario_json);
  end if;
  if not v_usuario.ativo then
    return jsonb_build_object('situacao', 'usuario_inativo', 'usuario', v_usuario_json);
  end if;

  v_situacao := public.loja_situacao_acesso(v_usuario.loja_id);

  return jsonb_build_object(
    'situacao', v_situacao,
    'usuario', v_usuario_json,
    'empresa', (
      select jsonb_build_object(
        'id', l.id, 'nome', l.nome, 'cnpj', l.cnpj, 'telefone', l.telefone,
        'cidade', l.cidade, 'estado', l.estado, 'status', l.status)
      from public.lojas l where l.id = v_usuario.loja_id),
    'segmento', (
      select jsonb_build_object('id', s.id, 'nome', s.nome, 'slug', s.slug)
      from public.lojas l join public.segmentos s on s.id = l.segmento_id
      where l.id = v_usuario.loja_id),
    'assinatura', (
      select jsonb_build_object(
        'status', a.status, 'ciclo_cobranca', a.ciclo_cobranca,
        'trial_termina_em', a.trial_termina_em, 'periodo_atual_fim', a.periodo_atual_fim,
        'plano', jsonb_build_object('id', p.id, 'nome', p.nome))
      from public.assinaturas a join public.planos p on p.id = a.plano_id
      where a.loja_id = v_usuario.loja_id),
    'filial', null,
    'features', case when v_situacao = 'liberado' then coalesce((
      select jsonb_agg(f.key order by f.key) from public.funcionalidades f
      where f.ativo and public.empresa_tem_feature(v_usuario.loja_id, f.key)), '[]'::jsonb)
      else '[]'::jsonb end,
    'permissoes', case when v_situacao = 'liberado' then coalesce((
      select jsonb_agg(p.chave order by p.ordem) from public.permissoes p
      where public.tem_permissao(p.chave)), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RLS das tabelas operacionais existentes
-- ---------------------------------------------------------------------
-- CLIENTES
drop policy clientes_select on public.clientes;
drop policy clientes_insert on public.clientes;
drop policy clientes_update on public.clientes;
drop policy clientes_delete on public.clientes;

create policy clientes_select on public.clientes for select to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('customers')));
create policy clientes_insert on public.clientes for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('customers')));
create policy clientes_update on public.clientes for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('customers')))
  with check (loja_id = (select public.loja_operacional_id()));
create policy clientes_delete on public.clientes for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.is_gerente()));

-- STATUS_OS
drop policy status_os_select on public.status_os;
drop policy status_os_insert on public.status_os;
drop policy status_os_update on public.status_os;
drop policy status_os_delete on public.status_os;

create policy status_os_select on public.status_os for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy status_os_insert on public.status_os for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.is_gerente()));
create policy status_os_update on public.status_os for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.is_gerente()))
  with check (loja_id = (select public.loja_operacional_id()));
create policy status_os_delete on public.status_os for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.is_gerente()));

-- ORDENS_SERVICO
drop policy os_select on public.ordens_servico;
drop policy os_insert on public.ordens_servico;
drop policy os_update on public.ordens_servico;
drop policy os_delete on public.ordens_servico;

create policy os_select on public.ordens_servico for select to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('service_orders')));
create policy os_insert on public.ordens_servico for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('service_orders')));
create policy os_update on public.ordens_servico for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('service_orders')))
  with check (loja_id = (select public.loja_operacional_id()));
create policy os_delete on public.ordens_servico for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.is_gerente()));

-- Tabelas filhas da OS: a visibilidade da OS (com RLS acima) define o acesso
drop policy os_itens_select on public.os_itens;
drop policy os_itens_insert on public.os_itens;
drop policy os_itens_update on public.os_itens;
drop policy os_itens_delete on public.os_itens;

create policy os_itens_select on public.os_itens for select to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id));
create policy os_itens_insert on public.os_itens for insert to authenticated
  with check (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id));
create policy os_itens_update on public.os_itens for update to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id))
  with check (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id));
create policy os_itens_delete on public.os_itens for delete to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id));

drop policy os_historico_select on public.os_historico;
drop policy os_historico_insert on public.os_historico;

create policy os_historico_select on public.os_historico for select to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_historico.os_id));
create policy os_historico_insert on public.os_historico for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.ordens_servico os where os.id = os_historico.os_id)
  );

drop policy os_fotos_select on public.os_fotos;
drop policy os_fotos_insert on public.os_fotos;

create policy os_fotos_select on public.os_fotos for select to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_fotos.os_id));
create policy os_fotos_insert on public.os_fotos for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.ordens_servico os where os.id = os_fotos.os_id)
  );

drop policy os_observacoes_select on public.os_observacoes;
drop policy os_observacoes_insert on public.os_observacoes;

create policy os_observacoes_select on public.os_observacoes for select to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_observacoes.os_id));
create policy os_observacoes_insert on public.os_observacoes for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.ordens_servico os where os.id = os_observacoes.os_id)
  );

-- LOG_EVENTOS (feed de atividade da empresa)
drop policy log_eventos_select on public.log_eventos;
drop policy log_eventos_insert on public.log_eventos;

create policy log_eventos_select on public.log_eventos for select to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.is_gerente()));
create policy log_eventos_insert on public.log_eventos for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. Integridade de tenant nas referências da OS
-- ---------------------------------------------------------------------
alter table public.clientes add constraint clientes_loja_id_id_key unique (loja_id, id);
alter table public.status_os add constraint status_os_loja_id_id_key unique (loja_id, id);

alter table public.ordens_servico
  add constraint ordens_servico_cliente_mesma_loja_fkey
    foreign key (loja_id, cliente_id) references public.clientes(loja_id, id),
  add constraint ordens_servico_status_mesma_loja_fkey
    foreign key (loja_id, status_id) references public.status_os(loja_id, id),
  add constraint ordens_servico_responsavel_mesma_loja_fkey
    foreign key (loja_id, responsavel_id) references public.usuarios(loja_id, id)
    on delete set null (responsavel_id),
  add constraint ordens_servico_criador_mesma_loja_fkey
    foreign key (loja_id, criado_por) references public.usuarios(loja_id, id)
    on delete set null (criado_por);

create index idx_os_loja_criado_em on public.ordens_servico(loja_id, criado_em desc);
create index idx_os_loja_status on public.ordens_servico(loja_id, status_id);
create index idx_os_responsavel on public.ordens_servico(responsavel_id);
create index idx_log_eventos_loja_criado_em on public.log_eventos(loja_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 8. Storage: fotos de OS privadas e isoladas por empresa
--    (a coluna passa a guardar o caminho no bucket; a URL é assinada sob demanda)
-- ---------------------------------------------------------------------
alter table public.os_fotos rename column url to caminho;

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'os-fotos';

drop policy os_fotos_storage_select on storage.objects;
drop policy os_fotos_storage_insert on storage.objects;

create policy os_fotos_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'os-fotos'
    and (storage.foldername(name))[1] = (select public.loja_operacional_id())::text
  );
create policy os_fotos_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'os-fotos'
    and (storage.foldername(name))[1] = (select public.loja_operacional_id())::text
  );

-- ---------------------------------------------------------------------
-- Permissões de execução das funções
-- ---------------------------------------------------------------------
revoke execute on function public.empresa_tem_feature(uuid, text) from public, anon, authenticated;
revoke execute on function public.loja_situacao_acesso(uuid) from public, anon, authenticated;
revoke execute on function public.criar_cargos_padrao(uuid) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.trg_lojas_criar_cargos_padrao() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_cargo_padrao() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_proteger_alteracoes() from public, anon, authenticated;
revoke execute on function public.trg_usuarios_garantir_proprietario() from public, anon, authenticated;
revoke execute on function public.trg_cargos_proteger_sistema() from public, anon, authenticated;

revoke execute on function public.loja_operacional_id() from public, anon;
revoke execute on function public.tem_feature(text) from public, anon;
revoke execute on function public.tem_permissao(text) from public, anon;
revoke execute on function public.obter_contexto_empresa() from public, anon;
grant execute on function public.loja_operacional_id() to authenticated;
grant execute on function public.tem_feature(text) to authenticated;
grant execute on function public.tem_permissao(text) to authenticated;
grant execute on function public.obter_contexto_empresa() to authenticated;
