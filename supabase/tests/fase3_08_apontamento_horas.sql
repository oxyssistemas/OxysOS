-- =====================================================================
-- Teste do apontamento de horas (Fase 3 · 14 — etapa 10)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre lançamento manual, correção, exclusão, as regras de intervalo,
-- a trava de tempo sobreposto, quem pode mexer (gestor × técnico ×
-- atendente), o isolamento entre empresas e a OS encerrada.
-- =====================================================================
do $$
declare
  v_pro uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_atd_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_tec_a2 uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_tec_b uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_tb uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid; v_st_fim uuid;
  v_os uuid; v_os_fim uuid; v_os_b uuid;
  v_ag uuid; v_ag_b uuid;
  v_base timestamptz := date_trunc('hour', now()) - interval '6 hours';
  v_ap1 uuid; v_ap2 uuid; v_ap_t2 uuid; v_ap_tec uuid;
  v_json jsonb; v_n int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_pro from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_atd_a, v_tec_a, v_tec_a2, v_owner_b, v_tec_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_pro, 'active'), (v_loja_b, v_pro, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_atd_a, v_loja_a, 'Atendente', 'at@teste.invalid', 'funcionario'),
    (v_tec_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_tec_a2, v_loja_a, 'Marina', 'ma@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_tec_b, v_loja_b, 'Téc B', 'tb@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'attendant' and u.id = v_atd_a;
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id in (v_tec_a, v_tec_a2);
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_b and c.chave = 'technician' and u.id = v_tec_b;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_tec_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Marina', 'Reis', v_tec_a2) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, usuario_id) values (v_loja_b, 'Téc B', v_tec_b) returning id into v_tb;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;

  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Instalação') returning id into v_os;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Já encerrada') returning id into v_os_fim;
  update public.ordens_servico set status_id = v_st_fim where id = v_os_fim;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os, v_t1, v_base, v_base + interval '2 hours') returning id into v_ag;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_b, v_os_b, v_tb, v_base, v_base + interval '2 hours') returning id into v_ag_b;

  -- ---------------- estado inicial: sem horas ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.horas_os(v_os);
  execute 'reset role';
  if (v_json->'totais'->>'trabalhado_min')::int = 0
     and jsonb_array_length(v_json->'apontamentos') = 0
     and jsonb_array_length(v_json->'por_tecnico') = 0
     and (v_json->>'pode_gerenciar')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS sem horas volta zerada (empty state) e o dono pode gerenciar';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA estado inicial: %s', v_json); end if;

  -- ---------------- lançamento manual ----------------
  execute 'set local role authenticated';
  v_ap1 := public.lancar_apontamento(v_os, v_t1, 'atendimento', v_base, v_base + interval '90 minutes', null, 'Instalação do painel');
  execute 'reset role';
  if exists (select 1 from public.os_apontamentos
              where id = v_ap1 and origem = 'manual' and duracao_min = 90 and agendamento_id = v_ag
                and observacao = 'Instalação do painel')
     and exists (select 1 from public.log_eventos
                  where acao = 'os_hora_lancada' and detalhes->>'apontamento_id' = v_ap1::text
                    and (detalhes->>'duracao_min')::int = 90) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   lançamento manual grava duração, origem, atendimento ligado e evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA lançamento manual'; end if;

  execute 'set local role authenticated';
  v_json := public.horas_os(v_os);
  execute 'reset role';
  if (v_json->'totais'->>'atendimento_min')::int = 90
     and (v_json->'totais'->>'trabalhado_min')::int = 90
     and (v_json->'totais'->>'pausa_min')::int = 0
     and jsonb_array_length(v_json->'por_tecnico') = 1
     and (v_json->'por_tecnico'->0->>'nome') = 'Carlos Dias'
     and (v_json->'apontamentos'->0->>'aberto')::boolean is false then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   totais e rateio por técnico somam o que foi lançado';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA totais: %s', v_json->'totais'); end if;

  -- ---------------- regras do intervalo ----------------
  execute 'set local role authenticated';
  begin
    perform public.lancar_apontamento(v_os, v_t1, 'atendimento', v_base + interval '30 minutes', v_base + interval '60 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou tempo sobreposto do mesmo técnico';
  exception when exclusion_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o mesmo técnico não aponta dois tempos no mesmo intervalo';
  end;

  begin
    perform public.lancar_apontamento(v_os, v_t1, 'atendimento', v_base + interval '3 hours', v_base + interval '2 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou fim antes do início';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   fim antes do início é recusado';
  end;

  begin
    perform public.lancar_apontamento(v_os, v_t1, 'atendimento', now() + interval '1 hour', now() + interval '2 hours');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou hora no futuro';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   hora no futuro é recusada';
  end;

  begin
    perform public.lancar_apontamento(v_os, v_t1, 'atendimento', now() - interval '30 hours', now() - interval '1 minute');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou apontamento de mais de 24 horas';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   apontamento maior que 24 horas é recusado';
  end;

  begin
    perform public.lancar_apontamento(v_os, v_t1, 'pausa', v_base + interval '3 hours', v_base + interval '3 hours 10 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA pausa sem motivo';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   pausa exige motivo';
  end;

  begin
    perform public.lancar_apontamento(v_os, v_t1, 'deslocamento', v_base + interval '3 hours', v_base + interval '3 hours 10 minutes', 'almoco');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA motivo em apontamento que não é pausa';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   motivo só vale para pausa';
  end;

  -- mesmo intervalo, outro técnico: pode
  v_ap_t2 := public.lancar_apontamento(v_os, v_t2, 'atendimento', v_base, v_base + interval '90 minutes');
  execute 'reset role';
  if v_ap_t2 is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   dois técnicos podem trabalhar juntos no mesmo horário';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dois técnicos no mesmo horário'; end if;

  -- a trava também existe no banco, fora das funções
  perform set_config('request.jwt.claims', '{}', true);
  begin
    insert into public.os_apontamentos (loja_id, os_id, tecnico_id, tipo, inicio_em, fim_em)
      values (v_loja_a, v_os, v_t1, 'atendimento', v_base + interval '10 minutes', v_base + interval '20 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA insert direto criou tempo sobreposto';
  exception when exclusion_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a trava de sobreposição está no banco, não só na função';
  end;

  -- ---------------- correção ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.ajustar_apontamento(v_ap1, v_base, v_base + interval '60 minutes', null, 'Corrigido na conferência');
  v_ap2 := public.lancar_apontamento(v_os, v_t1, 'deslocamento', v_base + interval '2 hours', v_base + interval '2 hours 30 minutes');
  execute 'reset role';
  if (v_json->>'duracao_min')::int = 60
     and exists (select 1 from public.os_apontamentos
                  where id = v_ap1 and duracao_min = 60 and atualizado_em is not null and atualizado_por = v_owner_a)
     and exists (select 1 from public.log_eventos where acao = 'os_hora_ajustada' and detalhes->>'apontamento_id' = v_ap1::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   correção recalcula a duração, guarda quem mexeu e registra o evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA correção do apontamento'; end if;

  execute 'set local role authenticated';
  begin
    perform public.ajustar_apontamento(v_ap1, v_base + interval '2 hours 15 minutes', v_base + interval '2 hours 45 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA correção invadiu outro apontamento';
  exception when exclusion_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   correção que invade outro tempo do técnico é recusada';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.horas_os(v_os);
  execute 'reset role';
  if (v_json->'totais'->>'atendimento_min')::int = 150
     and (v_json->'totais'->>'deslocamento_min')::int = 30
     and (v_json->'totais'->>'trabalhado_min')::int = 180
     and jsonb_array_length(v_json->'por_tecnico') = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   totais separam deslocamento de atendimento e somam os dois técnicos';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA totais após correção: %s', v_json->'totais'); end if;

  -- ---------------- quem pode mexer ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atd_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.horas_os(v_os);
  begin
    perform public.lancar_apontamento(v_os, v_t1, 'atendimento', v_base + interval '4 hours', v_base + interval '4 hours 30 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente lançou horas';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem não tem service_orders.manage_time não lança horas';
  end;
  execute 'reset role';
  if not (v_json->>'pode_gerenciar')::boolean and jsonb_array_length(v_json->'apontamentos') = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente enxerga as horas mas sem o botão de gerenciar';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA leitura do atendente'; end if;

  -- o técnico corrige o que é dele
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.ajustar_apontamento(v_ap1, v_base, v_base + interval '75 minutes');
  execute 'reset role';
  if exists (select 1 from public.os_apontamentos where id = v_ap1 and duracao_min = 75 and atualizado_por = v_tec_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico corrige o próprio apontamento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico corrigindo o próprio apontamento'; end if;

  execute 'set local role authenticated';
  begin
    perform public.ajustar_apontamento(v_ap_t2, v_base, v_base + interval '30 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico mexeu na hora de outro técnico';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico não mexe na hora de outro técnico';
  end;

  -- lançamento pelo portal do técnico
  v_ap_tec := public.lancar_apontamento_tecnico(v_ag, 'atendimento', v_base + interval '4 hours', v_base + interval '4 hours 40 minutes',
                                                null, 'Esqueci de marcar');
  v_json := public.horas_atendimento(v_ag);
  execute 'reset role';
  if exists (select 1 from public.os_apontamentos
              where id = v_ap_tec and tecnico_id = v_t1 and agendamento_id = v_ag and origem = 'manual' and duracao_min = 40)
     and (v_json->>'pode_ajustar')::boolean
     and (v_json->'totais'->>'trabalhado_min')::int = 145 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico lança o tempo esquecido no próprio atendimento';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA lançamento do técnico: %s', v_json->'totais'); end if;

  -- ---------------- fluxo de campo continua funcionando ----------------
  execute 'set local role authenticated';
  perform public.iniciar_deslocamento(v_ag);
  perform public.registrar_chegada(v_ag);
  execute 'reset role';
  if exists (select 1 from public.os_apontamentos
              where agendamento_id = v_ag and tecnico_id = v_t1 and tipo = 'deslocamento'
                and origem = 'automatico' and fim_em is not null and duracao_min is not null)
     and not exists (select 1 from public.os_apontamentos where tecnico_id = v_t1 and fim_em is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o relógio de campo convive com os lançamentos manuais';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA relógio de campo após lançamentos manuais'; end if;

  -- ---------------- outra empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.horas_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico da empresa B leu as horas da empresa A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico da empresa B não lê as horas da empresa A';
  end;

  begin
    perform public.ajustar_apontamento(v_ap1, v_base, v_base + interval '30 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico da empresa B corrigiu hora da empresa A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico da empresa B não corrige hora da empresa A';
  end;

  begin
    perform public.horas_atendimento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico da empresa B abriu o atendimento da empresa A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico da empresa B não abre o atendimento da empresa A';
  end;

  select count(*) into v_n from public.os_apontamentos;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a RLS esconde os apontamentos da outra empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa B enxerga %s apontamentos', v_n); end if;

  -- ---------------- anônimo ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.horas_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu as horas';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê nem lança horas';
  end;
  execute 'reset role';

  -- ---------------- OS encerrada ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.lancar_apontamento(v_os_fim, v_t1, 'atendimento', v_base + interval '5 hours', v_base + interval '5 hours 20 minutes');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA lançou hora em OS encerrada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada não recebe hora nova';
  end;
  execute 'reset role';

  -- ---------------- exclusão ----------------
  execute 'set local role authenticated';
  perform public.excluir_apontamento(v_ap2);
  execute 'reset role';
  if not exists (select 1 from public.os_apontamentos where id = v_ap2)
     and exists (select 1 from public.log_eventos where acao = 'os_hora_removida' and detalhes->>'apontamento_id' = v_ap2::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir apontamento apaga o trecho e registra o evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exclusão do apontamento'; end if;

  -- ---------------- empresa suspensa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  update public.lojas set status = 'suspensa' where id = v_loja_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.horas_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa suspensa consultou horas';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa não consulta nem lança horas';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update public.lojas set status = 'ativa' where id = v_loja_a;

  -- ---------------- a timeline conta a história ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.timeline_os(v_os);
  execute 'reset role';
  select count(*) into v_n from jsonb_array_elements(v_json) e
   where e->>'acao' in ('os_hora_lancada', 'os_hora_ajustada', 'os_hora_removida')
     and e->'dados'->>'tipo_apontamento' is not null;
  if v_n >= 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   lançar, corrigir e remover horas aparece na linha do tempo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA timeline trouxe %s eventos de hora', v_n); end if;

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.lojas where id = v_loja_a;
  if not exists (select 1 from public.os_apontamentos where loja_id = v_loja_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa leva junto os apontamentos';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA apontamentos restaram após excluir a empresa'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
