-- =====================================================================
-- Teste do Dashboard (Fase 2 · 02)
-- Cria dados das empresas A e B dentro de uma transação, valida números,
-- isolamento, permissões e vazamento via log forjado; desfaz tudo ao final.
-- Resultado esperado: "TOTAL: N ok, 0 falhas".
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_func_a uuid := gen_random_uuid();
  v_aberto_a uuid; v_final_a uuid; v_aberto_b uuid;
  v_cli_a1 uuid; v_cli_a2 uuid; v_cli_b uuid;
  v_os_a1 uuid; v_os_b1 uuid;
  -- "últimos 7 dias" com limites à meia-noite de São Paulo, como o front envia
  v_inicio timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '6 days') at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo';
  v_json jsonb;
  v_n int;
  v_txt text;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Start';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
    (v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@teste.invalid', '', now(), now()),
    (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@teste.invalid', '', now(), now()),
    (v_func_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'func-a@teste.invalid',  '', now(), now());

  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'owner-a@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'owner-b@teste.invalid', 'gerente'),
    (v_func_a,  v_loja_a, 'Func A',  'func-a@teste.invalid',  'funcionario');

  insert into public.status_os (loja_id, nome, categoria, ordem) values (v_loja_a, 'Aberta', 'aberto', 1) returning id into v_aberto_a;
  insert into public.status_os (loja_id, nome, categoria, ordem) values (v_loja_a, 'Concluída', 'finalizado_sucesso', 2) returning id into v_final_a;
  insert into public.status_os (loja_id, nome, categoria, ordem) values (v_loja_b, 'Aberta', 'aberto', 1) returning id into v_aberto_b;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A1') returning id into v_cli_a1;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A2') returning id into v_cli_a2;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B secreto') returning id into v_cli_b;

  -- A: 3 OS (2 abertas, 1 finalizada hoje), responsável = owner A em duas
  insert into public.ordens_servico (loja_id, cliente_id, status_id, responsavel_id, descricao)
    values (v_loja_a, v_cli_a1, v_final_a, v_owner_a, 'OS A1') returning id into v_os_a1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, responsavel_id, descricao)
    values (v_loja_a, v_cli_a1, v_aberto_a, v_owner_a, 'OS A2');
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli_a2, v_aberto_a, 'OS A3');
  insert into public.os_historico (os_id, usuario_id, status_anterior_id, status_novo_id)
    values (v_os_a1, v_owner_a, v_aberto_a, v_final_a);
  -- B: 2 OS abertas
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_aberto_b, 'OS B1') returning id into v_os_b1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_aberto_b, 'OS B2');

  -- Log forjado na empresa A apontando para OS/cliente da empresa B
  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (v_loja_a, v_owner_a, 'os_status_alterado', jsonb_build_object('os_id', v_os_b1, 'para', v_aberto_b));
  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (v_loja_a, v_owner_a, 'cliente_cadastrado', jsonb_build_object('cliente_id', v_cli_b));

  -- ================= Owner A =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(v_inicio, v_fim, 'America/Sao_Paulo');
  execute 'reset role';

  if (v_json->'cards'->>'os_abertas')::int = 2 and (v_json->'cards'->>'os_finalizadas_periodo')::int = 1
     and (v_json->'cards'->>'os_criadas_periodo')::int = 3 and (v_json->'cards'->>'clientes_total')::int = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cards da empresa A corretos (2 abertas, 3 criadas, 1 finalizada, 2 clientes)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cards A: %s', v_json->'cards'); end if;

  if v_json->'cards'->'tecnicos_ativos' = 'null'::jsonb and v_json->'cards'->'faturamento_periodo' = 'null'::jsonb
     and v_json->'os_por_prioridade' = 'null'::jsonb then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   métricas sem fonte real voltam null (sem número inventado)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA métricas sem fonte'; end if;

  select sum((x->>'criadas')::int), count(*) into v_n, v_txt from jsonb_array_elements(v_json->'os_por_periodo') x;
  if v_n = 3 and v_txt = '7' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   série diária: 7 dias preenchidos, soma = 3 criadas';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA série: soma %s, dias %s', v_n, v_txt); end if;

  select sum((x->>'total')::int) into v_n from jsonb_array_elements(v_json->'os_por_status') x;
  if v_n = 3 and jsonb_array_length(v_json->'os_por_status') = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS por status: só status da empresa A, soma = 3';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA por status: %s', v_json->'os_por_status'); end if;

  if v_json->'os_por_responsavel' @> jsonb_build_array(jsonb_build_object('nome', 'Owner A', 'total', 2))
     and v_json->'os_por_responsavel' @> jsonb_build_array(jsonb_build_object('nome', 'Sem responsável', 'total', 1)) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS por responsável (Owner A: 2, Sem responsável: 1)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA por responsável: %s', v_json->'os_por_responsavel'); end if;

  execute 'set local role authenticated';
  v_json := public.dashboard_atividade(50);
  execute 'reset role';
  if v_json::text not like '%Cliente B secreto%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   log forjado com IDs da empresa B não revela nomes de B';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atividade vazou dados de B'; end if;

  if v_json @> jsonb_build_array(jsonb_build_object('acao', 'cliente_cadastrado', 'cliente', 'Cliente A1')) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cadastro de cliente gera evento real (trigger)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA evento cliente_cadastrado: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    perform public.dashboard_resumo(v_fim, v_inicio);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período invertido aceito';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período inválido → erro';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(v_inicio, v_fim, 'Fuso/Invalido');
  execute 'reset role';
  if v_json->'periodo'->>'fuso' = 'America/Sao_Paulo' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   fuso inválido cai para America/Sao_Paulo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA fuso inválido'; end if;

  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(v_inicio - interval '300 days', v_fim);
  execute 'reset role';
  if v_json->'periodo'->>'granularidade' = 'mes' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período longo agrupa por mês';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA granularidade mensal'; end if;

  -- ================= Owner B =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(v_inicio, v_fim);
  execute 'reset role';
  if (v_json->'cards'->>'os_criadas_periodo')::int = 2 and (v_json->'cards'->>'clientes_total')::int = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B vê apenas os próprios números';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cards B: %s', v_json->'cards'); end if;

  -- ================= Cargo sem acesso a OS/clientes (Estoque) =================
  perform set_config('request.jwt.claims', '{}', true);
  update public.usuarios set cargo_id = (select id from public.cargos where loja_id = v_loja_a and chave = 'inventory')
   where id = v_func_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_func_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(v_inicio, v_fim);
  execute 'reset role';
  if v_json->'os_por_status' = 'null'::jsonb and v_json->'cards'->'os_abertas' = 'null'::jsonb
     and v_json->'cards'->'clientes_total' = 'null'::jsonb then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo Estoque: seções de OS e clientes ocultas no servidor';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cargo Estoque vê: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.dashboard_atividade(50);
  execute 'reset role';
  if jsonb_array_length(v_json) = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo Estoque: atividade de OS/clientes oculta';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atividade para Estoque: %s', v_json); end if;

  -- Cargo sem dashboard.view
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.cargos (loja_id, nome) values (v_loja_a, 'Sem acesso TESTE');
  update public.usuarios set cargo_id = (select id from public.cargos where loja_id = v_loja_a and nome = 'Sem acesso TESTE')
   where id = v_func_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_func_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.dashboard_resumo(v_inicio, v_fim);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo sem dashboard.view acessou o resumo';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem dashboard.view → negado';
  end;
  execute 'reset role';

  -- ================= Etapa 7: cliente arquivado =================
  perform set_config('request.jwt.claims', '{}', true);
  update public.clientes set arquivado_em = now() where id = v_cli_a2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(v_inicio, v_fim);
  execute 'reset role';
  if (v_json->'cards'->>'clientes_total')::int = 1 and (v_json->'cards'->>'os_criadas_periodo')::int = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cliente arquivado sai do total de clientes; OS dele continuam contando';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA contagem com arquivado: %s', v_json->'cards'); end if;

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli_a2, v_aberto_a, 'OS nova para arquivado');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS criada para cliente arquivado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cliente arquivado não recebe nova OS';
  end;
  execute 'reset role';

  -- ================= Empresa suspensa / anônimo =================
  perform set_config('request.jwt.claims', '{}', true);
  update public.lojas set status = 'suspensa' where id = v_loja_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.dashboard_resumo(v_inicio, v_fim);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa suspensa acessou o dashboard';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa → negado';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.dashboard_atividade(10);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo acessou atividade';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo → negado';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
