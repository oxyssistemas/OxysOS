-- Fase 3 · etapa 19 — revisão de segurança: escopo do técnico (§55)
-- Achado: ordens_servico e as funções de OS exigiam só service_orders.view, que o
-- cargo Técnico tem por padrão — um técnico lia (e, com service_orders.edit,
-- alterava) qualquer OS da empresa trocando o id na URL/requisição.
-- Regra (decisão da fase 3: "técnico vê as OS dele + as da equipe"; §55 "conforme
-- regra configurada"): quem está vinculado a um técnico e não tem a nova
-- permissão service_orders.view_all só enxerga as OS atribuídas a ele, à equipe
-- dele ou com visita agendada para ele/equipe. Quem não é técnico e o dono não
-- mudam. A permissão é dada a todos os cargos que já viam OS, menos o Técnico.
--
-- As funções afetadas NÃO são reescritas à mão: o corpo atual é lido e recebe só
-- a linha de escopo, com conferência de que o trecho existe exatamente uma vez.

-- ---------------------------------------------------------------------------
-- 1. permissão, cargos existentes e seed de empresas novas
-- ---------------------------------------------------------------------------
insert into public.permissoes (chave, modulo, descricao, feature_key, ordem)
values ('service_orders.view_all', 'service_orders', 'Ver as OS de todos os técnicos (sem ela, o técnico vê só as dele e as da equipe)', 'service_orders', 125)
on conflict (chave) do nothing;

insert into public.cargo_permissoes (cargo_id, permissao_chave)
select distinct cp.cargo_id, 'service_orders.view_all'
from public.cargo_permissoes cp
join public.cargos c on c.id = cp.cargo_id
where cp.permissao_chave = 'service_orders.view' and c.chave is distinct from 'technician'
on conflict do nothing;

create or replace function public.criar_cargos_padrao(p_loja_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      'service_orders.view', 'service_orders.view_all', 'service_orders.create', 'service_orders.edit', 'service_orders.assign',
      'technicians.view', 'calendar.view', 'calendar.manage', 'dispatch.view', 'attachments.upload'))
    or (c.chave = 'technician' and p.chave in (
      'dashboard.view', 'customers.view', 'assets.view',
      'service_orders.view', 'service_orders.edit', 'service_orders.finish',
      'calendar.view', 'technician.jobs.view', 'technician.jobs.start', 'technician.jobs.pause',
      'technician.jobs.complete', 'checklists.fill', 'attachments.upload',
      'service_orders.add_material', 'service_orders.sign'))
    or (c.chave = 'finance' and p.chave in (
      'dashboard.view', 'customers.view', 'service_orders.view', 'service_orders.view_all', 'reports.view'))
    or (c.chave = 'inventory' and p.chave in ('dashboard.view', 'assets.view'))
  where c.loja_id = p_loja_id and c.sistema
  on conflict do nothing;
end;
$function$;

create or replace function public.permissoes_padrao_cargo(p_chave text)
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_chave
    when 'manager' then array[
      'calendar.view', 'calendar.manage', 'dispatch.view', 'dispatch.assign',
      'checklists.fill', 'attachments.upload', 'service_orders.add_material', 'service_orders.sign',
      'service_orders.manage_time', 'service_orders.view_all']
    when 'attendant' then array[
      'calendar.view', 'calendar.manage', 'dispatch.view', 'attachments.upload', 'service_orders.view_all']
    when 'technician' then array[
      'calendar.view', 'technician.jobs.view', 'technician.jobs.start', 'technician.jobs.pause',
      'technician.jobs.complete', 'checklists.fill', 'attachments.upload',
      'service_orders.add_material', 'service_orders.sign']
    else '{}'::text[]
  end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. a regra, em um lugar só
-- ---------------------------------------------------------------------------
create or replace function public.escopo_os_restrito()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select public.tecnico_do_usuario() is not null and not public.tem_permissao('service_orders.view_all');
$function$;

