-- =====================================================================
-- Teste de tipos de serviço + workflow de OS (Fase 2 · 10)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_cli uuid; v_cli_b uuid;
  v_st_nova uuid; v_st_triagem uuid; v_st_agendada uuid; v_st_atend uuid; v_st_fin uuid; v_st_canc uuid;
  v_st_novo uuid;
  v_pr_normal uuid; v_pr_alta uuid; v_pr_baixa uuid; v_pr_b uuid;
  v_tipo uuid; v_tipo_b uuid;
  v_os uuid; v_os2 uuid; v_os_b uuid;
  v_ids uuid[];
  v_n int;
  v_txt text;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a, v_tec_a]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_a, v_loja_a, 'Técnico A', 'tc@teste.invalid', 'funcionario');
  update public.usuarios set cargo_id = (select id from public.cargos where loja_id = v_loja_a and chave = 'technician')
   where id = v_tec_a;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;

  -- ---------------- configuração padrão ----------------
  select id into v_st_nova from public.status_os where loja_id = v_loja_a and chave = 'nova';
  select id into v_st_triagem from public.status_os where loja_id = v_loja_a and chave = 'triagem';
  select id into v_st_agendada from public.status_os where loja_id = v_loja_a and chave = 'agendada';
  select id into v_st_atend from public.status_os where loja_id = v_loja_a and chave = 'em_atendimento';
  select id into v_st_fin from public.status_os where loja_id = v_loja_a and chave = 'finalizada';
  select id into v_st_canc from public.status_os where loja_id = v_loja_a and chave = 'cancelada';
  select id into v_pr_normal from public.prioridades_os where loja_id = v_loja_a and chave = 'normal';
  select id into v_pr_alta from public.prioridades_os where loja_id = v_loja_a and chave = 'alta';
  select id into v_pr_baixa from public.prioridades_os where loja_id = v_loja_a and chave = 'baixa';

  if (select count(*) from public.status_os where loja_id = v_loja_a) = 11
     and (select count(*) from public.status_os where loja_id = v_loja_a and inicial) = 1
     and exists (select 1 from public.status_os where id = v_st_nova and inicial)
     and (select count(*) from public.prioridades_os where loja_id = v_loja_a) = 4
     and exists (select 1 from public.prioridades_os where id = v_pr_normal and padrao)
     and not exists (select 1 from public.logs_auditoria where loja_id = v_loja_a and tipo_entidade in ('status_os', 'prioridade_os')) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa nova recebe 11 status (inicial "Nova") e 4 prioridades (padrão "Normal")';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA configuração padrão da empresa'; end if;

  -- ---------------- Owner A: OS e status ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_a, v_cli, 'OS padrão') returning id into v_os;
  execute 'reset role';
  if exists (select 1 from public.ordens_servico where id = v_os and status_id = v_st_nova and prioridade_id = v_pr_normal) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS sem status/prioridade recebe o status inicial e a prioridade padrão';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA padrões da OS'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st_fin, 'Já finalizada');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS nova criada finalizada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS nova não começa finalizada/cancelada';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.ordens_servico set status_id = v_st_atend where id = v_os;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA status alterado por UPDATE direto';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   UPDATE direto do status → negado (só pela ação própria)';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.alterar_status_os(v_os, v_st_atend);
  execute 'reset role';
  if (v_json->>'alterado')::boolean
     and exists (select 1 from public.ordens_servico where id = v_os and status_id = v_st_atend and iniciado_em is not null)
     and exists (select 1 from public.os_historico where os_id = v_os and status_anterior_id = v_st_nova
                 and status_novo_id = v_st_atend and usuario_id = v_owner_a)
     and exists (select 1 from public.log_eventos where acao = 'os_status_alterado' and detalhes->>'os_id' = v_os::text
                 and detalhes->>'para' = v_st_atend::text and usuario_id = v_owner_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   alterar_status_os grava histórico, evento e início do atendimento';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA alterar_status_os: %s', v_json); end if;

  -- ---------------- permissões por categoria ----------------
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_a, v_cli, 'OS 2') returning id into v_os2;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.alterar_status_os(v_os2, v_st_agendada);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os2, v_st_fin);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente finalizou OS';
  exception when insufficient_privilege then
    if (v_json->>'alterado')::boolean then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente agenda a OS, mas não finaliza (service_orders.finish)';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente não agendou'; end if;
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os2, v_st_canc);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente cancelou OS';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente não cancela (service_orders.cancel)';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.alterar_status_os(v_os2, v_st_fin);
  execute 'reset role';
  if (v_json->>'categoria') = 'finalizado_sucesso' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo técnico finaliza a OS';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA técnico finalizar: %s', v_json); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os2, v_st_triagem);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente reabriu OS finalizada';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reabrir OS finalizada exige service_orders.finish';
  end;
  execute 'reset role';

  -- atendente não configura o workflow
  begin
    execute 'set local role authenticated';
    insert into public.status_os (loja_id, nome, categoria) values (v_loja_a, 'Status do atendente', 'aberto');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente criou status';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente sem settings.manage não cria status';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.prioridades_os set nome = 'Hackeada' where id = v_pr_alta;
  get diagnostics v_n = row_count;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.uso_configuracao_os();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente leu uso das configurações';
  exception when insufficient_privilege then
    if v_n = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente não altera prioridades nem acessa a gestão';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente alterou prioridade'; end if;
  end;
  execute 'reset role';

  -- ---------------- Owner A: configurar status ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.status_os (loja_id, nome, categoria, cor) values (v_loja_a, '  Em   análise ', 'aberto', '#7f77dd')
    returning id into v_st_novo;
  execute 'reset role';
  if exists (select 1 from public.status_os where id = v_st_novo and nome = 'Em análise' and chave = 'em_analise'
             and cor = '#7F77DD' and ordem = 12)
     and exists (select 1 from public.logs_auditoria where acao = 'status_os_criado' and entidade_id = v_st_novo
                 and ator_usuario_id = v_owner_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   status criado com nome normalizado, chave gerada, fim da fila e auditoria';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA criação de status'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.status_os (loja_id, nome, categoria) values (v_loja_a, 'EM ANALISE', 'aberto');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA status duplicado aceito';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nome de status duplicado (maiúsculas/acentos) → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.status_os set chave = 'outra' where id = v_st_novo;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA chave do status alterada';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   chave do status é imutável';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.status_os set nome = 'Executando serviço' where id = v_st_atend;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    update public.status_os set categoria = 'pausado' where id = v_st_atend;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA categoria de status em uso alterada';
  exception when check_violation then
    if exists (select 1 from public.status_os where id = v_st_atend and nome = 'Executando serviço' and chave = 'em_atendimento') then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   renomear status em uso é livre; mudar a categoria dele → negado';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA renomear status'; end if;
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.status_os set ativo = false where id = v_st_nova;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA status inicial desativado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   status inicial não pode ser desativado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.status_os set ativo = false where id = v_st_fin;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA último status finalizado desativado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   último status ativo de uma categoria essencial não é desativado';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.status_os set ativo = false where id = v_st_triagem;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os, v_st_triagem);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS movida para status desativado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   status desativado não recebe OS';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.definir_status_inicial(v_st_novo);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.definir_status_inicial(v_st_agendada);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA status agendado virou inicial';
  exception when check_violation then
    if (select array_agg(id) from public.status_os where loja_id = v_loja_a and inicial) = array[v_st_novo] then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   troca do status inicial (somente categoria Aberta)';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA troca do status inicial'; end if;
  end;
  execute 'reset role';

  select array_agg(id order by ordem desc) into v_ids from public.status_os where loja_id = v_loja_a;
  begin
    execute 'set local role authenticated';
    perform public.reordenar_status_os(v_ids[2:]);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA reordenação com lista incompleta';
  exception when serialization_failure then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reordenar com lista desatualizada → conflito';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.reordenar_status_os(v_ids);
  execute 'reset role';
  if (select array_agg(id order by ordem) from public.status_os where loja_id = v_loja_a) = v_ids
     and (select count(*) from public.logs_auditoria where acao = 'status_os_reordenados' and loja_id = v_loja_a) = 1
     and not exists (select 1 from public.logs_auditoria where acao = 'status_os_alterado' and loja_id = v_loja_a
                     and metadados->'campos' ? 'ordem') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reordenação atômica com um único registro de auditoria';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA reordenação'; end if;

  -- ---------------- prioridades ----------------
  execute 'set local role authenticated';
  perform public.definir_prioridade_padrao(v_pr_alta);
  insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_a, v_cli, 'OS 3') returning id into v_os2;
  execute 'reset role';
  if exists (select 1 from public.ordens_servico where id = v_os2 and prioridade_id = v_pr_alta and status_id = v_st_novo) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nova prioridade padrão e novo status inicial valem para as próximas OS';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA padrões após troca'; end if;

  begin
    execute 'set local role authenticated';
    update public.prioridades_os set ativo = false where id = v_pr_alta;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA prioridade padrão desativada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   prioridade padrão não pode ser desativada';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.prioridades_os set ativo = false where id = v_pr_baixa;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    update public.ordens_servico set prioridade_id = v_pr_baixa where id = v_os;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA prioridade desativada aplicada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   prioridade desativada não é aplicada em OS';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.prioridades_os set nivel = 'urgente' where id = v_pr_alta;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA nível de prioridade em uso alterado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nível interno de prioridade em uso não muda';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.ordens_servico set prioridade_id = v_pr_alta where id = v_os;
  execute 'reset role';
  if exists (select 1 from public.log_eventos where acao = 'os_prioridade_alterada' and detalhes->>'os_id' = v_os::text
             and detalhes->>'de' = v_pr_normal::text and detalhes->>'para' = v_pr_alta::text and usuario_id = v_owner_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mudança de prioridade da OS registra evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento de prioridade'; end if;

  -- ---------------- tipos de serviço ----------------
  execute 'set local role authenticated';
  insert into public.tipos_servico (loja_id, nome, descricao, local_atendimento_padrao)
    values (v_loja_a, ' Instalação ', '  Instalação de câmeras e alarmes ', 'externo') returning id into v_tipo;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.tipos_servico (loja_id, nome) values (v_loja_a, 'instalacao');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA tipo duplicado aceito';
  exception when unique_violation then
    if exists (select 1 from public.tipos_servico where id = v_tipo and nome = 'Instalação'
               and descricao = 'Instalação de câmeras e alarmes' and local_atendimento_padrao = 'externo') then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tipo de serviço normalizado; nome duplicado → negado';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA normalização do tipo'; end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.ordens_servico set tipo_servico_id = v_tipo where id = v_os;
  update public.tipos_servico set ativo = false where id = v_tipo;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, tipo_servico_id, descricao) values (v_loja_a, v_cli, v_tipo, 'Tipo inativo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA tipo desativado usado em OS nova';
  exception when check_violation then
    if exists (select 1 from public.log_eventos where acao = 'os_tipo_servico_alterado' and detalhes->>'os_id' = v_os::text) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tipo na OS registra evento; tipo desativado não entra em OS nova';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento de tipo'; end if;
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    delete from public.tipos_servico where id = v_tipo;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA tipo em uso excluído';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tipo em uso não pode ser excluído';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.uso_configuracao_os();
  execute 'reset role';
  if (v_json->'tipos'->>v_tipo::text)::int = 1 and (v_json->'prioridades'->>v_pr_alta::text)::int = 2
     and (v_json->'status'->>v_st_atend::text)::int >= 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   uso das configurações conta OS reais';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA uso: %s', v_json); end if;

  -- ---------------- empresa B ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.tipos_servico where loja_id = v_loja_a;
  select v_n + count(*) into v_n from public.prioridades_os where loja_id = v_loja_a;
  select v_n + count(*) into v_n from public.status_os where loja_id = v_loja_a;
  insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_b, v_cli_b, 'OS B') returning id into v_os_b;
  update public.tipos_servico set nome = 'invadido' where id = v_tipo;
  get diagnostics v_txt = row_count;
  execute 'reset role';
  if v_n = 0 and v_txt = '0'
     and exists (select 1 from public.ordens_servico o join public.status_os s on s.id = o.status_id
                 join public.prioridades_os p on p.id = o.prioridade_id
                 where o.id = v_os_b and s.loja_id = v_loja_b and s.chave = 'nova' and p.loja_id = v_loja_b and p.chave = 'normal') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê nem altera configurações de A e usa os próprios padrões';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento B: lê %s, altera %s', v_n, v_txt); end if;

  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os, (select id from public.status_os where loja_id = v_loja_b and chave = 'cancelada'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B alterou status de OS de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não altera status de OS de A (não encontrada)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os_b, v_st_atend);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B usou status de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não aplica status de A na própria OS';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.ordens_servico set prioridade_id = v_pr_alta, tipo_servico_id = null where id = v_os_b;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B usou prioridade de A';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não aplica prioridade de A (FK de tenant)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.reordenar_prioridades_os(array(select id from public.prioridades_os where loja_id = v_loja_a));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B reordenou prioridades de A';
  exception when serialization_failure then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não reordena prioridades de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.definir_status_inicial(v_st_triagem);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B definiu status inicial de A';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não define status inicial com ID de A';
  end;
  execute 'reset role';

  -- ---------------- anônimo e exclusão da empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.alterar_status_os(v_os, v_st_fin);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo alterou status';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não altera status';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.ordens_servico where loja_id = v_loja_b;
    delete from public.lojas where id = v_loja_b;
    if not exists (select 1 from public.status_os where loja_id = v_loja_b)
       and not exists (select 1 from public.prioridades_os where loja_id = v_loja_b) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove o workflow sem ser bloqueado pelas proteções';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA configurações restaram após excluir a empresa'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
