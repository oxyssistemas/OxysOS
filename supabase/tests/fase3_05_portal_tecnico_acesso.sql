-- =====================================================================
-- Teste de acesso ao portal do técnico (Fase 3 · 09 — etapa 7)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Os horários são ancorados na meia-noite local para o teste valer a
-- qualquer hora do dia.
-- =====================================================================
do $$
declare
  v_pro uuid; v_start uuid;
  v_loja_a uuid; v_loja_c uuid;
  v_owner_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_tec_a2 uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_c uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_t_c uuid;
  v_cli uuid; v_st uuid;
  v_eq uuid; v_pri_urgente uuid;
  v_os1 uuid; v_os2 uuid; v_os3 uuid;
  v_hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date::timestamp) at time zone 'America/Sao_Paulo';
  v_amanha timestamptz;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  v_amanha := v_hoje + interval '1 day';
  select id into v_pro from public.planos where nome = 'Pro';
  select id into v_start from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_tec_a, v_tec_a2, v_atend_a, v_tec_c, v_super]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa C') returning id into v_loja_c;
  insert into public.assinaturas (loja_id, plano_id, status) values
    (v_loja_a, v_pro, 'active'), (v_loja_c, v_start, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_tec_a, v_loja_a, 'Carlos Souza', 'ca@teste.invalid', 'funcionario'),
    (v_tec_a2, v_loja_a, 'Marina Dias', 'ma@teste.invalid', 'funcionario'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_c, v_loja_c, 'Técnico C', 'tc@teste.invalid', 'funcionario');
  insert into public.usuarios (id, loja_id, nome, email, papel)
    values (v_super, null, 'Super', 'su@teste.invalid', 'super_admin');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id in (v_tec_a, v_tec_a2);
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'attendant' and u.id = v_atend_a;
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_c and c.chave = 'technician' and u.id = v_tec_c;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Mercado Bom Preço') returning id into v_cli;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values
    (v_loja_a, 'Carlos', 'Souza', v_tec_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values
    (v_loja_a, 'Marina', 'Dias', v_tec_a2) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, usuario_id) values (v_loja_c, 'Téc C', v_tec_c) returning id into v_t_c;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_pri_urgente from public.prioridades_os where loja_id = v_loja_a and nivel = 'urgente' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_eq := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe CFTV'),
    jsonb_build_array(jsonb_build_object('tecnico_id', v_t1)));
  execute 'reset role';

  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, prioridade_id)
    values (v_loja_a, v_cli, v_st, 'Instalação CFTV', v_pri_urgente) returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Da equipe') returning id into v_os2;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Da Marina') returning id into v_os3;

  -- Carlos: dois atendimentos hoje (um dele, um da equipe); Marina: só amanhã
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os1, v_t1, v_hoje + interval '8 hours', v_hoje + interval '9 hours');
  insert into public.agendamentos (loja_id, os_id, equipe_id, inicio_em, fim_em) values
    (v_loja_a, v_os2, v_eq, v_hoje + interval '14 hours', v_hoje + interval '15 hours');
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os3, v_t2, v_amanha + interval '9 hours', v_amanha + interval '10 hours');

  -- ---------------- destino do login ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.destino_inicial() = 'technician' and public.pode_portal_tecnico() then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico é mandado para o portal do técnico';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA destino do técnico: %s', public.destino_inicial()); end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.destino_inicial() = 'app' and not public.pode_portal_tecnico() then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   proprietário continua no portal da empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA destino do proprietário'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.destino_inicial() = 'admin' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   super admin vai para o /admin';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA destino do super admin'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  if public.destino_inicial() = 'app' and v_json->>'situacao' = 'sem_feature' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   plano sem technician_portal não abre o portal';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA plano Start: %s', v_json); end if;
  execute 'reset role';

  -- ---------------- contexto ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  execute 'reset role';
  if v_json->>'situacao' = 'liberado'
     and v_json->'tecnico'->>'nome' = 'Carlos Souza'
     and v_json->'usuario'->>'cargo' = 'Técnico'
     and v_json->'empresa'->>'nome' = 'TESTE Empresa A'
     and jsonb_array_length(v_json->'equipes') = 1
     and v_json->'permissoes' @> '["technician.jobs.start","checklists.fill"]'::jsonb
     and (v_json->>'acesso_portal_empresa')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   contexto traz técnico, empresa, cargo, equipes e permissões de campo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA contexto: %s', v_json); end if;

  -- ---------------- home ----------------
  execute 'set local role authenticated';
  v_json := public.home_tecnico('America/Sao_Paulo');
  execute 'reset role';
  if (v_json->'hoje'->>'total')::int = 2
     and (v_json->'hoje'->>'urgentes')::int = 1
     and (v_json->'hoje'->>'concluidos')::int = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   home conta o dia do técnico (o dele + o da equipe dele)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA contagem do dia: %s', v_json->'hoje'); end if;

  -- a Marina só tem o de amanhã: serve para conferir o "próximo" sem depender da hora
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.home_tecnico('America/Sao_Paulo');
  execute 'reset role';
  if (v_json->'hoje'->>'total')::int = 0
     and (v_json->>'proximos_dias')::int = 1
     and v_json->'proximo'->>'os_id' = v_os3::text
     and v_json->'proximo'->>'cliente' = 'Mercado Bom Preço'
     and v_json->'proximo'->'status_os'->>'nome' is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   próximo atendimento com cliente, status e prioridade; nada dos outros técnicos';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA próximo atendimento: %s', v_json); end if;

  -- ---------------- quem não é técnico ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  execute 'reset role';
  if v_json->>'situacao' = 'sem_tecnico' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   usuário sem cadastro de técnico não entra no portal';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atendente no portal: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    perform public.home_tecnico('America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente leu a home do técnico';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   home do técnico exige o portal liberado';
  end;
  execute 'reset role';

  -- ---------------- cargo sem a permissão de campo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.salvar_cargo(
    (select id from public.cargos where loja_id = v_loja_a and chave = 'technician'),
    (select versao from public.cargos where loja_id = v_loja_a and chave = 'technician'),
    jsonb_build_object('nome', 'Técnico'), array['dashboard.view', 'service_orders.view']);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  execute 'reset role';
  if v_json->>'situacao' = 'sem_permissao' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem technician.jobs.view o portal é negado, mesmo sendo técnico';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA permissão do portal: %s', v_json); end if;

  execute 'set local role authenticated';
  if public.destino_inicial() = 'app' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nesse caso o login cai no portal da empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA destino sem permissão de campo'; end if;
  execute 'reset role';

  -- ---------------- técnico desativado ----------------
  perform set_config('request.jwt.claims', '{}', true);
  update public.tecnicos set ativo = false where id = v_t2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  execute 'reset role';
  if v_json->>'situacao' = 'sem_tecnico' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico desativado perde o portal';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA técnico inativo: %s', v_json); end if;

  -- ---------------- anônimo ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.contexto_tecnico();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo abriu o portal';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa o portal do técnico';
  end;
  execute 'reset role';

  if not has_function_privilege('anon', 'public.home_tecnico(text)', 'execute')
     and not has_function_privilege('anon', 'public.destino_inicial()', 'execute')
     and has_function_privilege('authenticated', 'public.contexto_tecnico()', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   funções do portal fora do alcance do anônimo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA execute das funções do portal'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
