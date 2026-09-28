-- =====================================================================
-- Teste das notificações internas (Fase 3 · 30 — etapa 17)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre quem recebe cada aviso (gestores × técnico/equipe, nunca quem fez a
-- ação), a junção atribuição + agendamento num aviso só, a OS urgente atrasada
-- sem repetição, leitura e "marcar como lida" só das próprias, escrita direta
-- bloqueada, outra empresa, empresa suspensa e a exclusão da empresa.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_leitor_a uuid := gen_random_uuid();
  v_carlos uuid := gen_random_uuid();
  v_bruno uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_cargo_leitor uuid; v_t1 uuid; v_t2 uuid; v_eq uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid; v_st_canc uuid; v_urgente uuid;
  v_os1 uuid; v_os2 uuid; v_os3 uuid; v_os4 uuid; v_os_b uuid;
  v_ag2 uuid; v_ag3 uuid; v_versao int;
  -- próxima segunda 00:00 no horário de Brasília (as mensagens mostram a hora local)
  v_segunda timestamptz := (date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '7 days') at time zone 'America/Sao_Paulo';
  v_json jsonb; v_id uuid; v_n int; v_m int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_atend_a, v_leitor_a, v_carlos, v_bruno, v_owner_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente', 'at@teste.invalid', 'funcionario'),
    (v_leitor_a, v_loja_a, 'Leitor', 'le@teste.invalid', 'funcionario'),
    (v_carlos, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_bruno, v_loja_a, 'Bruno', 'br@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a
     and ((u.id in (v_carlos, v_bruno) and c.chave = 'technician') or (u.id = v_atend_a and c.chave = 'attendant'));
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Leitor', 'Só consulta OS', false) returning id into v_cargo_leitor;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values (v_cargo_leitor, 'service_orders.view');
  update public.usuarios set cargo_id = v_cargo_leitor where id = v_leitor_a;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_carlos) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Bruno', 'Lima', v_bruno) returning id into v_t2;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_canc from public.status_os where loja_id = v_loja_a and chave = 'cancelada';
  select id into v_urgente from public.prioridades_os where loja_id = v_loja_a and nivel = 'urgente' limit 1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'Uma') returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'Duas') returning id into v_os2;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'Três') returning id into v_os3;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, prioridade_id, prazo_em)
    values (v_loja_a, v_cli, v_st, 'Urgente', v_urgente, now() - interval '1 hour') returning id into v_os4;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_b, v_cli_b, v_st_b, 'De B') returning id into v_os_b;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_eq := public.salvar_equipe(null, null, jsonb_build_object('nome', 'Equipe B'), jsonb_build_array(jsonb_build_object('tecnico_id', v_t2)));
  execute 'reset role';

  -- ---------------- técnico: OS atribuída ----------------
  execute 'set local role authenticated';
  perform public.atribuir_os(v_os1, v_t1, null);
  execute 'reset role';
  if (select count(*) from public.notificacoes where usuario_id = v_carlos and os_id = v_os1 and tipo = 'os_atribuida' and titulo = 'Nova OS atribuída') = 1
     and not exists (select 1 from public.notificacoes where usuario_id = v_owner_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atribuir a OS avisa o técnico; quem atribuiu não recebe nada';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aviso de OS atribuída'; end if;

  -- ---------------- técnico: agendado (atribuição junto vira um aviso só) ----------------
  execute 'set local role authenticated';
  v_json := public.agendar_os(v_os2, v_segunda + interval '9 hours', v_segunda + interval '10 hours', v_t1, null, null, true, 'America/Sao_Paulo');
  execute 'reset role';
  v_ag2 := (v_json->>'id')::uuid;
  if (select count(*) from public.notificacoes where usuario_id = v_carlos and os_id = v_os2) = 1
     and exists (select 1 from public.notificacoes where usuario_id = v_carlos and os_id = v_os2
                   and tipo = 'atendimento_agendado' and agendamento_id = v_ag2 and mensagem like '%às 09:00') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agendar para o técnico gera um aviso só, com dia e hora (a atribuição junto não duplica)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aviso de agendamento'; end if;

  select versao into v_versao from public.agendamentos where id = v_ag2;
  execute 'set local role authenticated';
  perform public.reagendar_agendamento(v_ag2, v_versao, v_segunda + interval '14 hours', v_segunda + interval '15 hours', v_t1, null, null, true, 'America/Sao_Paulo');
  execute 'reset role';
  if exists (select 1 from public.notificacoes where usuario_id = v_carlos and os_id = v_os2
               and tipo = 'horario_alterado' and titulo = 'Horário alterado' and mensagem like '%às 14:00') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reagendar avisa o técnico do novo horário';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aviso de horário alterado'; end if;

  -- ---------------- equipe ----------------
  execute 'set local role authenticated';
  v_json := public.agendar_os(v_os3, v_segunda + interval '16 hours', v_segunda + interval '17 hours', null, v_eq, null, true, 'America/Sao_Paulo');
  execute 'reset role';
  v_ag3 := (v_json->>'id')::uuid;
  if (select count(*) from public.notificacoes where usuario_id = v_bruno and os_id = v_os3) = 1
     and exists (select 1 from public.notificacoes where usuario_id = v_bruno and os_id = v_os3 and tipo = 'atendimento_agendado')
     and not exists (select 1 from public.notificacoes where usuario_id = v_carlos and os_id = v_os3) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agendamento para a equipe avisa os membros (e só eles)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aviso para a equipe'; end if;

  -- ---------------- gestores: campo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.iniciar_atendimento_campo(v_ag2);
  execute 'reset role';
  if exists (select 1 from public.notificacoes where usuario_id = v_owner_a and tipo = 'atendimento_iniciado'
               and os_id = v_os2 and mensagem like 'Carlos Dias iniciou o atendimento%')
     and exists (select 1 from public.notificacoes where usuario_id = v_atend_a and tipo = 'atendimento_iniciado')
     and not exists (select 1 from public.notificacoes where usuario_id = v_leitor_a)
     and not exists (select 1 from public.notificacoes where usuario_id = v_carlos and tipo = 'atendimento_iniciado') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico iniciou: avisa dono e quem tem dispatch.view (não o leitor, nem o próprio técnico)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aviso de atendimento iniciado'; end if;

  execute 'set local role authenticated';
  perform public.pausar_atendimento(v_ag2, 'aguardando_peca', null);
  perform public.retomar_atendimento(v_ag2);
  perform public.finalizar_atendimento_campo(v_ag2, true, null);
  execute 'reset role';
  if exists (select 1 from public.notificacoes where usuario_id = v_owner_a and tipo = 'atendimento_pausado' and mensagem like '%aguardando peça')
     and exists (select 1 from public.notificacoes where usuario_id = v_owner_a and tipo = 'os_finalizada' and os_id = v_os2 and mensagem like '%por Carlos')
     and exists (select 1 from public.notificacoes where usuario_id = v_atend_a and tipo = 'os_finalizada')
     and not exists (select 1 from public.notificacoes where usuario_id = v_carlos and tipo in ('atendimento_pausado', 'os_finalizada')) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   pausa (com motivo) e finalização chegam aos gestores';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA avisos de pausa/finalização'; end if;

  -- ---------------- técnico: cancelamentos ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os1, v_st_canc, 'Cliente desistiu');
  select versao into v_versao from public.agendamentos where id = v_ag3;
  perform public.definir_status_agendamento(v_ag3, v_versao, 'cancelado', 'Remarcar com o cliente', 'America/Sao_Paulo');
  execute 'reset role';
  if exists (select 1 from public.notificacoes where usuario_id = v_carlos and tipo = 'os_cancelada' and os_id = v_os1 and mensagem like '%Cliente desistiu')
     and exists (select 1 from public.notificacoes where usuario_id = v_bruno and tipo = 'atendimento_cancelado' and agendamento_id = v_ag3
                   and mensagem like '%Remarcar com o cliente')
     and not exists (select 1 from public.notificacoes where usuario_id = v_owner_a and tipo in ('os_cancelada', 'atendimento_cancelado')) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS cancelada e atendimento cancelado avisam o técnico/equipe com o motivo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA avisos de cancelamento'; end if;

  -- ---------------- OS urgente atrasada (sob demanda, sem repetir) ----------------
  execute 'set local role authenticated';
  v_json := public.minhas_notificacoes();
  perform public.minhas_notificacoes();
  execute 'reset role';
  if (select count(*) from public.notificacoes where usuario_id = v_owner_a and tipo = 'os_urgente_atrasada' and os_id = v_os4) = 1
     and (select count(*) from public.notificacoes where usuario_id = v_atend_a and tipo = 'os_urgente_atrasada') = 1
     and not exists (select 1 from public.notificacoes where usuario_id in (v_carlos, v_leitor_a) and tipo = 'os_urgente_atrasada')
     and exists (select 1 from jsonb_array_elements(v_json->'itens') i where i->>'tipo' = 'os_urgente_atrasada') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS urgente atrasada avisa os gestores uma vez só, mesmo consultando de novo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aviso de OS urgente atrasada'; end if;

  -- ---------------- leitura e marcar como lida ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.minhas_notificacoes();
  v_id := (v_json->'itens'->0->>'id')::uuid;
  v_n := public.marcar_notificacoes_lidas(array[v_id]);
  v_m := (public.minhas_notificacoes()->>'nao_lidas')::int;
  execute 'reset role';
  if (v_json->>'nao_lidas')::int = 4 and jsonb_array_length(v_json->'itens') = 4
     and not exists (select 1 from jsonb_array_elements(v_json->'itens') i
                     where (i->>'id')::uuid not in (select id from public.notificacoes where usuario_id = v_carlos))
     and v_n = 1 and v_m = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico vê só os próprios avisos (4) e marca um como lido';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA leitura: %s não lidas, marcou %s, sobraram %s', v_json->>'nao_lidas', v_n, v_m); end if;

  execute 'set local role authenticated';
  v_n := public.marcar_notificacoes_lidas();
  select count(*) into v_m from public.notificacoes where usuario_id = v_owner_a;
  execute 'reset role';
  if v_n = 3 and v_m = 0 and not exists (select 1 from public.notificacoes where usuario_id = v_carlos and lida_em is null)
     and exists (select 1 from public.notificacoes where usuario_id = v_owner_a and lida_em is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   "marcar todas" só mexe nas do próprio usuário; a tabela não mostra avisos dos outros';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA marcar todas: %s, vê %s do dono', v_n, v_m); end if;

  -- ---------------- escrita direta ----------------
  v_n := 0;
  begin
    execute 'set local role authenticated';
    insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem)
      values (v_loja_a, v_owner_a, 'os_finalizada', 'Falso', 'Aviso forjado');
  exception when insufficient_privilege then v_n := 1;
  end;
  execute 'reset role';
  execute 'set local role authenticated';
  update public.notificacoes set lida_em = null where usuario_id = v_carlos;
  get diagnostics v_m = row_count;
  delete from public.notificacoes where usuario_id = v_carlos;
  execute 'reset role';
  if v_n = 1 and v_m = 0 and (select count(*) from public.notificacoes where usuario_id = v_carlos) = 4 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   ninguém cria, altera ou apaga aviso direto na tabela';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA escrita direta em notificacoes'; end if;

  -- ---------------- outra empresa ----------------
  select id into v_id from public.notificacoes where usuario_id = v_owner_a limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.minhas_notificacoes();
  v_n := public.marcar_notificacoes_lidas(array[v_id]);
  select count(*) into v_m from public.notificacoes where loja_id = v_loja_a;
  execute 'reset role';
  if jsonb_array_length(v_json->'itens') = 0 and v_n = 0 and v_m = 0
     and exists (select 1 from public.notificacoes where id = v_id and lida_em is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não vê nem marca avisos de A';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA isolamento entre empresas'; end if;

  if not has_function_privilege('authenticated', 'public.gestores_notificacao(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.usuarios_de_campo(uuid, uuid, uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.gerar_alertas_atraso(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.trg_log_eventos_notificar()', 'execute')
     and not has_function_privilege('anon', 'public.minhas_notificacoes(integer)', 'execute')
     and not has_function_privilege('anon', 'public.marcar_notificacoes_lidas(uuid[])', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   funções internas fora da API; anon não chama as públicas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exposição das funções'; end if;

  -- ---------------- empresa suspensa e exclusão ----------------
  update public.lojas set status = 'suspensa' where id = v_loja_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.minhas_notificacoes();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa suspensa leu avisos';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa → bloqueado';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.notificacoes where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove os avisos';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA avisos restaram'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception E'%\n\nTOTAL: % ok, % falhas (transação desfeita de propósito)', v_log, v_ok, v_falhas;
end;
$$;
