-- =====================================================================
-- Teste do módulo de Equipamentos (Fase 2 · 07)
-- Vínculos cliente/endereço/categoria, código público (QR), permissões,
-- arquivamento, auditoria, preparação na OS, dashboard e isolamento A × B.
-- Tudo desfeito ao final. Resultado esperado: "TOTAL: N ok, 0 falhas".
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_user_a uuid := gen_random_uuid();
  v_cli1 uuid; v_cli2 uuid; v_cli_arq uuid; v_cli_b uuid;
  v_end1 uuid; v_end2 uuid;
  v_cat_a uuid; v_cat_b uuid;
  v_eq1 uuid; v_eq2 uuid; v_eq_b uuid;
  v_st uuid;
  v_codigo text; v_codigo_novo text;
  v_n int; v_versao int;
  v_json jsonb;
  v_uuid uuid;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  v_codigo := public.gerar_codigo_publico();
  if v_codigo ~ '^[A-Za-z0-9_-]{22}$' and v_codigo <> public.gerar_codigo_publico() then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   código público: 22 caracteres URL-safe, aleatório';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA código público: %s', v_codigo); end if;

  -- ---------------- Preparação (plano Pro inclui equipamentos) ----------------
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a, v_tec_user_a]) u;

  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_user_a, v_loja_a, 'Técnico A', 'tc@teste.invalid', 'funcionario');
  update public.usuarios set cargo_id = (select id from public.cargos where loja_id = v_loja_a and chave = 'technician')
   where id = v_tec_user_a;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Condomínio Solar') returning id into v_cli1;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Padaria Central') returning id into v_cli2;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente Arquivado') returning id into v_cli_arq;
  update public.clientes set arquivado_em = now() where id = v_cli_arq;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.cliente_enderecos (loja_id, cliente_id, rotulo, logradouro, cidade, estado)
    values (v_loja_a, v_cli1, 'Portaria', 'Rua A', 'São Paulo', 'SP') returning id into v_end1;
  insert into public.cliente_enderecos (loja_id, cliente_id, rotulo, logradouro, cidade, estado)
    values (v_loja_a, v_cli2, 'Loja', 'Rua B', 'São Paulo', 'SP') returning id into v_end2;
  insert into public.status_os (loja_id, nome, categoria) values (v_loja_a, 'Aberta', 'aberto') returning id into v_st;

  -- ================= Owner A =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  insert into public.categorias_equipamento (loja_id, nome) values (v_loja_a, 'DVR') returning id into v_cat_a;
  insert into public.equipamentos (loja_id, cliente_id, cliente_endereco_id, categoria_id, nome, marca, modelo, numero_serie,
                                   garantia_ate, codigo_publico)
    values (v_loja_a, v_cli1, v_end1, v_cat_a, ' DVR  Portaria ', 'Intelbras', 'MHDX 1216', 'SN-123',
            current_date - 10, 'CODIGO_PREVISIVEL_FORJADO')
    returning id, codigo_publico into v_eq1, v_codigo;
  execute 'reset role';

  if v_codigo <> 'CODIGO_PREVISIVEL_FORJADO' and length(v_codigo) = 22
     and exists (select 1 from public.equipamentos where id = v_eq1 and nome = 'DVR Portaria' and criado_por = v_owner_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cadastro normaliza nome e ignora código público enviado pelo cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cadastro/código: %s', v_codigo); end if;

  if exists (select 1 from public.log_eventos where acao = 'equipamento_cadastrado' and detalhes->>'equipamento_id' = v_eq1::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   evento "equipamento cadastrado" registrado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento de cadastro'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.equipamentos (loja_id, cliente_id, cliente_endereco_id, nome) values (v_loja_a, v_cli2, v_end1, 'Endereço de outro cliente');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço de outro cliente aceito';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço precisa ser do mesmo cliente (FK)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.equipamentos (loja_id, cliente_id, nome) values (v_loja_a, v_cli_arq, 'Para arquivado');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA equipamento para cliente arquivado aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cliente arquivado não recebe equipamento';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.equipamentos set codigo_publico = 'CODIGO_ESCOLHIDO_PELO_USUARIO' where id = v_eq1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA código público alterado diretamente';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   código público não pode ser definido manualmente';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_codigo_novo := public.regenerar_codigo_equipamento(v_eq1);
  v_uuid := public.equipamento_por_codigo(v_codigo);
  execute 'reset role';
  if v_codigo_novo <> v_codigo and v_uuid is null
     and exists (select 1 from public.logs_auditoria where entidade_id = v_eq1 and acao = 'equipamento_codigo_regenerado') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   regenerar código: antigo deixa de funcionar e ação é auditada';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA regenerar código'; end if;

  execute 'set local role authenticated';
  v_uuid := public.equipamento_por_codigo(v_codigo_novo);
  insert into public.equipamentos (loja_id, cliente_id, nome, status, garantia_ate)
    values (v_loja_a, v_cli2, 'Câmera Caixa', 'em_manutencao', null) returning id into v_eq2;
  update public.equipamentos set marca = 'Hikvision', localizacao = 'Caixa 1' where id = v_eq2;
  execute 'reset role';
  if v_uuid = v_eq1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   QR: código atual resolve o equipamento para usuário da empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA leitura de código'; end if;

  if exists (select 1 from public.logs_auditoria where entidade_id = v_eq2 and acao = 'equipamento_alterado'
             and metadados->'campos' ? 'marca' and metadados->'campos' ? 'localizacao') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   alteração de equipamento vai para a auditoria com os campos';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA auditoria de alteração'; end if;

  -- listagem e filtros
  execute 'set local role authenticated';
  v_json := public.listar_equipamentos('padaria');
  v_n := (v_json->>'total')::int;
  v_json := public.listar_equipamentos(null, 'ativos', null, null, null, 'vencida');
  v_versao := (v_json->>'total')::int;
  execute 'reset role';
  if v_n = 1 and v_versao = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   busca pelo nome do cliente e filtro de garantia vencida';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA filtros: busca %s, garantia %s', v_n, v_versao); end if;

  -- OS: preparação
  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, equipamento_id, descricao)
    values (v_loja_a, v_cli2, v_st, v_eq1, 'OS com equipamento de outro cliente');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS com equipamento de outro cliente aceita';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS só aceita equipamento do próprio cliente (FK)';
  end;
  execute 'reset role';

  insert into public.ordens_servico (loja_id, cliente_id, status_id, equipamento_id, descricao)
    values (v_loja_a, v_cli1, v_st, v_eq1, 'OS do DVR');
  execute 'set local role authenticated';
  v_json := public.listar_equipamentos('dvr');
  execute 'reset role';
  if v_json->'itens' @> '[{"nome":"DVR Portaria","total_os":1}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   listagem conta OS reais do equipamento';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA contagem de OS: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    update public.equipamentos set cliente_id = v_cli2, cliente_endereco_id = null where id = v_eq1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA equipamento com OS trocou de cliente';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipamento com OS não troca de cliente';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    delete from public.cliente_enderecos where id = v_end1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço em uso excluído';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço usado por equipamento não é excluído';
  end;
  execute 'reset role';

  -- ================= Atendente: cria/edita, não arquiva =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.equipamentos set observacoes = 'Senha do DVR com o síndico' where id = v_eq2;
  get diagnostics v_n = row_count;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    update public.equipamentos set arquivado_em = now() where id = v_eq2;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente arquivou equipamento';
  exception when insufficient_privilege then
    if v_n = 1 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente edita, mas não arquiva (assets.archive)';
    else
      v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente não editou';
    end if;
  end;
  execute 'reset role';

  -- ================= Cargo técnico: vê, não cria =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.listar_equipamentos();
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.equipamentos (loja_id, cliente_id, nome) values (v_loja_a, v_cli1, 'Pelo técnico');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico cadastrou equipamento';
  exception when others then
    if (v_json->>'total')::int = 2 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo técnico consulta equipamentos mas não cadastra';
    else
      v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA técnico lista %s', v_json->>'total');
    end if;
  end;
  execute 'reset role';

  -- ================= Owner A: arquivar, OS, exclusão, dashboard =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.equipamentos set arquivado_em = now() where id = v_eq2;
  delete from public.equipamentos where id = v_eq1;
  get diagnostics v_n = row_count;
  v_json := public.dashboard_resumo(now() - interval '1 day', now() + interval '1 day');
  execute 'reset role';

  if v_n = 0 and exists (select 1 from public.logs_auditoria where entidade_id = v_eq2 and acao = 'equipamento_arquivado') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   exclusão bloqueada; arquivamento auditado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exclusão/arquivamento'; end if;

  if (v_json->'cards'->>'equipamentos')::int = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   dashboard conta só equipamentos ativos';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA card equipamentos: %s', v_json->'cards'); end if;

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, equipamento_id, descricao)
    values (v_loja_a, v_cli2, v_st, v_eq2, 'OS para arquivado');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS para equipamento arquivado';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipamento arquivado não recebe OS';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.equipamento_historico(v_eq2);
  execute 'reset role';
  if v_json @> '[{"acao":"equipamento_cadastrado"}]' and v_json @> '[{"acao":"equipamento_arquivado"}]'
     and v_json @> '[{"acao":"equipamento_atualizado"}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   histórico do equipamento (cadastro, alteração, arquivamento)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA histórico: %s', v_json); end if;

  -- ================= Isolamento A × B =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.categorias_equipamento (loja_id, nome) values (v_loja_b, 'DVR') returning id into v_cat_b;
  insert into public.equipamentos (loja_id, cliente_id, categoria_id, nome) values (v_loja_b, v_cli_b, v_cat_b, 'Equipamento B')
    returning id into v_eq_b;
  v_json := public.listar_equipamentos(null, 'todos');
  v_uuid := public.equipamento_por_codigo(v_codigo_novo);
  execute 'reset role';
  if (v_json->>'total')::int = 1 and v_uuid is null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B só vê o próprio equipamento; QR de A não resolve para B';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento B: total %s, qr %s', v_json->>'total', v_uuid); end if;

  begin
    execute 'set local role authenticated';
    insert into public.equipamentos (loja_id, cliente_id, nome) values (v_loja_b, v_cli1, 'Em cliente de A');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B cadastrou equipamento em cliente de A';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não cadastra equipamento em cliente de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.equipamentos (loja_id, cliente_id, categoria_id, nome) values (v_loja_b, v_cli_b, v_cat_a, 'Categoria de A');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B usou categoria de A';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   categoria de outra empresa → negada (FK)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.regenerar_codigo_equipamento(v_eq1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B regenerou código de equipamento de A';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não regenera código de equipamento de A';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.equipamentos set nome = 'invadido' where id = v_eq1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não altera equipamento de A';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B alterou equipamento de A'; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.equipamento_por_codigo(v_codigo_novo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo resolveu código de QR';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não resolve código de QR';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
