-- =====================================================================
-- Teste da Central de Despacho (Fase 3 · 08 — etapa 6)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre a fila de OS sem responsável, a situação de cada técnico (que
-- sai de dados reais), a sugestão determinística, a atribuição, a
-- feature do plano e o isolamento entre empresas.
-- =====================================================================
do $$
declare
  v_pro uuid; v_start uuid;
  v_loja_a uuid; v_loja_b uuid; v_loja_c uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_owner_c uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_user uuid := gen_random_uuid();
  v_t_livre uuid; v_t_ocupado uuid; v_t_ausente uuid; v_t_fora uuid; v_t_sem_login uuid; v_t_inativo uuid;
  v_cli uuid; v_st uuid; v_st_fim uuid;
  v_tipo uuid; v_esp uuid;
  v_os_sem uuid; v_os_com uuid; v_os_fim uuid;
  v_agora timestamptz := date_trunc('minute', now());
  v_json jsonb; v_item jsonb; v_n int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_pro from public.planos where nome = 'Pro';
  select id into v_start from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_owner_c, v_atend_a, v_tec_user]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.lojas (nome) values ('TESTE Empresa C') returning id into v_loja_c;
  insert into public.assinaturas (loja_id, plano_id, status) values
    (v_loja_a, v_pro, 'active'), (v_loja_b, v_pro, 'active'), (v_loja_c, v_start, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_owner_c, v_loja_c, 'Owner C', 'oc@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_user, v_loja_a, 'Tecnico A', 'tc@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'attendant' and u.id = v_atend_a;
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id = v_tec_user;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.especialidades (loja_id, nome) values (v_loja_a, 'CFTV') returning id into v_esp;
  insert into public.tipos_servico (loja_id, nome) values (v_loja_a, 'Instalação CFTV') returning id into v_tipo;
  insert into public.tipo_servico_especialidades (loja_id, tipo_servico_id, especialidade_id)
    values (v_loja_a, v_tipo, v_esp);

  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values
    (v_loja_a, 'Ana', 'Livre', v_tec_user) returning id into v_t_livre;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Bruno', 'Ocupado') returning id into v_t_ocupado;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Carla', 'Ausente') returning id into v_t_ausente;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Diego', 'Fora') returning id into v_t_fora;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Eva', 'SemLogin') returning id into v_t_sem_login;
  insert into public.tecnicos (loja_id, nome) values (v_loja_a, 'Inativo') returning id into v_t_inativo;
  update public.tecnicos set ativo = false where id = v_t_inativo;
  insert into public.tecnico_especialidades (loja_id, tecnico_id, especialidade_id) values
    (v_loja_a, v_t_livre, v_esp), (v_loja_a, v_t_ocupado, v_esp);

  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;
  -- criado_em é imutável depois do INSERT: a espera de 3 horas entra já na criação
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tipo_servico_id, sla_horas, criado_em)
    values (v_loja_a, v_cli, v_st, 'Instalar 8 câmeras', v_tipo, 4, v_agora - interval '3 hours') returning id into v_os_sem;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tecnico_id)
    values (v_loja_a, v_cli, v_st, 'Já atribuída', v_t_livre) returning id into v_os_com;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Encerrada') returning id into v_os_fim;
  update public.ordens_servico set status_id = v_st_fim where id = v_os_fim;

  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os_com, v_t_ocupado, v_agora - interval '30 minutes', v_agora + interval '30 minutes');
  insert into public.tecnico_indisponibilidade (loja_id, tecnico_id, motivo, inicio_em, fim_em)
    values (v_loja_a, v_t_ausente, 'atestado', v_agora - interval '1 day', v_agora + interval '1 day');
  insert into public.tecnico_jornada (loja_id, tecnico_id, dia_semana, inicio, fim)
    values (v_loja_a, v_t_fora, (extract(dow from (v_agora at time zone 'America/Sao_Paulo'))::int + 3) % 7, '08:00', '18:00');
  -- Diego precisa de login para a jornada decidir a situação (sem login seria offline)
  update public.tecnicos set usuario_id = v_atend_a where id = v_t_fora;

  -- ---------------- painel ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.painel_despacho(null, 'America/Sao_Paulo');
  execute 'reset role';
  select e into v_item from jsonb_array_elements(v_json->'nao_atribuidas') e where e->>'os_id' = v_os_sem::text;
  if jsonb_array_length(v_json->'nao_atribuidas') = 1
     and v_item->>'cliente' = 'Cliente A'
     and v_item->'tipo_servico'->>'nome' = 'Instalação CFTV'
     and (v_item->>'aguardando_minutos')::int between 175 and 185
     and v_item->>'sla' is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS sem responsável na fila, com cliente, tipo, SLA e tempo de espera';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA fila de não atribuídas: %s', v_json->'nao_atribuidas'); end if;

  if (select count(*) from jsonb_array_elements(v_json->'tecnicos') t
      where (t->>'id' = v_t_livre::text and t->>'situacao' = 'disponivel')
         or (t->>'id' = v_t_ocupado::text and t->>'situacao' = 'ocupado')
         or (t->>'id' = v_t_ausente::text and t->>'situacao' = 'ausente')
         or (t->>'id' = v_t_fora::text and t->>'situacao' = 'fora_jornada')
         or (t->>'id' = v_t_sem_login::text and t->>'situacao' = 'offline')) = 5
     and jsonb_array_length(v_json->'tecnicos') = 5 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   situação de cada técnico vem de agenda, ausência, jornada e login';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA situações: %s',
    (select jsonb_agg(jsonb_build_object('n', t->>'nome', 's', t->>'situacao')) from jsonb_array_elements(v_json->'tecnicos') t)); end if;

  select t into v_item from jsonb_array_elements(v_json->'tecnicos') t where t->>'id' = v_t_ocupado::text;
  if (v_item->>'atendimentos_dia')::int = 1 and (v_item->>'minutos_dia')::int = 60
     and jsonb_array_length(v_item->'agenda') = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   carga do dia por técnico (atendimentos, minutos e agenda)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA carga do técnico: %s', v_item); end if;

  select t into v_item from jsonb_array_elements(v_json->'tecnicos') t where t->>'id' = v_t_livre::text;
  if (v_item->>'os_abertas')::int = 1 and v_item->'especialidades' @> '["CFTV"]'::jsonb then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico mostra especialidades e OS em aberto';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA dados do técnico: %s', v_item); end if;

  -- ---------------- sugestão ----------------
  execute 'set local role authenticated';
  v_json := public.sugerir_tecnicos(v_os_sem, v_agora + interval '2 hours', v_agora + interval '3 hours');
  execute 'reset role';
  if jsonb_array_length(v_json) = 5
     and v_json->0->>'tecnico_id' = v_t_livre::text
     and (v_json->0->>'especialidade_ok')::boolean and (v_json->0->>'livre')::boolean
     and (select (e->>'especialidade_ok')::boolean = false from jsonb_array_elements(v_json) e
          where e->>'tecnico_id' = v_t_sem_login::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sugestão ranqueia por disponibilidade, especialidade e carga';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA sugestão: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.sugerir_tecnicos(v_os_sem, v_agora - interval '15 minutes', v_agora + interval '15 minutes');
  execute 'reset role';
  if (select not (e->>'livre')::boolean from jsonb_array_elements(v_json) e where e->>'tecnico_id' = v_t_ocupado::text)
     and (select (e->>'livre')::boolean from jsonb_array_elements(v_json) e where e->>'tecnico_id' = v_t_livre::text)
     and (select (e->'motivos')::text like '%Agenda ocupada%' from jsonb_array_elements(v_json) e
          where e->>'tecnico_id' = v_t_ocupado::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico ocupado no horário cai no ranking e explica o motivo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA sugestão com conflito: %s', v_json); end if;

  -- ---------------- atribuir ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.atribuir_os(v_os_sem, v_t_livre);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente distribuiu OS sem dispatch.assign';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   distribuir exige dispatch.assign';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.painel_despacho(null, 'America/Sao_Paulo');
  execute 'reset role';
  if jsonb_array_length(v_json->'nao_atribuidas') = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente com dispatch.view abre a central';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA leitura da central pelo atendente'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.atribuir_os(v_os_sem, v_t_livre);
  v_json := public.painel_despacho(null, 'America/Sao_Paulo');
  execute 'reset role';
  if exists (select 1 from public.ordens_servico where id = v_os_sem and tecnico_id = v_t_livre)
     and exists (select 1 from public.log_eventos where acao = 'os_tecnico_atribuido' and detalhes->>'os_id' = v_os_sem::text)
     and jsonb_array_length(v_json->'nao_atribuidas') = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atribuir tira a OS da fila e registra na timeline';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atribuição'; end if;

  begin
    execute 'set local role authenticated';
    perform public.atribuir_os(v_os_sem, v_t_inativo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico inativo recebeu OS';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico inativo não recebe OS pela central';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.atribuir_os(v_os_fim, v_t_livre);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS finalizada foi atribuída';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS finalizada não entra no despacho';
  end;
  execute 'reset role';

  -- ---------------- feature do plano ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_c, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.painel_despacho(null, 'America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA plano Start abriu a central';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   plano sem a feature dispatch não abre a central';
  end;
  execute 'reset role';

  -- ---------------- tenant ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.painel_despacho(null, 'America/Sao_Paulo');
  select count(*) into v_n from public.tipo_servico_especialidades where loja_id = v_loja_a;
  execute 'reset role';
  if jsonb_array_length(v_json->'nao_atribuidas') = 0 and jsonb_array_length(v_json->'tecnicos') = 0 and v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não enxerga fila, técnicos nem vínculos de A';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA isolamento da central'; end if;

  begin
    execute 'set local role authenticated';
    perform public.atribuir_os(v_os_com, v_t_livre);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B atribuiu OS de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não distribui OS de A';
  end;
  execute 'reset role';

  -- ---------------- vínculo tipo × especialidade ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.tipo_servico_especialidades (loja_id, tipo_servico_id, especialidade_id)
      values (v_loja_a, v_tipo, v_esp);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente vinculou especialidade ao tipo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   vincular especialidade ao tipo exige settings.manage';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.painel_despacho(null, 'America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo abriu a central';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa a central';
  end;
  execute 'reset role';

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.tipo_servico_especialidades where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove os vínculos de especialidade';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA vínculos restaram'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
