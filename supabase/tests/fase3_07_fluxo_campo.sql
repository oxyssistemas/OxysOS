-- =====================================================================
-- Teste da máquina de estados do campo (Fase 3 · 11 a 13 — etapa 9)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre deslocamento → chegada → atendimento → pausa → retomada, as
-- transições inválidas, as permissões por passo, o relógio único por
-- técnico e o reflexo na central de despacho.
-- =====================================================================
do $$
declare
  v_pro uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_tec_a2 uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_tec_b uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_tb uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid;
  v_os uuid; v_os2 uuid; v_os_b uuid;
  v_ag uuid; v_ag_outro uuid; v_ag_b uuid;
  v_hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date::timestamp) at time zone 'America/Sao_Paulo';
  v_json jsonb; v_n int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_pro from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_tec_a, v_tec_a2, v_owner_b, v_tec_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_pro, 'active'), (v_loja_b, v_pro, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_tec_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_tec_a2, v_loja_a, 'Marina', 'ma@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_tec_b, v_loja_b, 'Téc B', 'tb@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id in (v_tec_a, v_tec_a2);
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_b and c.chave = 'technician' and u.id = v_tec_b;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.tecnicos (loja_id, nome, usuario_id) values (v_loja_a, 'Carlos', v_tec_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, usuario_id) values (v_loja_a, 'Marina', v_tec_a2) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, usuario_id) values (v_loja_b, 'Téc B', v_tec_b) returning id into v_tb;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;

  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Instalação') returning id into v_os;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Da Marina') returning id into v_os2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os, v_t1, v_hoje + interval '9 hours', v_hoje + interval '11 hours') returning id into v_ag;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os2, v_t2, v_hoje + interval '9 hours', v_hoje + interval '10 hours') returning id into v_ag_outro;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_b, v_os_b, v_tb, v_hoje + interval '9 hours', v_hoje + interval '10 hours') returning id into v_ag_b;

  -- ---------------- transições inválidas antes de começar ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.pausar_atendimento(v_ag, 'almoco');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA pausou atendimento que não começou';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   não dá para pausar um atendimento que não começou';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.retomar_atendimento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA retomou sem estar pausado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   não dá para retomar sem estar pausado';
  end;
  execute 'reset role';

  -- ---------------- deslocamento ----------------
  execute 'set local role authenticated';
  v_json := public.iniciar_deslocamento(v_ag);
  execute 'reset role';
  if v_json->>'estado_campo' = 'em_deslocamento'
     and exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'em_deslocamento' and status = 'em_andamento')
     and exists (select 1 from public.os_apontamentos where agendamento_id = v_ag and tipo = 'deslocamento' and fim_em is null)
     and exists (select 1 from public.log_eventos where acao = 'os_deslocamento_iniciado' and detalhes->>'agendamento_id' = v_ag::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   iniciar deslocamento muda o estado, abre o relógio e entra na timeline';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA deslocamento: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    perform public.iniciar_deslocamento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA iniciou deslocamento duas vezes';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   deslocamento não recomeça sozinho';
  end;
  execute 'reset role';

  -- ---------------- chegada ----------------
  execute 'set local role authenticated';
  perform public.registrar_chegada(v_ag);
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'no_local')
     and exists (select 1 from public.os_apontamentos where agendamento_id = v_ag and tipo = 'deslocamento' and fim_em is not null)
     and not exists (select 1 from public.os_apontamentos where tecnico_id = v_t1 and fim_em is null)
     and exists (select 1 from public.log_eventos where acao = 'os_tecnico_chegou' and detalhes->>'agendamento_id' = v_ag::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   chegada fecha o deslocamento e não deixa relógio correndo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA chegada'; end if;

  -- ---------------- atendimento ----------------
  execute 'set local role authenticated';
  perform public.iniciar_atendimento_campo(v_ag);
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'em_atendimento')
     and exists (select 1 from public.os_apontamentos where agendamento_id = v_ag and tipo = 'atendimento' and fim_em is null)
     and exists (select 1 from public.log_eventos where acao = 'os_atendimento_iniciado' and detalhes->>'agendamento_id' = v_ag::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento iniciado abre o relógio de trabalho';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA iniciar atendimento'; end if;

  -- ---------------- pausa ----------------
  begin
    execute 'set local role authenticated';
    perform public.registrar_passo_campo(v_ag, 'pausa', null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA função interna chamada pelo cliente';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o passo genérico não é exposto ao cliente';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.pausar_atendimento(v_ag, 'aguardando_peca', 'Faltou conector');
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'pausado')
     and exists (select 1 from public.os_apontamentos where agendamento_id = v_ag and tipo = 'pausa'
                  and motivo = 'aguardando_peca' and observacao = 'Faltou conector' and fim_em is null)
     and (select count(*) from public.os_apontamentos where agendamento_id = v_ag and tipo = 'atendimento' and fim_em is not null) = 1
     and exists (select 1 from public.log_eventos where acao = 'os_atendimento_pausado' and detalhes->>'motivo' = 'aguardando_peca') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   pausa guarda motivo, fecha o trabalho e abre o relógio de pausa';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA pausa'; end if;

  -- ---------------- retomada ----------------
  execute 'set local role authenticated';
  perform public.retomar_atendimento(v_ag);
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'em_atendimento')
     and (select count(*) from public.os_apontamentos where agendamento_id = v_ag and tipo = 'atendimento') = 2
     and not exists (select 1 from public.os_apontamentos where agendamento_id = v_ag and tipo = 'pausa' and fim_em is null)
     and exists (select 1 from public.log_eventos where acao = 'os_atendimento_retomado') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   retomar fecha a pausa e abre um novo trecho de trabalho';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA retomada'; end if;

  select count(*) into v_n from public.os_apontamentos where tecnico_id = v_t1 and fim_em is null;
  if v_n = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico tem no máximo um relógio correndo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA %s relógios abertos', v_n); end if;

  -- ---------------- estado no detalhe e no despacho ----------------
  execute 'set local role authenticated';
  v_json := public.atendimento_tecnico(v_ag);
  execute 'reset role';
  if v_json->'agendamento'->>'estado_campo' = 'em_atendimento'
     and v_json->'apontamento_aberto'->>'tipo' = 'atendimento'
     and (v_json->'tempos'->>'atendimento_min') is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o detalhe mostra o estado, o relógio aberto e os tempos';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA detalhe com estado: %s', v_json); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.situacao_tecnico_em(v_t1, now(), 'America/Sao_Paulo') = 'em_atendimento' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a central vê o técnico em atendimento';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA situação na central: %s',
    public.situacao_tecnico_em(v_t1, now(), 'America/Sao_Paulo')); end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.pausar_atendimento(v_ag, 'almoco');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.situacao_tecnico_em(v_t1, now(), 'America/Sao_Paulo') = 'pausa' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a central vê a pausa do técnico';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA pausa na central'; end if;
  execute 'reset role';

  -- ---------------- permissão do cargo ----------------
  execute 'set local role authenticated';
  perform public.salvar_cargo(
    (select id from public.cargos where loja_id = v_loja_a and chave = 'technician'),
    (select versao from public.cargos where loja_id = v_loja_a and chave = 'technician'),
    jsonb_build_object('nome', 'Técnico'),
    array['dashboard.view', 'service_orders.view', 'technician.jobs.view', 'technician.jobs.start']);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.retomar_atendimento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA retomou sem technician.jobs.pause';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   pausar e retomar exigem technician.jobs.pause';
  end;
  execute 'reset role';

  -- ---------------- atendimento dos outros ----------------
  begin
    execute 'set local role authenticated';
    perform public.iniciar_deslocamento(v_ag_outro);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA mexeu no atendimento de outro técnico';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento de outro técnico → não encontrado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.iniciar_deslocamento(v_ag_b);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA mexeu no atendimento de outra empresa';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento de outra empresa → não encontrado';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.iniciar_deslocamento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA proprietário registrou passo de campo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem não é técnico não registra passo de campo';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.iniciar_deslocamento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo registrou passo de campo';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não registra passo de campo';
  end;
  execute 'reset role';

  -- ---------------- travas do banco ----------------
  perform set_config('request.jwt.claims', '{}', true);
  begin
    insert into public.os_apontamentos (loja_id, os_id, agendamento_id, tecnico_id, tipo)
      values (v_loja_a, v_os, v_ag, v_t1, 'atendimento');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dois relógios abertos para o mesmo técnico';
  exception when unique_violation or exclusion_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o banco recusa dois apontamentos abertos do mesmo técnico';
  end;

  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.os_apontamentos where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove os apontamentos';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA apontamentos restaram'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
