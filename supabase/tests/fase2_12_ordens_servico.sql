-- =====================================================================
-- Teste do módulo de Ordens de Serviço (Fase 2 · 12)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_user_a uuid := gen_random_uuid();
  v_fin_a uuid := gen_random_uuid();
  v_estoque_a uuid := gen_random_uuid();
  v_cli uuid; v_cli2 uuid; v_cli_b uuid;
  v_tec uuid;
  v_pr_alta uuid;
  v_st_canc uuid; v_st_nova uuid;
  v_os1 uuid; v_os2 uuid; v_os_b uuid;
  v_item uuid;
  v_versao int;
  v_n int;
  v_txt text;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a, v_tec_user_a, v_fin_a, v_estoque_a]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_user_a, v_loja_a, 'Login Técnico A', 'lt@teste.invalid', 'funcionario'),
    (v_fin_a, v_loja_a, 'Financeiro A', 'fi@teste.invalid', 'funcionario'),
    (v_estoque_a, v_loja_a, 'Estoque A', 'es@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id
    from public.cargos c
   where c.loja_id = v_loja_a
     and ((u.id = v_tec_user_a and c.chave = 'technician') or (u.id = v_fin_a and c.chave = 'finance')
          or (u.id = v_estoque_a and c.chave = 'inventory'));
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Condomínio Solar') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Padaria Central') returning id into v_cli2;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.tecnicos (loja_id, nome, sobrenome) values (v_loja_a, 'Carlos', 'Souza') returning id into v_tec;
  select id into v_pr_alta from public.prioridades_os where loja_id = v_loja_a and chave = 'alta';
  select id into v_st_canc from public.status_os where loja_id = v_loja_a and chave = 'cancelada';
  select id into v_st_nova from public.status_os where loja_id = v_loja_a and chave = 'nova';
  update public.prioridades_os set sla_horas = 4 where id = v_pr_alta;

  -- ---------------- criação e numeração ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, titulo, descricao, prioridade_id, tecnico_id,
                                     numero_ano, numero_sequencia, valor_total, criado_em)
    values (v_loja_a, v_cli, '  Instalação   de câmeras ', 'Instalar 8 câmeras na portaria', v_pr_alta, v_tec,
            1999, 999, 5000, now() - interval '30 days')
    returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, titulo, descricao)
    values (v_loja_a, v_cli2, 'Troca de fonte', 'DVR não liga') returning id into v_os2;
  execute 'reset role';

  select string_agg(numero, ',' order by numero) into v_txt from public.ordens_servico where loja_id = v_loja_a;
  if v_txt = format('OS-%s-000001,OS-%s-000002', extract(year from now() at time zone 'America/Sao_Paulo')::int,
                    extract(year from now() at time zone 'America/Sao_Paulo')::int)
     and exists (select 1 from public.ordens_servico where id = v_os1 and valor_total = 0
                 and criado_em > now() - interval '1 minute' and criado_por = v_atend_a and titulo = 'Instalação de câmeras') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   número sequencial gerado pelo banco; número, total e data enviados são ignorados';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA numeração: %s', v_txt); end if;

  if exists (select 1 from public.ordens_servico where id = v_os1 and sla_horas = 4
             and prazo_em between criado_em + interval '4 hours' - interval '1 second' and criado_em + interval '4 hours' + interval '1 second')
     and public.situacao_sla_os((select prazo_em from public.ordens_servico where id = v_os1), now(), null, 'aberto') = 'no_prazo' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   SLA sugerido pela prioridade define o prazo (4 h)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA SLA pela prioridade'; end if;

  if exists (select 1 from public.os_historico where os_id = v_os1 and status_anterior_id is null and status_novo_id = v_st_nova and usuario_id = v_atend_a)
     and exists (select 1 from public.log_eventos where acao = 'os_criada' and detalhes->>'os_id' = v_os1::text and usuario_id = v_atend_a)
     and exists (select 1 from public.log_eventos where acao = 'os_tecnico_atribuido' and detalhes->>'os_id' = v_os1::text
                 and detalhes->>'tecnico_id' = v_tec::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   criação grava histórico inicial, evento e atribuição de técnico';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA eventos de criação'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_user_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_a, v_cli, 'Criada pelo técnico');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo técnico criou OS';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem service_orders.create não cria OS';
  end;
  execute 'reset role';

  -- ---------------- edição, versão e permissões ----------------
  begin
    execute 'set local role authenticated';
    update public.ordens_servico set tecnico_id = null where id = v_os1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico sem assign trocou o técnico';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   trocar técnico exige service_orders.assign';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.ordens_servico set diagnostico = 'Fonte queimada', servico_executado = 'Troca da fonte' where id = v_os2;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 1 and exists (select 1 from public.ordens_servico where id = v_os2 and versao = 2 and atualizado_por = v_tec_user_a)
     and exists (select 1 from public.log_eventos where acao = 'os_atualizada' and detalhes->>'os_id' = v_os2::text
                 and detalhes->'campos' ? 'diagnostico') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico registra o atendimento; versão e evento atualizados';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA registro do atendimento'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  select versao into v_versao from public.ordens_servico where id = v_os2;
  execute 'set local role authenticated';
  update public.ordens_servico set titulo = 'Troca de fonte do DVR' where id = v_os2 and versao = v_versao;
  update public.ordens_servico set titulo = 'Versão antiga' where id = v_os2 and versao = v_versao;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 and exists (select 1 from public.ordens_servico where id = v_os2 and titulo = 'Troca de fonte do DVR') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   edição com versão desatualizada não sobrescreve';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA controle de versão'; end if;

  begin
    execute 'set local role authenticated';
    update public.ordens_servico set cliente_id = v_cli where id = v_os2;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cliente da OS trocado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cliente da OS não pode ser trocado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.ordens_servico set numero_sequencia = 50 where id = v_os2;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA número da OS alterado';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   número da OS é imutável';
  end;
  execute 'reset role';

  -- ---------------- itens e total ----------------
  execute 'set local role authenticated';
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario)
    values (v_os1, 'produto', ' Câmera  dome ', 8, 150.50) returning id into v_item;
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario) values (v_os1, 'servico', 'Instalação', 1, 400);
  update public.ordens_servico set desconto = 100 where id = v_os1;
  update public.ordens_servico set valor_total = 1 where id = v_os1;
  execute 'reset role';
  if exists (select 1 from public.ordens_servico where id = v_os1 and valor_total = 1504.00 and desconto = 100)
     and exists (select 1 from public.os_itens where id = v_item and descricao = 'Câmera dome' and subtotal = 1204.00 and criado_por = v_owner_a)
     and (select count(*) from public.log_eventos where acao = 'os_item_adicionado' and detalhes->>'os_id' = v_os1::text) = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   total = itens − desconto, calculado pelo banco (valor enviado ignorado)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA total: %s', (select valor_total from public.ordens_servico where id = v_os1)); end if;

  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario) values (v_os1, 'peca', 'Negativo', -1, 10);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA quantidade negativa aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quantidade inválida → negada';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_fin_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico where loja_id = v_loja_a;
  update public.ordens_servico set titulo = 'Pelo financeiro' where id = v_os1;
  get diagnostics v_versao = row_count;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario) values (v_os1, 'servico', 'Pelo financeiro', 1, 1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA financeiro adicionou item';
  exception when insufficient_privilege then
    if v_n = 2 and v_versao = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo só leitura vê OS, mas não edita nem inclui itens';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA financeiro: vê %s, editou %s', v_n, v_versao); end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_estoque_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.obter_ordem_servico(v_os1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo sem service_orders.view abriu a OS';
  exception when insufficient_privilege then
    if v_n = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem service_orders.view não lê OS (tabela nem função)';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA estoque lê %s OS', v_n); end if;
  end;
  execute 'reset role';

  -- ---------------- cancelamento e OS encerrada ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os2, v_st_canc, '  ');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cancelamento sem motivo';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cancelar exige motivo';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os2, v_st_canc, 'Cliente desistiu');
  v_json := public.historico_status_os(v_os2);
  execute 'reset role';
  if exists (select 1 from public.ordens_servico where id = v_os2 and concluido_em is not null)
     and v_json->0->>'observacao' = 'Cliente desistiu' and v_json->0->'para'->>'categoria' = 'finalizado_cancelado'
     and jsonb_array_length(v_json) = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cancelamento registra motivo, data de conclusão e histórico';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cancelamento: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario) values (v_os2, 'peca', 'Fonte', 1, 80);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA item em OS cancelada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada não aceita itens';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.ordens_servico set titulo = 'Depois de cancelar' where id = v_os2;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dados de OS encerrada alterados';
  exception when check_violation then
    execute 'reset role';
    execute 'set local role authenticated';
    update public.ordens_servico set observacoes_tecnicas = 'Equipamento devolvido' where id = v_os2;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada: dados bloqueados, registro do atendimento liberado';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA observação técnica em OS encerrada'; end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os2, v_st_nova);
  delete from public.ordens_servico where id = v_os1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if exists (select 1 from public.ordens_servico where id = v_os2 and concluido_em is null) and v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reabrir limpa a conclusão; OS nunca é excluída';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA reabertura/exclusão'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.os_historico (os_id, usuario_id, status_novo_id) values (v_os1, v_owner_a, v_st_canc);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA histórico inserido diretamente';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   histórico de status não aceita inserção direta';
  end;
  execute 'reset role';

  -- ---------------- listagem, SLA e detalhe ----------------
  update public.ordens_servico set prazo_em = now() - interval '1 hour' where id = v_os2;
  execute 'set local role authenticated';
  v_json := public.listar_ordens_servico(p_sla => 'atrasada');
  v_n := (v_json->>'total')::int;
  v_txt := v_json->'itens'->0->>'numero';
  v_json := public.listar_ordens_servico(p_busca => 'condominio');
  execute 'reset role';
  if v_n = 1 and v_txt like 'OS-%-000002' and (v_json->>'total')::int = 1 and v_json->'itens'->0->>'id' = v_os1::text
     and v_json->'itens'->0->'tecnico'->>'nome' = 'Carlos Souza' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   listagem filtra atrasadas e busca pelo nome do cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA listagem: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.listar_ordens_servico(p_busca => '000002', p_tecnico => 'sem');
  v_n := (v_json->>'total')::int;
  v_json := public.obter_ordem_servico(v_os1);
  execute 'reset role';
  if v_n = 1 and v_json->>'sla' = 'no_prazo' and (v_json->>'subtotal_itens')::numeric = 1604
     and v_json->'tecnico'->>'nome' = 'Carlos Souza' and v_json->'prioridade'->>'nome' = 'Alta' and not v_json ? 'busca' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   busca por número, filtro sem técnico e detalhe completo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA detalhe: total %s %s', v_n, v_json); end if;

  execute 'set local role authenticated';
  v_json := public.dashboard_resumo(now() - interval '1 day', now() + interval '1 day');
  execute 'reset role';
  if (v_json->'cards'->>'os_atrasadas')::int = 1
     and v_json->'os_por_tecnico' @> '[{"nome":"Carlos Souza","total":1}]'
     and v_json->'os_por_tecnico' @> '[{"nome":"Sem técnico","total":1}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   dashboard: OS atrasadas e OS por técnico com dados reais';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA dashboard: %s / %s', v_json->'cards', v_json->'os_por_tecnico'); end if;

  -- ---------------- empresa B ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_b, v_cli_b, 'OS de B') returning id into v_os_b;
  v_json := public.listar_ordens_servico(p_grupo => 'todas');
  update public.ordens_servico set titulo = 'invadido' where id = v_os1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if (v_json->>'total')::int = 1 and v_json->'itens'->0->>'numero' like 'OS-%-000001' and v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B tem numeração própria, só lista e altera as próprias OS';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento B: %s / alterou %s', v_json, v_n); end if;

  begin
    execute 'set local role authenticated';
    perform public.obter_ordem_servico(v_os1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B abriu OS de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não abre OS de A pelo ID';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario) values (v_os1, 'servico', 'Item forjado', 1, 1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B incluiu item em OS de A';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não inclui item em OS de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.historico_status_os(v_os1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B leu histórico de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não lê o histórico de OS de A';
  end;
  execute 'reset role';

  -- ---------------- anônimo e exclusão da empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.listar_ordens_servico();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo listou OS';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lista OS';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}', true);
  insert into public.equipamentos (loja_id, cliente_id, nome) values (v_loja_a, v_cli, 'DVR portaria')
    returning id into v_item;
  update public.ordens_servico set equipamento_id = v_item where id = v_os1;
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.ordens_servico where loja_id = v_loja_a)
       and not exists (select 1 from public.os_numeracao where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove OS, itens, histórico, equipamentos e numeração';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dados restaram após excluir a empresa'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
