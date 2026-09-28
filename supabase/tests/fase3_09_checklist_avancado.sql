-- =====================================================================
-- Teste do checklist avançado (Fase 3 · 15 e 16 — etapa 11)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre os tipos novos (hora, medição, assinatura), o item condicional
-- (exibição, resposta apagada quando a condição cai, encadeamento), a
-- exigência só do que está visível ao finalizar, a feature do plano,
-- a permissão `checklists.fill` e o isolamento entre empresas.
-- =====================================================================
do $$
declare
  v_pro uuid; v_start uuid;
  v_loja_a uuid; v_loja_b uuid; v_loja_c uuid;
  v_owner_a uuid := gen_random_uuid();
  v_campo_a uuid := gen_random_uuid();
  v_leitor_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_owner_c uuid := gen_random_uuid();
  v_cargo_campo uuid; v_cargo_leitor uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid; v_st_fim uuid;
  v_os uuid; v_os2 uuid; v_os_b uuid;
  v_modelo uuid; v_modelo2 uuid;
  v_chk uuid; v_chk2 uuid;
  v_anexo uuid; v_anexo_b uuid;
  v_i1 uuid; v_i2 uuid; v_i3 uuid; v_i4 uuid; v_i5 uuid; v_i6 uuid; v_i7 uuid;
  v_json jsonb; v_itens jsonb; v_n int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_pro from public.planos where nome = 'Pro';
  select id into v_start from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_campo_a, v_leitor_a, v_owner_b, v_owner_c]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.lojas (nome) values ('TESTE Empresa C') returning id into v_loja_c;
  insert into public.assinaturas (loja_id, plano_id, status) values
    (v_loja_a, v_pro, 'active'), (v_loja_b, v_pro, 'active'), (v_loja_c, v_start, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_campo_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_leitor_a, v_loja_a, 'Leitor', 'le@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_owner_c, v_loja_c, 'Owner C', 'oc@teste.invalid', 'gerente');

  -- cargo que só preenche checklist (sem service_orders.edit) e cargo só de leitura
  -- cargo criado pela empresa não tem chave (a chave é só dos cargos do sistema)
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Campo', 'Só preenche checklist', false) returning id into v_cargo_campo;
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Leitor', 'Só consulta', false) returning id into v_cargo_leitor;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values
    (v_cargo_campo, 'dashboard.view'), (v_cargo_campo, 'service_orders.view'), (v_cargo_campo, 'checklists.fill'),
    (v_cargo_leitor, 'dashboard.view'), (v_cargo_leitor, 'service_orders.view');
  update public.usuarios set cargo_id = v_cargo_campo where id = v_campo_a;
  update public.usuarios set cargo_id = v_cargo_leitor where id = v_leitor_a;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;

  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Instalação') returning id into v_os;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Segunda OS') returning id into v_os2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);

  -- o anexo só existe depois do arquivo no Storage (gatilho confere lá)
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
    ('os-anexos', v_loja_a || '/' || v_os || '/a.png', v_owner_a, v_owner_a::text, '{"size": 1024, "mimetype": "image/png"}'),
    ('os-anexos', v_loja_a || '/' || v_os2 || '/b.png', v_owner_a, v_owner_a::text, '{"size": 1024, "mimetype": "image/png"}');
  insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os, 'foto', 'assinatura.png', v_loja_a || '/' || v_os || '/a.png', 'image/png', 1024)
    returning id into v_anexo;
  insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os2, 'foto', 'outra.png', v_loja_a || '/' || v_os2 || '/b.png', 'image/png', 1024)
    returning id into v_anexo_b;

  -- ---------------- modelo com os tipos novos e condição ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_modelo := public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Instalação CFTV'), jsonb_build_array(
    jsonb_build_object('rotulo', 'Equipamento apresenta dano?', 'tipo', 'checkbox', 'obrigatorio', true),
    jsonb_build_object('rotulo', 'Gravidade do dano', 'tipo', 'selecao', 'obrigatorio', true,
                       'opcoes', jsonb_build_array('Baixa', 'Alta'), 'depende_de_ordem', 1, 'condicao_valor', 'true'),
    jsonb_build_object('rotulo', 'Descreva o reparo', 'tipo', 'texto', 'obrigatorio', true,
                       'depende_de_ordem', 2, 'condicao_valor', 'Alta'),
    jsonb_build_object('rotulo', 'Tensão da rede', 'tipo', 'medicao', 'obrigatorio', true,
                       'unidade', 'V', 'valor_min', '110', 'valor_max', '240'),
    jsonb_build_object('rotulo', 'Hora da leitura', 'tipo', 'hora'),
    jsonb_build_object('rotulo', 'Assinatura do responsável', 'tipo', 'assinatura'),
    jsonb_build_object('rotulo', 'Quantidade de cabos', 'tipo', 'numero', 'unidade', 'm')
  ));
  execute 'reset role';
  if (select count(*) from public.checklist_modelo_itens where modelo_id = v_modelo) = 7
     and exists (select 1 from public.checklist_modelo_itens
                  where modelo_id = v_modelo and ordem = 4 and tipo = 'medicao'
                    and unidade = 'V' and valor_min = 110 and valor_max = 240)
     and exists (select 1 from public.checklist_modelo_itens
                  where modelo_id = v_modelo and ordem = 2 and depende_de_ordem = 1 and condicao_valor = 'true')
     and exists (select 1 from public.checklist_modelo_itens where modelo_id = v_modelo and ordem = 7 and unidade is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   modelo grava hora, medição (unidade e faixa), assinatura e condição';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA gravação do modelo avançado'; end if;

  -- ---------------- condições inválidas ----------------
  execute 'set local role authenticated';
  begin
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Condição adiante'), jsonb_build_array(
      jsonb_build_object('rotulo', 'Depende do próximo', 'tipo', 'texto', 'depende_de_ordem', 2, 'condicao_valor', 'true'),
      jsonb_build_object('rotulo', 'Tem dano?', 'tipo', 'checkbox')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou condição apontando para item abaixo';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   condição só aponta para um item acima';
  end;

  begin
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Condição em texto'), jsonb_build_array(
      jsonb_build_object('rotulo', 'Observação', 'tipo', 'texto'),
      jsonb_build_object('rotulo', 'Foto', 'tipo', 'foto', 'depende_de_ordem', 1, 'condicao_valor', 'algo')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou condição sobre item de texto';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   condição só vale sobre caixa de seleção ou lista';
  end;

  begin
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Condição fora da lista'), jsonb_build_array(
      jsonb_build_object('rotulo', 'Gravidade', 'tipo', 'selecao', 'opcoes', jsonb_build_array('Baixa', 'Alta')),
      jsonb_build_object('rotulo', 'Foto', 'tipo', 'foto', 'depende_de_ordem', 1, 'condicao_valor', 'Média')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou condição com valor fora das opções';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o valor da condição precisa ser uma das opções da lista';
  end;
  execute 'reset role';

  -- ---------------- plano sem checklists avançados ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Com hora'), jsonb_build_array(
      jsonb_build_object('rotulo', 'Hora', 'tipo', 'hora')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA plano Start criou item de hora';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   hora/medição/assinatura exigem a feature do plano';
  end;

  begin
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Com condição'), jsonb_build_array(
      jsonb_build_object('rotulo', 'Tem dano?', 'tipo', 'checkbox'),
      jsonb_build_object('rotulo', 'Foto', 'tipo', 'foto', 'depende_de_ordem', 1, 'condicao_valor', 'true')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA plano Start criou item condicional';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item condicional exige a feature do plano';
  end;

  v_modelo2 := public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Básico'), jsonb_build_array(
    jsonb_build_object('rotulo', 'Testou?', 'tipo', 'checkbox')));
  execute 'reset role';
  if v_modelo2 is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   plano sem a feature continua criando checklist comum';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA checklist comum no plano Start'; end if;

  -- ---------------- aplicar na OS ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_chk := public.aplicar_checklist_os(v_os, v_modelo);
  v_chk2 := public.aplicar_checklist_os(v_os2, v_modelo);
  execute 'reset role';
  select id into v_i1 from public.os_checklist_itens where checklist_id = v_chk and ordem = 1;
  select id into v_i2 from public.os_checklist_itens where checklist_id = v_chk and ordem = 2;
  select id into v_i3 from public.os_checklist_itens where checklist_id = v_chk and ordem = 3;
  select id into v_i4 from public.os_checklist_itens where checklist_id = v_chk and ordem = 4;
  select id into v_i5 from public.os_checklist_itens where checklist_id = v_chk and ordem = 5;
  select id into v_i6 from public.os_checklist_itens where checklist_id = v_chk and ordem = 6;
  select id into v_i7 from public.os_checklist_itens where checklist_id = v_chk and ordem = 7;
  if exists (select 1 from public.os_checklist_itens
              where id = v_i4 and unidade = 'V' and valor_min = 110 and valor_max = 240)
     and exists (select 1 from public.os_checklist_itens
                  where id = v_i2 and depende_de_ordem = 1 and condicao_valor = 'true') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   aplicar o modelo copia unidade, faixa e condição para a OS';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cópia do modelo para a OS'; end if;

  -- ---------------- visibilidade inicial ----------------
  execute 'set local role authenticated';
  v_json := public.checklists_os(v_os);
  execute 'reset role';
  v_itens := v_json->0->'itens';
  if (v_itens->0->>'visivel')::boolean
     and not (v_itens->1->>'visivel')::boolean
     and not (v_itens->2->>'visivel')::boolean
     and (v_json->0->>'pendentes')::int = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item condicional nasce escondido e não conta como pendência';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA visibilidade inicial (pendentes=%s)', v_json->0->>'pendentes'); end if;

  execute 'set local role authenticated';
  begin
    perform public.responder_item_checklist(v_i2, jsonb_build_object('valor', 'Alta'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA respondeu item escondido';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item escondido não aceita resposta';
  end;
  execute 'reset role';

  -- ---------------- a condição abre e fecha ----------------
  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i1, jsonb_build_object('valor', true));
  v_json := public.checklists_os(v_os);
  execute 'reset role';
  v_itens := v_json->0->'itens';
  if (v_itens->1->>'visivel')::boolean and not (v_itens->2->>'visivel')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   responder o item pai revela o item condicional';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA revelar item condicional'; end if;

  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i2, jsonb_build_object('valor', 'Alta'));
  perform public.responder_item_checklist(v_i3, jsonb_build_object('valor', 'Troca do conector'));
  v_json := public.checklists_os(v_os);
  execute 'reset role';
  v_itens := v_json->0->'itens';
  if (v_itens->2->>'visivel')::boolean and (v_itens->2->>'respondido')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   condição encadeada (item 3 depende do item 2) funciona';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA condição encadeada'; end if;

  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i2, jsonb_build_object('valor', 'Baixa'));
  execute 'reset role';
  if exists (select 1 from public.os_checklist_itens where id = v_i3 and valor_texto is null and respondido_em is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   trocar a resposta do pai apaga a resposta do item que sumiu';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA resposta órfã do item escondido'; end if;

  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i1, jsonb_build_object('valor', false));
  execute 'reset role';
  if exists (select 1 from public.os_checklist_itens where id = v_i2 and valor_opcao is null and respondido_em is null)
     and exists (select 1 from public.os_checklist_itens where id = v_i3 and respondido_em is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   esconder o item do meio leva junto o que dependia dele';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA encadeamento ao esconder'; end if;

  -- ---------------- hora ----------------
  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i5, jsonb_build_object('valor', '14:30'));
  begin
    perform public.responder_item_checklist(v_i5, jsonb_build_object('valor', 'depois do almoço'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou hora inválida';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   hora inválida é recusada';
  end;
  execute 'reset role';
  if exists (select 1 from public.os_checklist_itens where id = v_i5 and valor_hora = '14:30'::time) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item de hora grava o horário';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA gravação da hora'; end if;

  -- ---------------- medição ----------------
  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i4, jsonb_build_object('valor', 220));
  v_json := public.checklists_os(v_os);
  execute 'reset role';
  if not ((v_json->0->'itens'->3->>'fora_faixa')::boolean)
     and (v_json->0->'itens'->3->>'valor_numero')::numeric = 220 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   medição dentro da faixa é aceita sem alerta';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA medição dentro da faixa'; end if;

  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i4, jsonb_build_object('valor', 300));
  v_json := public.checklists_os(v_os);
  begin
    perform public.responder_item_checklist(v_i4, jsonb_build_object('valor', 'muito alta'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA medição aceitou texto';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   medição só aceita número';
  end;
  execute 'reset role';
  if (v_json->0->'itens'->3->>'fora_faixa')::boolean
     and (v_json->0->'itens'->3->>'valor_numero')::numeric = 300 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   medição fora da faixa é gravada e sinalizada (não bloqueia)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA medição fora da faixa'; end if;

  -- ---------------- assinatura ----------------
  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i6, jsonb_build_object('valor', v_anexo::text));
  begin
    perform public.responder_item_checklist(v_i6, jsonb_build_object('valor', v_anexo_b::text));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA assinatura aceitou imagem de outra OS';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   assinatura só aceita imagem anexada nesta OS';
  end;
  execute 'reset role';
  if exists (select 1 from public.os_checklist_itens where id = v_i6 and anexo_id = v_anexo) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item de assinatura guarda a imagem da OS';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA gravação da assinatura'; end if;

  -- ---------------- quem pode responder ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.responder_item_checklist(
    (select id from public.os_checklist_itens where checklist_id = v_chk2 and ordem = 1),
    jsonb_build_object('valor', true));
  execute 'reset role';
  if exists (select 1 from public.os_checklist_itens
              where checklist_id = v_chk2 and ordem = 1 and valor_booleano and respondido_por = v_campo_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem tem checklists.fill responde sem precisar editar a OS';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA resposta com checklists.fill'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_leitor_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.responder_item_checklist(v_i7, jsonb_build_object('valor', 3));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA quem só lê respondeu o checklist';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem só consulta não responde o checklist';
  end;
  execute 'reset role';

  -- ---------------- outra empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.responder_item_checklist(v_i7, jsonb_build_object('valor', 3));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B respondeu checklist da empresa A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não responde checklist da empresa A';
  end;
  begin
    perform public.checklists_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B leu o checklist da empresa A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê o checklist da empresa A';
  end;
  select count(*) into v_n from public.os_checklist_itens;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a RLS esconde os itens da outra empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa B enxerga %s itens', v_n); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.checklists_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu o checklist';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê nem responde checklist';
  end;
  execute 'reset role';

  -- ---------------- finalizar ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.alterar_status_os(v_os, v_st_fim);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA finalizou com obrigatório visível em aberto';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   obrigatório visível em aberto bloqueia a finalização';
  end;

  -- item 1 marcado e gravidade Baixa: o item 3 (obrigatório) fica escondido
  perform public.responder_item_checklist(v_i1, jsonb_build_object('valor', true));
  perform public.responder_item_checklist(v_i2, jsonb_build_object('valor', 'Baixa'));
  perform public.responder_item_checklist(v_i7, jsonb_build_object('valor', 3));
  v_json := public.alterar_status_os(v_os, v_st_fim);
  execute 'reset role';
  if (v_json->>'alterado')::boolean
     and exists (select 1 from public.os_checklist_itens where id = v_i3 and respondido_em is null and obrigatorio) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   obrigatório escondido pela condição não impede finalizar';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA finalização com obrigatório escondido'; end if;

  if exists (select 1 from public.log_eventos
              where acao = 'os_checklist_concluido' and detalhes->>'checklist_id' = v_chk::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   checklist completo (contando só o visível) gera o evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento de checklist concluído'; end if;

  -- ---------------- OS encerrada ----------------
  execute 'set local role authenticated';
  begin
    perform public.responder_item_checklist(v_i7, jsonb_build_object('valor', 3));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA respondeu checklist de OS encerrada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada não aceita mais resposta';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
