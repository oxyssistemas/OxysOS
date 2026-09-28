-- =====================================================================
-- Teste de equipes e disponibilidade (Fase 3 · 01 a 03)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Datas: usa a próxima segunda-feira (jornada) e férias na semana
-- seguinte, para os dois efeitos não se misturarem.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_t_inativo uuid; v_t_b uuid;
  v_cli uuid; v_st uuid;
  v_eq uuid; v_eq_sem_uso uuid; v_eq_inativa uuid;
  v_os uuid;
  v_versao int; v_n int;
  v_json jsonb;
  -- próxima segunda-feira 00:00 no fuso da operação
  v_segunda timestamptz := (date_trunc('week', (now() at time zone 'America/Sao_Paulo')) + interval '1 week')
                           at time zone 'America/Sao_Paulo';
  v_ferias_inicio timestamptz;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  v_ferias_inicio := v_segunda + interval '7 days';

  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and u.id = v_atend_a and c.chave = 'attendant';
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Carlos', 'Souza') returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Marina', 'Dias') returning id into v_t2;
  insert into public.tecnicos (loja_id, nome) values (v_loja_a, 'Inativo') returning id into v_t_inativo;
  update public.tecnicos set ativo = false where id = v_t_inativo;   -- técnico nasce ativo por regra do banco
  insert into public.tecnicos (loja_id, nome) values (v_loja_b, 'Técnico B') returning id into v_t_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;

  -- ---------------- permissões novas nos cargos padrão ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.tem_permissao('calendar.manage') and public.tem_permissao('dispatch.view')
     and not public.tem_permissao('technician.jobs.start') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente recebeu agenda/despacho e não recebeu ações de campo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA permissões novas no cargo atendente'; end if;
  execute 'reset role';

  -- ---------------- equipes ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_eq := public.salvar_equipe(null, null,
    jsonb_build_object('nome', '  Equipe   CFTV ', 'descricao', 'Instalações', 'cor', '#1d9e75'),
    jsonb_build_array(jsonb_build_object('tecnico_id', v_t1, 'lider', true),
                      jsonb_build_object('tecnico_id', v_t2),
                      jsonb_build_object('tecnico_id', v_t1)));
  execute 'reset role';
  if exists (select 1 from public.equipes where id = v_eq and nome = 'Equipe CFTV' and cor = '#1D9E75' and versao = 1)
     and (select count(*) from public.equipe_membros where equipe_id = v_eq) = 2
     and exists (select 1 from public.equipe_membros where equipe_id = v_eq and tecnico_id = v_t1 and lider)
     and exists (select 1 from public.logs_auditoria where acao = 'equipe_criada' and entidade_id = v_eq) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe criada (nome normalizado, membro repetido ignorado, líder e auditoria)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA criação da equipe'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_equipe(null, null, jsonb_build_object('nome', 'Com inativo'),
      jsonb_build_array(jsonb_build_object('tecnico_id', v_t_inativo)));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico inativo entrou na equipe';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   só técnico ativo entra na equipe';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.salvar_equipe(null, null, jsonb_build_object('nome', 'Com técnico de B'),
      jsonb_build_array(jsonb_build_object('tecnico_id', v_t_b)));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico de outra empresa entrou na equipe';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico de outra empresa não entra na equipe';
  end;
  execute 'reset role';

  select versao into v_versao from public.equipes where id = v_eq;
  execute 'set local role authenticated';
  perform public.salvar_equipe(v_eq, v_versao, jsonb_build_object('nome', 'Equipe CFTV'),
    jsonb_build_array(jsonb_build_object('tecnico_id', v_t2, 'lider', true)));
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.salvar_equipe(v_eq, v_versao, jsonb_build_object('nome', 'Versão antiga'), '[]'::jsonb);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão antiga sobrescreveu a equipe';
  exception when serialization_failure then
    if (select count(*) from public.equipe_membros where equipe_id = v_eq) = 1 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   membros substituídos na edição; versão antiga → conflito';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA substituição de membros'; end if;
  end;
  execute 'reset role';

  -- ---------------- OS da equipe ----------------
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, equipe_id)
    values (v_loja_a, v_cli, v_st, 'OS da equipe', v_eq) returning id into v_os;
  execute 'reset role';
  if exists (select 1 from public.log_eventos where acao = 'os_equipe_atribuida' and detalhes->>'os_id' = v_os::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atribuir equipe à OS gera evento na timeline';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento de equipe na OS'; end if;

  begin
    execute 'set local role authenticated';
    perform public.definir_equipe_ativa(v_eq, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA equipe com OS aberta foi desativada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe com OS em aberto não é desativada';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.excluir_equipe(v_eq);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA equipe usada em OS foi excluída';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe usada em OS não é excluída';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_eq_inativa := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe parada'), '[]'::jsonb);
  perform public.definir_equipe_ativa(v_eq_inativa, false);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, equipe_id)
      values (v_loja_a, v_cli, v_st, 'OS para equipe inativa', v_eq_inativa);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS atribuída a equipe inativa';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS não é atribuída a equipe inativa';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_eq_sem_uso := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe sem uso'), '[]'::jsonb);
  perform public.excluir_equipe(v_eq_sem_uso);
  v_json := public.listar_equipes();
  execute 'reset role';
  if not exists (select 1 from public.equipes where id = v_eq_sem_uso)
     and jsonb_array_length(v_json) = 2
     and v_json @> '[{"nome":"Equipe CFTV","os_abertas":1}]'
     and v_json @> '[{"nome":"Equipe parada","ativo":false}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe sem uso é excluída; listagem traz membros e OS abertas';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA listagem/exclusão: %s', v_json); end if;

  -- ---------------- jornada ----------------
  execute 'set local role authenticated';
  perform public.salvar_jornada_tecnico(v_t1, jsonb_build_array(
    jsonb_build_object('dia_semana', 1, 'inicio', '08:00', 'fim', '12:00'),
    jsonb_build_object('dia_semana', 1, 'inicio', '13:00', 'fim', '18:00'),
    jsonb_build_object('dia_semana', 2, 'inicio', '08:00', 'fim', '18:00')));
  execute 'reset role';
  if (select count(*) from public.tecnico_jornada where tecnico_id = v_t1) = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   jornada semanal salva (dois turnos no mesmo dia)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA jornada'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_jornada_tecnico(v_t1, jsonb_build_array(
      jsonb_build_object('dia_semana', 1, 'inicio', '08:00', 'fim', '12:00'),
      jsonb_build_object('dia_semana', 1, 'inicio', '11:00', 'fim', '15:00')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA turnos sobrepostos aceitos';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   turnos sobrepostos no mesmo dia → negado';
  end;
  execute 'reset role';

  -- ---------------- ausências ----------------
  execute 'set local role authenticated';
  perform public.registrar_indisponibilidade(v_t1, 'ferias', v_ferias_inicio, v_ferias_inicio + interval '5 days', 'Férias');
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.registrar_indisponibilidade(v_t1, 'folga', v_ferias_inicio + interval '1 day', v_ferias_inicio + interval '2 days');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA ausências sobrepostas aceitas';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   ausências do mesmo técnico não se sobrepõem (trava no banco)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.registrar_indisponibilidade(v_t1, 'folga', v_ferias_inicio + interval '30 days', v_ferias_inicio + interval '29 days');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período invertido aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período invertido → negado';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.disponibilidade_tecnico(v_t1);
  execute 'reset role';
  if jsonb_array_length(v_json->'jornada') = 3 and jsonb_array_length(v_json->'ausencias') = 1
     and v_json->'jornada'->0->>'inicio' = '08:00' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   consulta de disponibilidade (jornada + ausências)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA disponibilidade: %s', v_json); end if;

  -- ---------------- disponibilidade calculada ----------------
  execute 'set local role authenticated';
  if public.tecnico_disponivel_em(v_t1, v_segunda + interval '11 hours', v_segunda + interval '12 hours')
     and not public.tecnico_disponivel_em(v_t1, v_segunda + interval '12 hours 30 minutes', v_segunda + interval '13 hours 30 minutes')
     and not public.tecnico_disponivel_em(v_t1, v_segunda - interval '1 day' + interval '9 hours', v_segunda - interval '1 day' + interval '10 hours')
     and not public.tecnico_disponivel_em(v_t1, v_ferias_inicio + interval '11 hours', v_ferias_inicio + interval '12 hours')
     and public.tecnico_disponivel_em(v_t2, v_segunda - interval '1 day' + interval '9 hours', v_segunda - interval '1 day' + interval '10 hours')
     and not public.tecnico_disponivel_em(v_t_inativo, v_segunda + interval '9 hours', v_segunda + interval '10 hours') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   disponibilidade: dentro do turno, no intervalo, fora do dia, em férias, sem jornada e inativo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA disponibilidade: turno=%s intervalo=%s domingo=%s ferias=%s semjornada=%s inativo=%s',
      public.tecnico_disponivel_em(v_t1, v_segunda + interval '11 hours', v_segunda + interval '12 hours'),
      public.tecnico_disponivel_em(v_t1, v_segunda + interval '12 hours 30 minutes', v_segunda + interval '13 hours 30 minutes'),
      public.tecnico_disponivel_em(v_t1, v_segunda - interval '1 day' + interval '9 hours', v_segunda - interval '1 day' + interval '10 hours'),
      public.tecnico_disponivel_em(v_t1, v_ferias_inicio + interval '11 hours', v_ferias_inicio + interval '12 hours'),
      public.tecnico_disponivel_em(v_t2, v_segunda - interval '1 day' + interval '9 hours', v_segunda - interval '1 day' + interval '10 hours'),
      public.tecnico_disponivel_em(v_t_inativo, v_segunda + interval '9 hours', v_segunda + interval '10 hours')); end if;
  execute 'reset role';

  -- ---------------- permissões ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.salvar_equipe(null, null, jsonb_build_object('nome', 'Do atendente'), '[]'::jsonb);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente criou equipe';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipes exigem technicians.manage';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.listar_equipes();
  execute 'reset role';
  if jsonb_array_length(v_json) = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem vê técnicos lê as equipes';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA leitura de equipes pelo atendente'; end if;

  -- ---------------- isolamento ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.equipes where loja_id = v_loja_a;
  select v_n + count(*) into v_n from public.tecnico_jornada where loja_id = v_loja_a;
  select v_n + count(*) into v_n from public.tecnico_indisponibilidade where loja_id = v_loja_a;
  v_json := public.listar_equipes();
  execute 'reset role';
  if v_n = 0 and jsonb_array_length(v_json) = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê equipes, jornadas nem ausências de A';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento B: %s registros', v_n); end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_jornada_tecnico(v_t1, '[]'::jsonb);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B alterou jornada de técnico de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não altera jornada de técnico de A';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.equipes set nome = 'invadido' where id = v_eq;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipes não aceitam escrita direta';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA escrita direta em equipes'; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.listar_equipes();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo listou equipes';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa equipes';
  end;
  execute 'reset role';

  if not has_function_privilege('anon', 'public.trg_tecnico_jornada_sem_sobreposicao()', 'execute')
     and not has_function_privilege('anon', 'public.trg_ordens_servico_equipe_ativa()', 'execute')
     and not has_function_privilege('authenticated', 'public.exigir_gestao_tecnicos()', 'execute')
     and has_function_privilege('authenticated', 'public.listar_equipes()', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   gatilhos e função interna fora da API; RPCs só para autenticados';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA execute das funções novas'; end if;

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.equipes where loja_id = v_loja_a)
       and not exists (select 1 from public.tecnico_jornada where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove equipes, jornadas e ausências';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dados restaram após excluir a empresa'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