create or replace function public.os_no_meu_escopo_id(p_os_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select not public.escopo_os_restrito() or exists (
    select 1
    from public.ordens_servico os
    cross join lateral (select public.tecnico_do_usuario() as eu) t
    where os.id = p_os_id
      and os.loja_id = public.loja_operacional_id()
      and (
        os.tecnico_id = t.eu
        or os.equipe_id in (select m.equipe_id from public.equipe_membros m where m.tecnico_id = t.eu and m.loja_id = os.loja_id)
        or exists (
          select 1 from public.agendamentos a
          where a.os_id = os.id and a.loja_id = os.loja_id
            and (a.tecnico_id = t.eu
                 or a.equipe_id in (select m.equipe_id from public.equipe_membros m where m.tecnico_id = t.eu and m.loja_id = os.loja_id)))
      )
  );
$function$;

create or replace function public.exigir_os_visivel(p_os_id uuid)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  -- só age para o técnico sem service_orders.view_all; os demais seguem as regras de cada função
  if not public.os_no_meu_escopo_id(p_os_id) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.escopo_os_restrito() from public, anon;
revoke all on function public.os_no_meu_escopo_id(uuid) from public, anon;
revoke all on function public.exigir_os_visivel(uuid) from public, anon, authenticated;
-- as duas primeiras aparecem nas políticas de RLS (avaliadas como o usuário)
grant execute on function public.escopo_os_restrito() to authenticated;
grant execute on function public.os_no_meu_escopo_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: a expressão atual de cada política ganha "and <escopo>"
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_escopo text;
  v_atual text;
begin
  for r in
    select * from (values
      ('ordens_servico', 'os_select', 'using', 'id'),
      ('ordens_servico', 'os_update', 'using', 'id'),
      ('agendamentos', 'agendamentos_select', 'using', 'os_id'),
      ('os_apontamentos', 'os_apontamentos_select', 'using', 'os_id'),
      ('os_assinaturas', 'os_assinaturas_select', 'using', 'os_id'),
      ('os_relatorios', 'os_relatorios_select', 'using', 'os_id'),
      ('os_anexos', 'os_anexos_update', 'using', 'os_id'),
      ('os_anexos', 'os_anexos_insert', 'check', 'os_id'),
      ('tecnico_indisponibilidade', 'tecnico_indisponibilidade_select', 'using', 'tecnico'),
      ('tecnico_jornada', 'tecnico_jornada_select', 'using', 'tecnico')
    ) as t(tabela, politica, parte, coluna)
  loop
    select case when r.parte = 'using' then qual else with_check end into v_atual
    from pg_policies where schemaname = 'public' and tablename = r.tabela and policyname = r.politica;
    if v_atual is null then
      raise exception 'Política %.% não encontrada', r.tabela, r.politica;
    end if;
    if v_atual like '%escopo_os_restrito%' then
      continue;
    end if;
    v_escopo := case when r.coluna = 'tecnico'
      then '((select public.escopo_os_restrito()) is not true or tecnico_id = (select public.tecnico_do_usuario()))'
      else format('((select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(%I))', r.coluna) end;
    execute format('alter policy %I on public.%I %s ((%s) and %s)',
                   r.politica, r.tabela, case when r.parte = 'using' then 'using' else 'with check' end, v_atual, v_escopo);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. funções: inserção cirúrgica no corpo atual
-- ---------------------------------------------------------------------------
create function pg_temp.remendar(p_funcao text, p_de text, p_para text, p_vezes int default 1)
 returns void
 language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_funcao::regprocedure);
  v_n int := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
