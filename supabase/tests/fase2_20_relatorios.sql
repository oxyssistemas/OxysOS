-- =====================================================================
-- Teste dos relatórios operacionais (Fase 2 · 20)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- As OS são criadas com datas controladas pelo servidor (sem JWT), como
-- numa importação: criado_em é imutável e concluido_em só muda com a
-- troca de status (GUC oxys.alterar_status_os).
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_rel_a uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_cargo_rel uuid;
  v_c1 uuid; v_c2 uuid; v_e1 uuid; v_e2 uuid; v_t1 uuid; v_t2 uuid; v_t_b uuid;
  v_st_ini uuid; v_st_fin uuid; v_st_canc uuid;
  v_tipo uuid;
  v_os1 uuid; v_os2 uuid; v_os3 uuid; v_os4 uuid; v_os5 uuid; v_os6 uuid;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  -- plano Pro: inclui equipamentos (assets), necessário para o corte de equipamentos
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_rel_a, v_atend_a]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_rel_a, v_loja_a, 'So Relatorios', 'rl@teste.invalid', 'funcionario'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and u.id = v_atend_a and c.chave = 'attendant';
  -- cargo que só enxerga relatórios (sem clientes nem equipamentos)
  insert into public.cargos (loja_id, nome, sistema) values (v_loja_a, 'Só relatórios', false) returning id into v_cargo_rel;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values (v_cargo_rel, 'reports.view');
  update public.usuarios set cargo_id = v_cargo_rel where id = v_rel_a;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Condomínio Solar') returning id into v_c1;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Padaria Central') returning id into v_c2;
  insert into public.equipamentos (loja_id, cliente_id, nome) values (v_loja_a, v_c1, 'DVR portaria') returning id into v_e1;
  insert into public.equipamentos (loja_id, cliente_id, nome) values (v_loja_a, v_c1, 'Câmera garagem') returning id into v_e2;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Carlos', 'Souza') returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Marina', 'Dias') returning id into v_t2;
  insert into public.tecnicos (loja_id, nome) values (v_loja_b, 'Técnico B') returning id into v_t_b;
  insert into public.tipos_servico (loja_id, nome) values (v_loja_a, 'Instalação') returning id into v_tipo;
  select id into v_st_ini from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_fin from public.status_os where loja_id = v_loja_a and chave = 'finalizada';
  select id into v_st_canc from public.status_os where loja_id = v_loja_a and chave = 'cancelada';

  -- OS 1 e 2: finalizadas com prazo (uma no prazo, outra com atraso)
  insert into public.ordens_servico (loja_id, cliente_id, equipamento_id, tecnico_id, tipo_servico_id, descricao, criado_em, status_id)
    values (v_loja_a, v_c1, v_e1, v_t1, v_tipo, 'OS 1', now() - interval '10 days', v_st_ini) returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, equipamento_id, tecnico_id, tipo_servico_id, descricao, criado_em, status_id)
    values (v_loja_a, v_c1, v_e1, v_t1, v_tipo, 'OS 2', now() - interval '9 days', v_st_ini) returning id into v_os2;
  -- OS 3: finalizada sem prazo e sem início registrado
  insert into public.ordens_servico (loja_id, cliente_id, equipamento_id, tecnico_id, descricao, criado_em, status_id)
    values (v_loja_a, v_c1, v_e2, v_t2, 'OS 3', now() - interval '5 days', v_st_ini) returning id into v_os3;
  -- OS 4: em aberto · OS 5: cancelada · OS 6: fora do período
  insert into public.ordens_servico (loja_id, cliente_id, tecnico_id, descricao, criado_em, status_id)
    values (v_loja_a, v_c2, v_t2, 'OS 4 aberta', now() - interval '3 days', v_st_ini) returning id into v_os4;
  insert into public.ordens_servico (loja_id, cliente_id, descricao, criado_em, status_id)
    values (v_loja_a, v_c2, 'OS 5 cancelada', now() - interval '3 days', v_st_ini) returning id into v_os5;
  insert into public.ordens_servico (loja_id, cliente_id, tecnico_id, descricao, criado_em, status_id)
    values (v_loja_a, v_c1, v_t1, 'OS 6 antiga', now() - interval '200 days', v_st_ini) returning id into v_os6;

  -- finalização pela função oficial (é ela que grava o histórico usado na série)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os1, v_st_fin);
  perform public.alterar_status_os(v_os2, v_st_fin);
  perform public.alterar_status_os(v_os3, v_st_fin);
  perform public.alterar_status_os(v_os5, v_st_canc, 'Cliente desistiu');
  execute 'reset role';

  -- datas de conclusão e prazo definidas pelo servidor, só nas OS desta empresa
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('oxys.alterar_status_os', 'on', true);
  update public.ordens_servico set concluido_em = now() - interval '8 days',
         iniciado_em = now() - interval '9 days', prazo_em = now() - interval '7 days' where id = v_os1;
  update public.ordens_servico set concluido_em = now() - interval '8 days',
         iniciado_em = now() - interval '9 days', prazo_em = now() - interval '9 days' + interval '2 hours' where id = v_os2;
  update public.ordens_servico set concluido_em = now() - interval '4 days' where id = v_os3;
  update public.ordens_servico set concluido_em = now() - interval '2 days' where id = v_os5;
  perform set_config('oxys.alterar_status_os', 'off', true);
  -- histórico com a data real da finalização (a série usa a troca de status)
  update public.os_historico h set criado_em = os.concluido_em
    from public.ordens_servico os
   where os.id = h.os_id and os.loja_id = v_loja_a
     and os.concluido_em is not null and h.status_anterior_id is not null;

  -- ---------------- números do período ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.relatorio_os(now() - interval '30 days', now() + interval '1 day');
  execute 'reset role';

  if (v_json->'resumo'->>'criadas')::int = 5 and (v_json->'resumo'->>'finalizadas')::int = 3
     and (v_json->'resumo'->>'canceladas')::int = 1 and (v_json->'resumo'->>'em_aberto')::int = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   resumo conta só as OS do período (criadas, finalizadas, canceladas, em aberto)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA resumo: %s', v_json->'resumo'); end if;

  if (v_json->'resumo'->>'tempo_medio_horas')::numeric = 32.0 and (v_json->'resumo'->>'amostra_tempo_total')::int = 3
     and v_json->'resumo'->>'tempo_execucao_medio_horas' is null and (v_json->'resumo'->>'amostra_tempo_execucao')::int = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tempo médio de atendimento (32 h); sem média de execução com amostra menor que 3';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA tempo médio: %s', v_json->'resumo'); end if;

  if (v_json->'resumo'->>'com_prazo')::int = 2 and (v_json->'resumo'->>'no_prazo')::int = 1
     and (v_json->'resumo'->>'com_atraso')::int = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   prazo: 1 no prazo e 1 com atraso (só OS com prazo definido)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA prazo: %s', v_json->'resumo'); end if;

  if (select sum((e->>'criadas')::int) from jsonb_array_elements(v_json->'os_por_periodo') e) = 5
     and (select sum((e->>'finalizadas')::int) from jsonb_array_elements(v_json->'os_por_periodo') e) = 3
     and v_json->'periodo'->>'granularidade' = 'dia' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   série diária soma as OS criadas e finalizadas do período';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA série: %s', v_json->'os_por_periodo'); end if;

  if v_json->'os_por_status' @> '[{"nome":"Finalizada","total":3}]'
     and v_json->'os_por_status' @> '[{"nome":"Cancelada","total":1}]'
     and v_json->'os_por_prioridade' @> '[{"nome":"Normal","total":5}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS por status e por prioridade';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA status/prioridade: %s / %s', v_json->'os_por_status', v_json->'os_por_prioridade'); end if;

  if v_json->'os_por_tecnico' @> '[{"nome":"Carlos Souza","total":2,"finalizadas":2}]'
     and v_json->'os_por_tecnico' @> '[{"nome":"Marina Dias","total":2,"finalizadas":1}]'
     and v_json->'os_por_tecnico' @> '[{"nome":"Sem técnico","total":1}]'
     and (select e->>'tempo_medio_horas' is null from jsonb_array_elements(v_json->'os_por_tecnico') e where e->>'nome' = 'Carlos Souza') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS por técnico (inclui "sem técnico") sem média com amostra pequena';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA por técnico: %s', v_json->'os_por_tecnico'); end if;

  if v_json->'clientes' @> '[{"nome":"Condomínio Solar","total":3,"finalizadas":3}]'
     and v_json->'clientes' @> '[{"nome":"Padaria Central","total":2}]'
     and v_json->'equipamentos' @> '[{"nome":"DVR portaria","total":2,"cliente":"Condomínio Solar"}]'
     and v_json->'equipamentos' @> '[{"nome":"Câmera garagem","total":1}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   clientes com mais OS e equipamentos com mais chamados';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA tops: %s / %s', v_json->'clientes', v_json->'equipamentos'); end if;

  -- ---------------- filtros e granularidade ----------------
  execute 'set local role authenticated';
  v_json := public.relatorio_os(now() - interval '30 days', now() + interval '1 day', 'America/Sao_Paulo', v_t1);
  execute 'reset role';
  if (v_json->'resumo'->>'criadas')::int = 2 and jsonb_array_length(v_json->'os_por_tecnico') = 1
     and v_json->'clientes' @> '[{"nome":"Condomínio Solar","total":2}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   filtro por técnico recorta todos os cortes do relatório';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA filtro técnico: %s', v_json->'resumo'); end if;

  execute 'set local role authenticated';
  v_json := public.relatorio_os(now() - interval '30 days', now() + interval '1 day', 'America/Sao_Paulo', null, v_tipo);
  execute 'reset role';
  if (v_json->'resumo'->>'criadas')::int = 2 and (v_json->'resumo'->>'finalizadas')::int = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   filtro por tipo de serviço';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA filtro tipo: %s', v_json->'resumo'); end if;

  execute 'set local role authenticated';
  v_json := public.relatorio_os(now() - interval '210 days', now() + interval '1 day');
  execute 'reset role';
  if (v_json->'resumo'->>'criadas')::int = 6 and v_json->'periodo'->>'granularidade' = 'mes' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período longo agrupa por mês e inclui a OS antiga';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA período longo: %s / %s', v_json->'resumo', v_json->'periodo'); end if;

  begin
    execute 'set local role authenticated';
    perform public.relatorio_os(now(), now() - interval '1 day');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período invertido aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período inválido → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.relatorio_os(now() - interval '2 years', now());
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA período maior que 1 ano aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   período acima de 1 ano → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.relatorio_os(now() - interval '30 days', now(), 'America/Sao_Paulo', v_t_b);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA filtro com técnico de outra empresa aceito';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   filtro com técnico de outra empresa → negado';
  end;
  execute 'reset role';

  -- ---------------- permissões e isolamento ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_rel_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.relatorio_os(now() - interval '30 days', now() + interval '1 day');
  execute 'reset role';
  if (v_json->'resumo'->>'criadas')::int = 5 and v_json->>'clientes' is null and v_json->>'equipamentos' is null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem acesso a clientes/equipamentos, o relatório omite essas listas';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA gating: %s / %s', v_json->'clientes', v_json->'equipamentos'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.relatorio_os(now() - interval '30 days', now());
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente sem reports.view abriu o relatório';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem reports.view → negado';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.relatorio_os(now() - interval '30 days', now() + interval '1 day');
  execute 'reset role';
  if (v_json->'resumo'->>'criadas')::int = 0 and jsonb_array_length(v_json->'clientes') = 0
     and jsonb_array_length(v_json->'os_por_tecnico') = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não vê nenhum número da empresa A';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento B: %s', v_json->'resumo'); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.relatorio_os(now() - interval '30 days', now());
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo abriu o relatório';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa relatórios';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
