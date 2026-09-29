-- =====================================================================
-- Fase 3 · 01 — Features e permissões da operação em campo
-- Novas funcionalidades (despacho, checklists avançados, modo offline),
-- o portal do técnico passa a valer do Pro para cima e o catálogo de
-- permissões ganha agenda, despacho e as ações de campo.
-- =====================================================================

insert into public.funcionalidades (key, nome, descricao, ativo) values
  ('dispatch', 'Central de Despacho', 'Distribuição de OS para técnicos e equipes', true),
  ('advanced_checklists', 'Checklists Avançados', 'Itens condicionais, medição, hora e assinatura', true),
  ('offline_mode', 'Operação Offline', 'Portal do técnico funcionando sem internet', true)
on conflict (key) do nothing;

-- Pro e Premium passam a ter despacho, checklists avançados, offline e portal do técnico
insert into public.plano_funcionalidades (plano_id, funcionalidade_id)
select p.id, f.id
from public.planos p
join public.funcionalidades f on f.key in ('dispatch', 'advanced_checklists', 'offline_mode', 'technician_portal')
where p.nome in ('Pro', 'Premium')
on conflict do nothing;

insert into public.permissoes (chave, modulo, descricao, feature_key, ordem) values
  ('calendar.view',               'calendar',       'Visualizar a agenda',                     'calendar',          90),
  ('calendar.manage',             'calendar',       'Agendar e reagendar atendimentos',        'calendar',          91),
  ('dispatch.view',               'dispatch',       'Abrir a central de despacho',             'dispatch',          100),
  ('dispatch.assign',             'dispatch',       'Distribuir OS para técnicos e equipes',   'dispatch',          101),
  ('technician.jobs.view',        'technician',     'Ver os próprios atendimentos no portal',  'technician_portal', 110),
  ('technician.jobs.start',       'technician',     'Iniciar deslocamento e atendimento',      'technician_portal', 111),
  ('technician.jobs.pause',       'technician',     'Pausar e retomar o atendimento',          'technician_portal', 112),
  ('technician.jobs.complete',    'technician',     'Finalizar o atendimento em campo',        'technician_portal', 113),
  ('checklists.fill',             'service_orders', 'Responder checklists da OS',              'service_orders',    120),
  ('attachments.upload',          'service_orders', 'Anexar fotos e documentos à OS',          'service_orders',    121),
  ('service_orders.add_material', 'service_orders', 'Registrar materiais e serviços na OS',    'service_orders',    122),
  ('service_orders.sign',         'service_orders', 'Colher a assinatura do cliente',          'service_orders',    123)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Cargos padrão: novas permissões por chave de cargo
-- ---------------------------------------------------------------------
create or replace function public.permissoes_padrao_cargo(p_chave text)
returns text[]
language sql immutable set search_path = '' as $$
  select case p_chave
    when 'manager' then array[
      'calendar.view', 'calendar.manage', 'dispatch.view', 'dispatch.assign',
      'checklists.fill', 'attachments.upload', 'service_orders.add_material', 'service_orders.sign']
    when 'attendant' then array[
      'calendar.view', 'calendar.manage', 'dispatch.view', 'attachments.upload']
    when 'technician' then array[
      'calendar.view', 'technician.jobs.view', 'technician.jobs.start', 'technician.jobs.pause',
      'technician.jobs.complete', 'checklists.fill', 'attachments.upload',
      'service_orders.add_material', 'service_orders.sign']
    else '{}'::text[]
  end;
$$;

-- empresas que já existem recebem as permissões nos cargos padrão
insert into public.cargo_permissoes (cargo_id, permissao_chave)
select c.id, p.chave
from public.cargos c
cross join lateral unnest(public.permissoes_padrao_cargo(c.chave)) as p(chave)
where c.sistema
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Empresas novas: o seed passa a incluir as permissões de campo
-- ---------------------------------------------------------------------
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

  insert into public.cargo_permissoes (cargo_id, permissao_chave)
  select c.id, p.chave
  from public.cargos c
  join public.permissoes p on
    (c.chave = 'manager' and p.chave not in ('team.manage', 'settings.manage')
      and p.chave not like 'technician.jobs.%')
    or (c.chave = 'attendant' and p.chave in (
      'dashboard.view', 'customers.view', 'customers.create', 'customers.edit',
      'assets.view', 'assets.create', 'assets.edit',
      'service_orders.view', 'service_orders.create', 'service_orders.edit', 'service_orders.assign',
      'technicians.view', 'calendar.view', 'calendar.manage', 'dispatch.view', 'attachments.upload'))
    or (c.chave = 'technician' and p.chave in (
      'dashboard.view', 'customers.view', 'assets.view',
      'service_orders.view', 'service_orders.edit', 'service_orders.finish',
      'calendar.view', 'technician.jobs.view', 'technician.jobs.start', 'technician.jobs.pause',
      'technician.jobs.complete', 'checklists.fill', 'attachments.upload',
      'service_orders.add_material', 'service_orders.sign'))
    or (c.chave = 'finance' and p.chave in (
      'dashboard.view', 'customers.view', 'service_orders.view', 'reports.view'))
    or (c.chave = 'inventory' and p.chave in ('dashboard.view', 'assets.view'))
  where c.loja_id = p_loja_id and c.sistema
  on conflict do nothing;
end;
$$;

revoke execute on function public.permissoes_padrao_cargo(text) from public, anon;
grant execute on function public.permissoes_padrao_cargo(text) to authenticated;
