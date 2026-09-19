-- =====================================================================
-- Teste de linha do tempo, anexos e checklists da OS (Fase 2 · 15 a 18)
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
  v_fin_a uuid := gen_random_uuid();
  v_cli uuid; v_cli_b uuid;
  v_os uuid; v_os2 uuid; v_os_b uuid;
  v_pr_alta uuid; v_st_fin uuid;
  v_caminho text; v_caminho_orfao text; v_caminho_grande text;
  v_anexo uuid; v_anexo_removido uuid;
  v_modelo uuid; v_modelo2 uuid; v_checklist uuid; v_checklist2 uuid;
  v_item_check uuid; v_item_sel uuid; v_item_num uuid; v_item_foto uuid; v_item_texto uuid; v_item_data uuid;
  v_n int;
  v_txt text;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a, v_tec_a, v_fin_a]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_a, v_loja_a, 'Técnico A', 'tc@teste.invalid', 'funcionario'),
    (v_fin_a, v_loja_a, 'Financeiro A', 'fi@teste.invalid', 'funcionario');
  update public.usuarios u set cargo_id = c.id
    from public.cargos c
   where c.loja_id = v_loja_a
     and ((u.id = v_tec_a and c.chave = 'technician') or (u.id = v_fin_a and c.chave = 'finance'));
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_pr_alta from public.prioridades_os where loja_id = v_loja_a and chave = 'alta';
  select id into v_st_fin from public.status_os where loja_id = v_loja_a and chave = 'finalizada';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, titulo, descricao) values (v_loja_a, v_cli, 'Instalação', 'Instalar DVR')
    returning id into v_os;
  insert into public.ordens_servico (loja_id, cliente_id, titulo, descricao) values (v_loja_a, v_cli, 'Visita', 'Visita técnica')
    returning id into v_os2;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, descricao) values (v_loja_b, v_cli_b, 'OS B') returning id into v_os_b;
  execute 'reset role';

  v_caminho := v_loja_a || '/' || v_os || '/foto-portaria.jpg';
  v_caminho_orfao := v_loja_a || '/' || v_os || '/orfao.pdf';
  v_caminho_grande := v_loja_a || '/' || v_os || '/grande.jpg';

  -- ---------------- Storage ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('os-anexos', v_caminho, v_owner_a, v_owner_a::text, '{"size": 2048, "mimetype": "image/jpeg"}'),
         ('os-anexos', v_caminho_orfao, v_owner_a, v_owner_a::text, '{"size": 1024, "mimetype": "application/pdf"}');
  execute 'reset role';
  v_ok := v_ok + 1; v_log := v_log || E'\n  ok   upload na pasta de uma OS da própria empresa aceito';

  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('os-anexos', v_loja_b || '/' || v_os_b || '/forjado.jpg', v_owner_a, v_owner_a::text, '{"size": 10, "mimetype": "image/jpeg"}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA upload na pasta de OS da empresa B aceito';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   upload na pasta de OS da empresa B → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('os-anexos', v_loja_a || '/' || gen_random_uuid() || '/x.jpg', v_owner_a, v_owner_a::text, '{"size": 10, "mimetype": "image/jpeg"}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA upload para OS inexistente aceito';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   upload em pasta de OS inexistente → negado';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_fin_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('os-anexos', v_loja_a || '/' || v_os || '/financeiro.jpg', v_fin_a, v_fin_a::text, '{"size": 10, "mimetype": "image/jpeg"}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo só leitura enviou arquivo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem service_orders.edit não envia arquivos';
  end;
  execute 'reset role';

  -- ---------------- Anexos ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.os_anexos (loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes)
  values (v_loja_a, v_os, 'documento', 'antes', '  Portaria   antes.jpg ', v_caminho, 'application/pdf', 1)
  returning id into v_anexo;
  execute 'reset role';
  if exists (select 1 from public.os_anexos where id = v_anexo and tipo = 'foto' and momento = 'antes' and tamanho_bytes = 2048
             and mime_type = 'image/jpeg' and nome_arquivo = 'Portaria antes.jpg' and enviado_por = v_atend_a)
     and exists (select 1 from public.log_eventos where acao = 'os_anexo_adicionado' and detalhes->>'anexo_id' = v_anexo::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anexo usa tipo, formato e tamanho reais do Storage e registra evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA registro do anexo'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os, 'foto', 'fantasma.jpg', v_loja_a || '/' || v_os || '/fantasma.jpg', 'image/jpeg', 10);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anexo sem arquivo no Storage aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anexo sem arquivo enviado → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os2, 'foto', 'outra.jpg', v_caminho, 'image/jpeg', 10);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA arquivo de outra OS vinculado';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   arquivo da pasta de outra OS não é vinculado';
  end;
  execute 'reset role';

  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('os-anexos', v_caminho_grande, v_atend_a, v_atend_a::text, '{"size": 15000000, "mimetype": "image/jpeg"}');
  begin
    execute 'set local role authenticated';
    insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os, 'foto', 'grande.jpg', v_caminho_grande, 'image/jpeg', 100);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA foto acima de 10 MB aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   foto acima de 10 MB → negada (tamanho real do Storage)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.os_anexos set nome_arquivo = 'renomeado.jpg' where id = v_anexo;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anexo alterado';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anexo não pode ser alterado';
  end;
  execute 'reset role';

  -- anexo extra para testar remoção lógica
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('os-anexos', v_loja_a || '/' || v_os || '/laudo.pdf', v_atend_a, v_atend_a::text, '{"size": 5000, "mimetype": "application/pdf"}');
  execute 'set local role authenticated';
  insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
  values (v_loja_a, v_os, 'documento', 'laudo.pdf', v_loja_a || '/' || v_os || '/laudo.pdf', 'application/pdf', 1)
  returning id into v_anexo_removido;
  update public.os_anexos set removido_em = now() where id = v_anexo_removido;
  delete from public.os_anexos where id = v_anexo;
  get diagnostics v_n = row_count;
  v_json := public.anexos_os(v_os);
  execute 'reset role';
  if v_n = 0 and exists (select 1 from public.os_anexos where id = v_anexo_removido and removido_em is not null and removido_por = v_atend_a)
     and jsonb_array_length(v_json) = 1 and v_json->0->>'enviado_por' = 'Atendente A'
     and exists (select 1 from public.log_eventos where acao = 'os_anexo_removido' and detalhes->>'anexo_id' = v_anexo_removido::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   remoção lógica registrada; exclusão definitiva bloqueada';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA remoção de anexo: apagou %s, lista %s', v_n, v_json); end if;

  begin
    execute 'set local role authenticated';
    update public.os_anexos set removido_em = now() where id = v_anexo_removido;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anexo removido duas vezes';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anexo removido não é reativado nem removido de novo';
  end;
  execute 'reset role';

  -- arquivo órfão (sem registro) pode ser apagado por quem enviou; arquivo vinculado não
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from storage.objects where bucket_id = 'os-anexos' and name = v_caminho_orfao;
  get diagnostics v_n = row_count;
  delete from storage.objects where bucket_id = 'os-anexos' and name = v_caminho;
  get diagnostics v_txt = row_count;
  execute 'reset role';
  if v_n = 1 and v_txt = '0' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   arquivo órfão apagável pelo autor; arquivo de anexo preservado';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA limpeza de órfão: %s / %s', v_n, v_txt); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_fin_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.anexos_os(v_os);
  select count(*) into v_n from storage.objects where bucket_id = 'os-anexos' and name = v_caminho;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.os_anexos (loja_id, os_id, tipo, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os, 'foto', 'x.jpg', v_caminho_grande, 'image/jpeg', 1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo só leitura anexou';
  exception when insufficient_privilege then
    if jsonb_array_length(v_json) = 1 and v_n = 1 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo só leitura vê e baixa anexos, mas não anexa';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA leitura do financeiro: %s / %s', v_json, v_n); end if;
  end;
  execute 'reset role';

  -- ---------------- Histórico imutável e linha do tempo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.os_observacoes (os_id, usuario_id, texto) values (v_os, v_atend_a, '  Cliente pediu instalação à tarde ');
  update public.os_observacoes set texto = 'alterado' where os_id = v_os;
  get diagnostics v_n = row_count;
  delete from public.os_observacoes where os_id = v_os;
  get diagnostics v_txt = row_count;
  execute 'reset role';
  if v_n = 0 and v_txt = '0' and exists (select 1 from public.os_observacoes where os_id = v_os and texto = 'Cliente pediu instalação à tarde') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   comentário gravado; não pode ser editado nem apagado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA imutabilidade dos comentários'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (v_loja_a, v_atend_a, 'os_status_alterado', jsonb_build_object('os_id', v_os));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento forjado inserido';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   eventos não podem ser inseridos pelo usuário (só pelo banco)';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_fin_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.os_observacoes (os_id, usuario_id, texto) values (v_os, v_fin_a, 'comentário do financeiro');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo só leitura comentou';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo só leitura não comenta';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.ordens_servico set prioridade_id = v_pr_alta where id = v_os;
  v_json := public.timeline_os(v_os);
  execute 'reset role';
  if v_json @> '[{"acao":"os_criada","usuario":"Owner A"}]'
     and v_json @> '[{"acao":"os_anexo_adicionado","usuario":"Atendente A","dados":{"arquivo":"Portaria antes.jpg","tipo_anexo":"foto"}}]'
     and v_json @> '[{"acao":"os_anexo_removido","dados":{"arquivo":"laudo.pdf"}}]'
     and v_json @> '[{"acao":"os_comentario","dados":{"texto":"Cliente pediu instalação à tarde"}}]'
     and v_json @> '[{"acao":"os_prioridade_alterada","dados":{"prioridade_de":"Normal","prioridade_para":"Alta"}}]'
     and v_json->-1->>'acao' = 'os_criada' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   linha do tempo com criação, anexos, comentário e prioridade (nomes resolvidos)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA linha do tempo: %s', v_json); end if;

  -- ---------------- Checklists: modelos ----------------
  execute 'set local role authenticated';
  v_modelo := public.salvar_checklist_modelo(null, null,
    jsonb_build_object('nome', '  Instalação   de CFTV ', 'descricao', 'Conferência final'),
    jsonb_build_array(
      jsonb_build_object('rotulo', 'Equipamento testado', 'tipo', 'checkbox', 'obrigatorio', true),
      jsonb_build_object('rotulo', 'Condição da fiação', 'tipo', 'selecao', 'opcoes', jsonb_build_array('Boa', ' Regular ', 'Boa', 'Ruim')),
      jsonb_build_object('rotulo', 'Quantidade de câmeras', 'tipo', 'numero', 'obrigatorio', true),
      jsonb_build_object('rotulo', 'Foto do rack', 'tipo', 'foto', 'obrigatorio', true),
      jsonb_build_object('rotulo', 'Observações', 'tipo', 'texto'),
      jsonb_build_object('rotulo', 'Próxima revisão', 'tipo', 'data')
    ));
  execute 'reset role';
  if exists (select 1 from public.checklist_modelos where id = v_modelo and nome = 'Instalação de CFTV')
     and (select count(*) from public.checklist_modelo_itens where modelo_id = v_modelo) = 6
     and (select opcoes from public.checklist_modelo_itens where modelo_id = v_modelo and ordem = 2) = array['Boa', 'Regular', 'Ruim'] then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   modelo criado com 6 itens; opções sem repetição e na ordem informada';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA criação do modelo'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Ruim'),
      jsonb_build_array(jsonb_build_object('rotulo', 'Escolha', 'tipo', 'selecao', 'opcoes', jsonb_build_array('Única'))));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA seleção com uma opção aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item de seleção exige ao menos duas opções';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Do atendente'),
      jsonb_build_array(jsonb_build_object('rotulo', 'Item', 'tipo', 'texto')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente criou modelo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   modelos exigem settings.manage';
  end;
  execute 'reset role';

  -- ---------------- Checklists: aplicar e responder ----------------
  execute 'set local role authenticated';
  v_checklist := public.aplicar_checklist_os(v_os, v_modelo);
  execute 'reset role';
  select id into v_item_check from public.os_checklist_itens where checklist_id = v_checklist and ordem = 1;
  select id into v_item_sel from public.os_checklist_itens where checklist_id = v_checklist and ordem = 2;
  select id into v_item_num from public.os_checklist_itens where checklist_id = v_checklist and ordem = 3;
  select id into v_item_foto from public.os_checklist_itens where checklist_id = v_checklist and ordem = 4;
  select id into v_item_texto from public.os_checklist_itens where checklist_id = v_checklist and ordem = 5;
  select id into v_item_data from public.os_checklist_itens where checklist_id = v_checklist and ordem = 6;
  if (select count(*) from public.os_checklist_itens where checklist_id = v_checklist) = 6
     and exists (select 1 from public.log_eventos where acao = 'os_checklist_aplicado' and detalhes->>'checklist_id' = v_checklist::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   checklist aplicado na OS (cópia dos itens) com evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aplicação do checklist'; end if;

  begin
    execute 'set local role authenticated';
    perform public.aplicar_checklist_os(v_os, v_modelo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA mesmo checklist aplicado duas vezes';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mesmo modelo não é aplicado duas vezes na OS';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.salvar_checklist_modelo(v_modelo, 1, jsonb_build_object('nome', 'Instalação de CFTV'),
    jsonb_build_array(jsonb_build_object('rotulo', 'Item novo', 'tipo', 'texto')));
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.salvar_checklist_modelo(v_modelo, 1, jsonb_build_object('nome', 'Versão antiga'),
      jsonb_build_array(jsonb_build_object('rotulo', 'Item', 'tipo', 'texto')));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão antiga do modelo sobrescreveu';
  exception when serialization_failure then
    if (select count(*) from public.os_checklist_itens where checklist_id = v_checklist) = 6 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   editar o modelo não altera checklist já aplicado; versão antiga → conflito';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA checklist aplicado mudou com o modelo'; end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.responder_item_checklist(v_item_check, jsonb_build_object('valor', 'sim'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA texto aceito em caixa de seleção';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   resposta com tipo errado → negada';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.responder_item_checklist(v_item_sel, jsonb_build_object('valor', 'Ótima'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA opção inexistente aceita';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   opção fora da lista → negada';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.responder_item_checklist(v_item_foto, jsonb_build_object('valor', v_anexo_removido));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA documento/removido aceito como foto';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item de foto só aceita foto ativa desta OS';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_item_check, jsonb_build_object('valor', true));
  perform public.responder_item_checklist(v_item_sel, jsonb_build_object('valor', 'Regular'));
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os, v_st_fin);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS finalizada com checklist obrigatório pendente';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   finalizar exige os itens obrigatórios do checklist';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_item_num, jsonb_build_object('valor', 8));
  perform public.responder_item_checklist(v_item_foto, jsonb_build_object('valor', v_anexo));
  perform public.responder_item_checklist(v_item_texto, jsonb_build_object('valor', '  Rack organizado '));
  v_json := public.responder_item_checklist(v_item_data, jsonb_build_object('valor', '2027-03-01'));
  perform public.alterar_status_os(v_os, v_st_fin);
  execute 'reset role';
  if (v_json->>'checklist_completo')::boolean
     and exists (select 1 from public.os_checklist_itens where id = v_item_texto and valor_texto = 'Rack organizado' and respondido_por = v_tec_a)
     and (select count(*) from public.log_eventos where acao = 'os_checklist_concluido' and detalhes->>'checklist_id' = v_checklist::text) = 1
     and exists (select 1 from public.ordens_servico where id = v_os and concluido_em is not null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   checklist completo (evento único) e OS finalizada';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA conclusão: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    perform public.responder_item_checklist(v_item_texto, jsonb_build_object('valor', 'depois de finalizar'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA checklist alterado com OS encerrada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada não altera respostas do checklist';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.checklists_os(v_os);
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->'itens'->3->'anexo'->>'nome_arquivo' = 'Portaria antes.jpg'
     and v_json->0->'itens'->0->>'respondido_por' = 'Técnico A' and (v_json->0->'itens'->2->>'valor_numero')::int = 8 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   consulta do checklist com respostas, foto e autor';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA consulta do checklist: %s', v_json); end if;

  -- remoção e exclusão
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_modelo2 := public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Visita'),
    jsonb_build_array(jsonb_build_object('rotulo', 'Cliente presente', 'tipo', 'checkbox')));
  v_checklist2 := public.aplicar_checklist_os(v_os2, v_modelo2);
  perform public.remover_checklist_os(v_checklist2);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.excluir_checklist_modelo(v_modelo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA modelo usado excluído';
  exception when foreign_key_violation then
    execute 'reset role';
    execute 'set local role authenticated';
    perform public.excluir_checklist_modelo(v_modelo2);
    if exists (select 1 from public.log_eventos where acao = 'os_checklist_removido' and detalhes->>'os_id' = v_os2::text)
       and not exists (select 1 from public.checklist_modelos where id = v_modelo2) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   checklist sem respostas removido; modelo usado só desativa, não usado exclui';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA remoção/exclusão de checklist'; end if;
  end;
  execute 'reset role';

  -- opções longas e atividade recente (fase2_18)
  begin
    execute 'set local role authenticated';
    perform public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Opção longa'),
      jsonb_build_array(jsonb_build_object('rotulo', 'Item', 'tipo', 'selecao', 'opcoes', jsonb_build_array('ok', repeat('a', 101)))));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA opção com mais de 100 caracteres aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   opção de lista com mais de 100 caracteres → negada';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.dashboard_atividade(50);
  execute 'reset role';
  if v_json @> '[{"acao":"os_anexo_adicionado","arquivo":"Portaria antes.jpg"}]'
     and v_json @> '[{"acao":"os_checklist_concluido","checklist":"Instalação de CFTV"}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atividade recente mostra arquivo e checklist';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atividade recente: %s', v_json); end if;

  -- ---------------- Empresa B ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.os_anexos where loja_id = v_loja_a;
  select v_n + count(*) into v_n from storage.objects where bucket_id = 'os-anexos' and name like v_loja_a || '/%';
  select v_n + count(*) into v_n from public.os_checklist_itens where loja_id = v_loja_a;
  select v_n + count(*) into v_n from public.checklist_modelos where loja_id = v_loja_a;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê anexos, arquivos nem checklists de A';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA B lê %s registros de A', v_n); end if;

  begin
    execute 'set local role authenticated';
    perform public.timeline_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B leu linha do tempo de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não lê linha do tempo de OS de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.responder_item_checklist(v_item_texto, jsonb_build_object('valor', 'invadido'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B respondeu checklist de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não responde checklist de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.aplicar_checklist_os(v_os_b, v_modelo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B aplicou modelo de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não aplica modelo de checklist de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.anexos_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B listou anexos de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não lista anexos de OS de A';
  end;
  execute 'reset role';

  -- ---------------- Anônimo e exclusão da empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.timeline_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu linha do tempo';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa linha do tempo';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.os_anexos where loja_id = v_loja_a)
       and not exists (select 1 from public.checklist_modelos where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove anexos, checklists e modelos';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dados restaram após excluir a empresa'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