begin
  if v_def like '%exigir_os_visivel%' or v_def like '%escopo_os_restrito%' then
    return; -- já tem o escopo
  end if;
  if v_n <> p_vezes then
    raise exception 'Trecho esperado % vez(es) em %, encontrado %', p_vezes, p_funcao, v_n;
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- 4a. funções por id de OS: a primeira linha do corpo confere o escopo
do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'public.agendar_os(uuid, timestamptz, timestamptz, uuid, uuid, text, boolean, text)',
    'public.alterar_status_os(uuid, uuid, text)',
    'public.anexos_os(uuid)',
    'public.aplicar_checklist_os(uuid, uuid)',
    'public.assinatura_os(uuid)',
    'public.atribuir_os(uuid, uuid, uuid)',
    'public.checklists_os(uuid)',
    'public.finalizacao_os(uuid)',
    'public.historico_status_os(uuid)',
    'public.horas_os(uuid)',
    'public.itens_os(uuid)',
    'public.lancar_apontamento(uuid, uuid, public.tipo_apontamento, timestamptz, timestamptz, public.motivo_pausa, text, uuid)',
    'public.obter_ordem_servico(uuid)',
    'public.registrar_assinatura_os(uuid, text, text, text, text, uuid)',
    'public.relatorio_tecnico_os(uuid, integer)',
    'public.sugerir_tecnicos(uuid, timestamptz, timestamptz, text)',
    'public.timeline_os(uuid, integer)'
  ] loop
    perform pg_temp.remendar(v_f, E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel(p_os_id);\n');
  end loop;
end;
$$;

-- 4b. funções que chegam à OS por outro id
select pg_temp.remendar('public.responder_item_checklist(uuid, jsonb)', E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel((select c.os_id from public.os_checklist_itens i join public.os_checklists c on c.id = i.checklist_id where i.id = p_item_id));\n');
select pg_temp.remendar('public.remover_checklist_os(uuid)', E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel((select os_id from public.os_checklists where id = p_checklist_id));\n');
select pg_temp.remendar('public.ajustar_apontamento(uuid, timestamptz, timestamptz, public.motivo_pausa, text)', E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel((select os_id from public.os_apontamentos where id = p_id));\n');
select pg_temp.remendar('public.excluir_apontamento(uuid)', E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel((select os_id from public.os_apontamentos where id = p_id));\n');
select pg_temp.remendar('public.reagendar_agendamento(uuid, integer, timestamptz, timestamptz, uuid, uuid, text, boolean, text)', E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel((select os_id from public.agendamentos where id = p_id));\n');
select pg_temp.remendar('public.definir_status_agendamento(uuid, integer, public.status_agendamento, text, text)', E'\nbegin\n', E'\nbegin\n  perform public.exigir_os_visivel((select os_id from public.agendamentos where id = p_id));\n');

-- 4c. listas e agregados: filtram pelo escopo (o subselect vira initplan: 1 vez por consulta)
select pg_temp.remendar('public.listar_ordens_servico(text, text, uuid, uuid, text, uuid, uuid, uuid, text, text, integer, integer)',
  E'      where os.loja_id = v_loja\n        and (\n          v_grupo = ''todas''',
  E'      where os.loja_id = v_loja\n        and ((select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(os.id))\n        and (\n          v_grupo = ''todas''');
select pg_temp.remendar('public.agenda_periodo(timestamptz, timestamptz, uuid, uuid, boolean)',
  E'      where a.loja_id = v_loja\n        and a.inicio_em < p_fim',
  E'      where a.loja_id = v_loja\n        and ((select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(a.os_id))\n        and a.inicio_em < p_fim');
select pg_temp.remendar('public.dashboard_atividade(integer)',
  E'      and not (\n        e.acao = ''os_status_alterado''',
  E'      and (e.acao not like ''os\\_%'' or (select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(os.id))\n      and not (\n        e.acao = ''os_status_alterado''');
select pg_temp.remendar('public.cliente_historico(uuid, integer)',
  E'    order by e.criado_em desc\n    limit v_limite',
  E'      and (e.acao not like ''os\\_%'' or (select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(os.id))\n    order by e.criado_em desc\n    limit v_limite');
select pg_temp.remendar('public.equipamento_historico(uuid, integer)',
  E'    order by e.criado_em desc\n    limit v_limite',
  E'      and (e.acao not like ''os\\_%'' or (select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(os.id))\n    order by e.criado_em desc\n    limit v_limite');
select pg_temp.remendar('public.dashboard_resumo(timestamptz, timestamptz, text)',
  'where os.loja_id = v_loja',
  'where os.loja_id = v_loja and ((select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(os.id))', 3);
select pg_temp.remendar('public.relatorio_os(timestamptz, timestamptz, text, uuid, uuid)',
  'where os.loja_id = v_loja',
  'where os.loja_id = v_loja and ((select public.escopo_os_restrito()) is not true or public.os_no_meu_escopo_id(os.id))', 1);

-- 4d. central de despacho é, por natureza, de todos os técnicos
select pg_temp.remendar('public.painel_despacho(date, text)', E'\nbegin\n',
  E'\nbegin\n  if public.escopo_os_restrito() then\n    raise exception ''A central de despacho mostra as OS de todos os técnicos; seu cargo vê só as suas.'' using errcode = ''42501'';\n  end if;\n');

-- 4e. arquivos da OS no Storage
select pg_temp.remendar('public.pode_acessar_arquivo_os(text, text)',
  'where id = v_os and loja_id = v_loja) then',
  'where id = v_os and loja_id = v_loja) or not public.os_no_meu_escopo_id(v_os) then');
