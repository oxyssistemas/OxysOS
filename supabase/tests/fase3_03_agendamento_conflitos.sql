-- =====================================================================
-- Teste de agendamento, reagendamento e conflitos (Fase 3 · 07 — etapa 5)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- As datas saem da próxima segunda-feira para casar com a jornada criada
-- no próprio teste; as ausências ficam em outra semana.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_user uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_t_inativo uuid;
  v_cli uuid; v_st uuid; v_st_fim uuid;
  v_eq uuid; v_eq_inativa uuid;
  v_os1 uuid; v_os2 uuid; v_os3 uuid; v_os_fim uuid;
  v_ag1 uuid; v_ag2 uuid;
  v_versao int;
  v_json jsonb; v_res jsonb;
  v_segunda timestamptz := (date_trunc('week', (now() at time zone 'America/Sao_Paulo')) + interval '1 week')
                           at time zone 'America/Sao_Paulo';
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a, v_tec_user]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_user, v_loja_a, 'Tecnico A', 'tc@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'attendant' and u.id = v_atend_a;
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id = v_tec_user;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Carlos', 'Souza') returning id into v_t1;
  insert into public.tecnicos (loja_id, nome) values (v_loja_a, 'Marina') returning id into v_t2;
  insert into public.tecnicos (loja_id, nome) values (v_loja_a, 'Inativo') returning id into v_t_inativo;
  update public.tecnicos set ativo = false where id = v_t_inativo;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values
    (v_loja_a, v_cli, v_st, 'Instalação CFTV') returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values
    (v_loja_a, v_cli, v_st, 'Manutenção') returning id into v_os2;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values
    (v_loja_a, v_cli, v_st, 'Vistoria') returning id into v_os3;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values
    (v_loja_a, v_cli, v_st, 'OS encerrada') returning id into v_os_fim;
  -- sem usuário autenticado o gatilho de workflow permite ajustar o status direto
  update public.ordens_servico set status_id = v_st_fim where id = v_os_fim;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_eq := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe CFTV'),
    jsonb_build_array(jsonb_build_object('tecnico_id', v_t2)));
  v_eq_inativa := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe parada'), '[]'::jsonb);
  perform public.definir_equipe_ativa(v_eq_inativa, false);
  perform public.salvar_jornada_tecnico(v_t1, jsonb_build_array(
    jsonb_build_object('dia_semana', 1, 'inicio', '08:00', 'fim', '18:00')));
  execute 'reset role';

  execute 'set local role authenticated';
  if public.tem_permissao('calendar.override') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   proprietário tem calendar.override';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA calendar.override no proprietário'; end if;
  execute 'reset role';

  -- ---------------- agendar ----------------
  execute 'set local role authenticated';
  v_res := public.agendar_os(v_os1, v_segunda + interval '9 hours', v_segunda + interval '10 hours 30 minutes',
    v_t1, null, 'Levar escada', false, 'America/Sao_Paulo');
  execute 'reset role';
  v_ag1 := (v_res->>'id')::uuid;
  if exists (select 1 from public.agendamentos where id = v_ag1 and tecnico_id = v_t1 and status = 'agendado')
     and exists (select 1 from public.ordens_servico where id = v_os1
                  and data_agendada = ((v_segunda + interval '9 hours') at time zone 'America/Sao_Paulo')::date
                  and hora_agendada = '09:00'::time and tecnico_id = v_t1)
     and exists (select 1 from public.log_eventos where acao = 'os_agendada' and detalhes->>'agendamento_id' = v_ag1::text)
     and jsonb_array_length(v_res->'conflitos') = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agendar grava o horário na OS, atribui o técnico e registra na timeline';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA agendar: %s', v_res); end if;

  -- ---------------- conflitos ----------------
  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os2, v_segunda + interval '10 hours', v_segunda + interval '11 hours', v_t1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA agendou por cima de outro atendimento';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico ocupado → agendamento recusado';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.conflitos_agendamento(v_t1, null, v_segunda + interval '10 hours', v_segunda + interval '11 hours');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'tipo' = 'tecnico_ocupado'
     and v_json->0->>'mensagem' like 'Carlos Souza já tem atendimento em %das 09:00 às 10:30.' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   conflito descreve quem, quando e em que horário';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA mensagem do conflito: %s', v_json); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os2, v_segunda + interval '10 hours', v_segunda + interval '11 hours', v_t1, null, null, true);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente forçou agendamento em conflito';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   forçar conflito exige calendar.override';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_res := public.agendar_os(v_os2, v_segunda + interval '10 hours', v_segunda + interval '11 hours', v_t1, null, null, true);
  execute 'reset role';
  v_ag2 := (v_res->>'id')::uuid;
  if v_ag2 is not null and jsonb_array_length(v_res->'conflitos') = 1
     and exists (select 1 from public.log_eventos where acao = 'os_agendada'
                  and detalhes->>'agendamento_id' = v_ag2::text and (detalhes->>'forcado')::boolean) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem tem override agenda em conflito e o evento fica marcado';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA override: %s', v_res); end if;

  execute 'set local role authenticated';
  perform public.agendar_os(v_os3, v_segunda + interval '14 hours', v_segunda + interval '15 hours', null, v_eq);
  v_json := public.conflitos_agendamento(null, v_eq, v_segunda + interval '14 hours 30 minutes', v_segunda + interval '16 hours');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'tipo' = 'equipe_ocupada' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe ocupada entra como conflito';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA conflito de equipe: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.conflitos_agendamento(v_t1, null, v_segunda - interval '1 day' + interval '9 hours',
                                                     v_segunda - interval '1 day' + interval '10 hours');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'tipo' = 'fora_jornada' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   horário fora da jornada entra como conflito';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA conflito de jornada: %s', v_json); end if;

  execute 'set local role authenticated';
  perform public.registrar_indisponibilidade(v_t2, 'ferias', v_segunda + interval '30 days',
                                             v_segunda + interval '35 days');
  v_json := public.conflitos_agendamento(v_t2, null, v_segunda + interval '31 days 9 hours',
                                                     v_segunda + interval '31 days 10 hours');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'tipo' = 'tecnico_ausente'
     and v_json->0->>'mensagem' like '%férias%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   ausência do técnico entra como conflito com o motivo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA conflito de ausência: %s', v_json); end if;

  -- ---------------- reagendar ----------------
  select versao into v_versao from public.agendamentos where id = v_ag1;
  execute 'set local role authenticated';
  v_res := public.reagendar_agendamento(v_ag1, v_versao, v_segunda + interval '15 hours',
    v_segunda + interval '16 hours', v_t1, null, null, false, 'America/Sao_Paulo');
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag1 and inicio_em = v_segunda + interval '15 hours' and versao = v_versao + 1)
     and exists (select 1 from public.ordens_servico where id = v_os1 and hora_agendada = '15:00'::time)
     and exists (select 1 from public.log_eventos where acao = 'os_reagendada' and detalhes->>'agendamento_id' = v_ag1::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reagendar move o horário, atualiza a OS e registra na timeline';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA reagendar'; end if;

  begin
    execute 'set local role authenticated';
    perform public.reagendar_agendamento(v_ag1, v_versao, v_segunda + interval '16 hours', v_segunda + interval '17 hours', v_t1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão antiga reagendou';
  exception when serialization_failure then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   versão antiga do agendamento → conflito de edição';
  end;
  execute 'reset role';

  select versao into v_versao from public.agendamentos where id = v_ag1;
  execute 'set local role authenticated';
  v_res := public.reagendar_agendamento(v_ag1, v_versao, v_segunda + interval '15 hours 30 minutes',
    v_segunda + interval '16 hours 30 minutes', v_t1);
  execute 'reset role';
  if jsonb_array_length(v_res->'conflitos') = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o próprio agendamento não conta como conflito ao ser movido';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA autoconflito: %s', v_res); end if;

  -- ---------------- cancelar e confirmar ----------------
  select versao into v_versao from public.agendamentos where id = v_ag1;
  execute 'set local role authenticated';
  perform public.definir_status_agendamento(v_ag1, v_versao, 'cancelado', 'Cliente pediu para remarcar');
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag1 and status = 'cancelado' and observacao = 'Cliente pediu para remarcar')
     and exists (select 1 from public.log_eventos where acao = 'os_agendamento_cancelado' and detalhes->>'agendamento_id' = v_ag1::text)
     and exists (select 1 from public.ordens_servico where id = v_os1 and data_agendada is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cancelar registra o motivo e limpa a data da OS';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cancelamento'; end if;

  select versao into v_versao from public.agendamentos where id = v_ag2;
  begin
    execute 'set local role authenticated';
    perform public.definir_status_agendamento(v_ag2, v_versao, 'concluido');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA status de campo aceito pela agenda';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   concluído/em andamento só vêm do atendimento em campo';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.definir_status_agendamento(v_ag2, v_versao, 'confirmado');
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag2 and status = 'confirmado')
     and exists (select 1 from public.log_eventos where acao = 'os_agendamento_confirmado' and detalhes->>'agendamento_id' = v_ag2::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   confirmar o atendimento com o cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA confirmação'; end if;

  -- ---------------- validações ----------------
  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os_fim, v_segunda + interval '20 hours', v_segunda + interval '21 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS finalizada foi agendada';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS finalizada não entra na agenda';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '21 hours', v_t_inativo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico inativo aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico inativo não recebe agendamento';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '21 hours', null, v_eq_inativa);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA equipe inativa aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe inativa não recebe agendamento';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '48 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendimento de mais de 24h aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento acima de 24 horas → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '19 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período invertido aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período invertido → negado';
  end;
  execute 'reset role';

  -- ---------------- permissões e tenant ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_user, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '21 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo Técnico agendou';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agendar exige calendar.manage';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '21 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B agendou OS de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não agenda OS de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.reagendar_agendamento(v_ag2, 1, v_segunda + interval '20 hours', v_segunda + interval '21 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B reagendou atendimento de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não reagenda atendimento de A';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.agendar_os(v_os3, v_segunda + interval '20 hours', v_segunda + interval '21 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo agendou';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não agenda';
  end;
  execute 'reset role';

  -- ---------------- linha do tempo da OS ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.timeline_os(v_os2);
  execute 'reset role';
  if (select count(*) from jsonb_array_elements(v_json) e
      where e->>'acao' = 'os_agendada'
        and e->'dados'->>'inicio' is not null and e->'dados'->>'fim' is not null
        and e->'dados'->>'tecnico' = 'Carlos Souza'
        and (e->'dados'->>'forcado')::boolean) = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   timeline mostra o agendamento com horário, técnico e marca de conflito';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA timeline do agendamento: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.timeline_os(v_os1);
  execute 'reset role';
  if (select count(*) from jsonb_array_elements(v_json) e
      where e->>'acao' = 'os_reagendada' and e->'dados'->>'de_inicio' is not null) = 2
     and v_json @> '[{"acao":"os_agendamento_cancelado","dados":{"observacao":"Cliente pediu para remarcar"}}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   timeline mostra reagendamento (de/para) e cancelamento com motivo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA timeline do reagendamento: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.timeline_os(v_os3);
  execute 'reset role';
  if v_json @> '[{"acao":"os_equipe_atribuida","dados":{"equipe":"Equipe CFTV"}}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   timeline nomeia a equipe atribuída';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA timeline da equipe: %s', v_json); end if;

  if not has_function_privilege('authenticated', 'public.exigir_gestao_agenda()', 'execute')
     and not has_function_privilege('authenticated', 'public.sincronizar_agendamento_os(uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.agendar_os(uuid, timestamptz, timestamptz, uuid, uuid, text, boolean, text)', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   funções internas fora da API';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA execute das funções internas'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
