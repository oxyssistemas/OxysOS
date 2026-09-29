-- =====================================================================
-- Teste da agenda do técnico (Fase 3 · 10 — etapa 8)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Horários ancorados na meia-noite local: o teste vale a qualquer hora.
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
  v_cli uuid; v_cli_b uuid; v_end uuid; v_equip uuid;
  v_st uuid; v_st_b uuid; v_st_fim uuid; v_tipo uuid; v_eq uuid;
  v_os_hoje uuid; v_os_equipe uuid; v_os_futura uuid; v_os_feita uuid; v_os_outro uuid; v_os_b uuid;
  v_ag_hoje uuid; v_ag_equipe uuid; v_ag_futura uuid; v_ag_feita uuid; v_ag_outro uuid; v_ag_b uuid;
  v_hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date::timestamp) at time zone 'America/Sao_Paulo';
  v_json jsonb; v_item jsonb;
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
    (v_tec_a, v_loja_a, 'Carlos Souza', 'ca@teste.invalid', 'funcionario'),
    (v_tec_a2, v_loja_a, 'Marina Dias', 'ma@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_tec_b, v_loja_b, 'Téc B', 'tb@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id in (v_tec_a, v_tec_a2);
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_b and c.chave = 'technician' and u.id = v_tec_b;

  insert into public.clientes (loja_id, nome, telefone) values (v_loja_a, 'Mercado Bom Preço', '11988887777')
    returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.cliente_enderecos (loja_id, cliente_id, rotulo, logradouro, numero, bairro, cidade, estado, cep)
    values (v_loja_a, v_cli, 'Loja centro', 'Rua das Flores', '120', 'Centro', 'São Paulo', 'SP', '01001000')
    returning id into v_end;
  insert into public.equipamentos (loja_id, cliente_id, nome, marca, modelo, numero_serie)
    values (v_loja_a, v_cli, 'DVR 16 canais', 'Intelbras', 'MHDX 3116', 'SN-123') returning id into v_equip;
  insert into public.tipos_servico (loja_id, nome) values (v_loja_a, 'Instalação CFTV') returning id into v_tipo;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values
    (v_loja_a, 'Carlos', 'Souza', v_tec_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values
    (v_loja_a, 'Marina', 'Dias', v_tec_a2) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, usuario_id) values (v_loja_b, 'Téc B', v_tec_b) returning id into v_tb;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_eq := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe CFTV'),
    jsonb_build_array(jsonb_build_object('tecnico_id', v_t1)));
  execute 'reset role';

  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tipo_servico_id,
                                     equipamento_id, cliente_endereco_id, local_atendimento, titulo)
    values (v_loja_a, v_cli, v_st, 'DVR sem gravar', v_tipo, v_equip, v_end, 'externo', 'Troca de DVR')
    returning id into v_os_hoje;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Da equipe hoje') returning id into v_os_equipe;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Semana que vem') returning id into v_os_futura;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Já concluída') returning id into v_os_feita;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Da Marina') returning id into v_os_outro;
  -- a OS da empresa B precisa ser criada por um usuário da empresa B (FK composta do criador)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em, observacao) values
    (v_loja_a, v_os_hoje, v_t1, v_hoje + interval '9 hours', v_hoje + interval '11 hours', 'Levar escada')
    returning id into v_ag_hoje;
  insert into public.agendamentos (loja_id, os_id, equipe_id, inicio_em, fim_em) values
    (v_loja_a, v_os_equipe, v_eq, v_hoje + interval '15 hours', v_hoje + interval '16 hours')
    returning id into v_ag_equipe;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em, status) values
    (v_loja_a, v_os_futura, v_t1, v_hoje + interval '4 days 9 hours', v_hoje + interval '4 days 10 hours', 'confirmado')
    returning id into v_ag_futura;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em, status) values
    (v_loja_a, v_os_feita, v_t1, v_hoje - interval '2 days', v_hoje - interval '2 days' + interval '1 hour', 'concluido')
    returning id into v_ag_feita;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os_outro, v_t2, v_hoje + interval '10 hours', v_hoje + interval '11 hours')
    returning id into v_ag_outro;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_b, v_os_b, v_tb, v_hoje + interval '9 hours', v_hoje + interval '10 hours')
    returning id into v_ag_b;

  -- ---------------- hoje ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.agenda_tecnico('hoje', 'America/Sao_Paulo');
  execute 'reset role';
  select e into v_item from jsonb_array_elements(v_json) e where e->>'agendamento_id' = v_ag_hoje::text;
  if jsonb_array_length(v_json) = 2
     and v_json->0->>'agendamento_id' = v_ag_hoje::text
     and v_item->>'cliente' = 'Mercado Bom Preço'
     and v_item->'endereco'->>'resumo' = 'Rua das Flores, 120, Centro, São Paulo/SP'
     and v_item->>'tipo_servico' = 'Instalação CFTV'
     and v_item->'prioridade'->>'nome' is not null
     and v_item->'status_os'->>'cor' is not null
     and (select (e->>'da_equipe')::boolean from jsonb_array_elements(v_json) e
          where e->>'agendamento_id' = v_ag_equipe::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   hoje traz horário, cliente, endereço, serviço, prioridade e status';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA agenda de hoje: %s', v_json); end if;

  -- ---------------- próximos e concluídos ----------------
  execute 'set local role authenticated';
  v_json := public.agenda_tecnico('proximos', 'America/Sao_Paulo');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'agendamento_id' = v_ag_futura::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   próximos traz só o que ainda vai acontecer';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA próximos: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.agenda_tecnico('concluidos', 'America/Sao_Paulo');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'agendamento_id' = v_ag_feita::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   concluídos traz o histórico recente';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA concluídos: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    perform public.agenda_tecnico('tudo', 'America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA filtro inválido aceito';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   filtro inválido → negado';
  end;
  execute 'reset role';

  -- ---------------- detalhe ----------------
  execute 'set local role authenticated';
  v_json := public.atendimento_tecnico(v_ag_hoje);
  execute 'reset role';
  if v_json->'os'->>'problema' = 'DVR sem gravar'
     and v_json->'os'->>'numero' is not null
     and v_json->'cliente'->>'telefone' = '11988887777'
     and v_json->'endereco'->>'cep' = '01001000'
     and v_json->'equipamento'->>'numero_serie' = 'SN-123'
     and v_json->'agendamento'->>'observacao' = 'Levar escada'
     and not (v_json::text like '%valor%') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   detalhe traz OS, contato, endereço e equipamento — e nenhum valor';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA detalhe: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.atendimento_tecnico(v_ag_equipe);
  execute 'reset role';
  if v_json->'agendamento'->'equipe'->>'nome' = 'Equipe CFTV' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento da equipe abre para o membro da equipe';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atendimento de equipe: %s', v_json); end if;

  -- ---------------- atendimento em foco ----------------
  execute 'set local role authenticated';
  v_json := public.atendimento_atual_tecnico('America/Sao_Paulo');
  execute 'reset role';
  if v_json->'agendamento'->>'id' is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   portal aponta o atendimento em foco';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendimento em foco'; end if;

  -- ---------------- não é meu ----------------
  begin
    execute 'set local role authenticated';
    perform public.atendimento_tecnico(v_ag_outro);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico abriu atendimento de outro técnico';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento de outro técnico → não encontrado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.atendimento_tecnico(v_ag_b);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico abriu atendimento de outra empresa';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento de outra empresa → não encontrado';
  end;
  execute 'reset role';

  -- ---------------- outro técnico da mesma empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.agenda_tecnico('hoje', 'America/Sao_Paulo');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'agendamento_id' = v_ag_outro::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a agenda de cada técnico é só dele (e das equipes dele)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA agenda da Marina: %s', v_json); end if;

  -- ---------------- empresa B ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.agenda_tecnico('hoje', 'America/Sao_Paulo');
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'agendamento_id' = v_ag_b::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico da empresa B só vê a agenda da empresa B';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA agenda da empresa B: %s', v_json); end if;

  -- ---------------- proprietário não usa o portal de campo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.agenda_tecnico('hoje', 'America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA proprietário leu a agenda do portal de campo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem não é técnico não lê a agenda do portal';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.agenda_tecnico('hoje', 'America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu a agenda';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê a agenda do técnico';
  end;
  execute 'reset role';

  if not has_function_privilege('authenticated', 'public.endereco_atendimento(uuid)', 'execute')
     and not has_function_privilege('anon', 'public.atendimento_tecnico(uuid)', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   função interna de endereço fora da API';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA execute das funções'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
