-- =====================================================================
-- Teste da agenda operacional (Fase 3 · 06 — etapa 4)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Os agendamentos entram por INSERT direto porque as funções de escrita
-- (agendar/reagendar) são da etapa 5; aqui se testa a leitura, o
-- isolamento e a integridade da tabela.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_tec_user uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_tb uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid;
  v_eq uuid;
  v_os1 uuid; v_os2 uuid; v_os_b uuid;
  v_ag1 uuid; v_ag2 uuid; v_ag_cancelado uuid;
  v_base timestamptz := date_trunc('hour', now()) + interval '1 day';
  v_json jsonb; v_n int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_tec_user]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_tec_user, v_loja_a, 'Tecnico A', 'tc@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and u.id = v_tec_user and c.chave = 'technician';
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Carlos', 'Souza') returning id into v_t1;
  insert into public.tecnicos (loja_id, nome) values (v_loja_a, 'Marina') returning id into v_t2;
  insert into public.tecnicos (loja_id, nome) values (v_loja_b, 'Técnico B') returning id into v_tb;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tecnico_id)
    values (v_loja_a, v_cli, v_st, 'Instalação CFTV', v_t1) returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Manutenção preventiva') returning id into v_os2;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'OS da empresa B') returning id into v_os_b;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_eq := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe CFTV'),
    jsonb_build_array(jsonb_build_object('tecnico_id', v_t2, 'lider', true)));
  execute 'reset role';

  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os1, v_t1, v_base, v_base + interval '90 minutes') returning id into v_ag1;
  insert into public.agendamentos (loja_id, os_id, equipe_id, inicio_em, fim_em, status)
    values (v_loja_a, v_os2, v_eq, v_base + interval '3 hours', v_base + interval '4 hours', 'confirmado') returning id into v_ag2;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em, status)
    values (v_loja_a, v_os1, v_t1, v_base + interval '10 days', v_base + interval '10 days 1 hour', 'cancelado')
    returning id into v_ag_cancelado;
  insert into public.agendamentos (loja_id, os_id, inicio_em, fim_em)
    values (v_loja_b, v_os_b, v_base, v_base + interval '1 hour');

  -- ---------------- período e conteúdo do evento ----------------
  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '8 hours');
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 2
     and v_json->'eventos'->0->>'id' = v_ag1::text
     and v_json->'eventos'->0->>'cliente' = 'Cliente A'
     and v_json->'eventos'->0->'tecnico'->>'nome' = 'Carlos Souza'
     and v_json->'eventos'->0->'status_os'->>'nome' is not null
     and v_json->'eventos'->0->'prioridade'->>'cor' is not null
     and v_json->'eventos'->1->'equipe'->>'nome' = 'Equipe CFTV'
     and v_json->'eventos'->1->>'status' = 'confirmado' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   eventos do período com cliente, técnico, equipe, status e prioridade';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA eventos: %s', v_json->'eventos'); end if;

  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '30 days');
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agendamento cancelado fica fora da agenda por padrão';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cancelado apareceu'; end if;

  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '30 days', null, null, true);
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cancelados aparecem quando pedidos';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA incluir cancelados'; end if;

  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base + interval '30 minutes', v_base + interval '45 minutes');
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 1 and v_json->'eventos'->0->>'id' = v_ag1::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   janela pega atendimento em curso (sobreposição, não só início)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA sobreposição do período'; end if;

  -- ---------------- filtros ----------------
  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '8 hours', v_t1, null);
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 1 and v_json->'eventos'->0->'tecnico'->>'id' = v_t1::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   filtro por técnico';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA filtro por técnico'; end if;

  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '8 hours', null, v_eq);
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 1 and v_json->'eventos'->0->'equipe'->>'id' = v_eq::text
     and jsonb_array_length(v_json->'tecnicos') = 2 and jsonb_array_length(v_json->'equipes') = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   filtro por equipe; colunas de técnicos e equipes ativos vêm junto';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA filtro por equipe/colunas'; end if;

  -- ---------------- período inválido e limite ----------------
  begin
    execute 'set local role authenticated';
    perform public.agenda_periodo(v_base, v_base);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período vazio aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período inválido → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.agenda_periodo(v_base, v_base + interval '90 days');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período de 90 dias aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período maior que dois meses → negado (performance)';
  end;
  execute 'reset role';

  -- ---------------- integridade ----------------
  begin
    insert into public.agendamentos (loja_id, os_id, inicio_em, fim_em)
      values (v_loja_a, v_os1, v_base, v_base - interval '1 hour');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA intervalo invertido aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   intervalo invertido → negado';
  end;

  begin
    insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
      values (v_loja_a, v_os1, v_tb, v_base, v_base + interval '1 hour');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico de outra empresa aceito no agendamento';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico precisa ser da mesma empresa';
  end;

  begin
    insert into public.agendamentos (loja_id, os_id, inicio_em, fim_em)
      values (v_loja_a, v_os_b, v_base, v_base + interval '1 hour');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS de outra empresa aceita no agendamento';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS precisa ser da mesma empresa';
  end;

  -- ---------------- RLS ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.agendamentos where loja_id = v_loja_a;
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '8 hours');
  execute 'reset role';
  if v_n = 0 and jsonb_array_length(v_json->'eventos') = 1
     and v_json->'eventos'->0->>'cliente' = 'Cliente B' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B só enxerga a própria agenda';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento: %s linhas de A / %s', v_n, v_json->'eventos'); end if;

  execute 'set local role authenticated';
  update public.agendamentos set inicio_em = v_base + interval '5 hours' where id = v_ag1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agendamentos não aceitam escrita direta do cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA escrita direta em agendamentos'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.agenda_periodo(v_base - interval '1 hour', v_base + interval '8 hours');
  select count(*) into v_n from public.agendamentos where loja_id = v_loja_a;
  execute 'reset role';
  if jsonb_array_length(v_json->'eventos') = 2 and v_n = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo Técnico lê a agenda da empresa (calendar.view)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA leitura pelo técnico: %s eventos / %s linhas', jsonb_array_length(v_json->'eventos'), v_n); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.agenda_periodo(v_base, v_base + interval '1 day');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu a agenda';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa a agenda';
  end;
  execute 'reset role';

  -- ---------------- exclusões em cascata ----------------
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.ordens_servico where id = v_os2;
  if not exists (select 1 from public.agendamentos where id = v_ag2) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a OS remove os agendamentos dela';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA agendamento órfão após excluir a OS'; end if;

  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.agendamentos where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove a agenda';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA agenda restou após excluir a empresa'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
