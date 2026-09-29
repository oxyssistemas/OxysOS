-- =====================================================================
-- Teste da sincronização do modo offline (Fase 3 · 31 — etapa 18)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre idempotência (mesma chave não aplica de novo nem repete evento; foto
-- com o mesmo id não duplica), conflito no checklist (versão vista × atual) e
-- resolução explícita, conflito por campo no diagnóstico (aplica o resto),
-- chave por usuário, feature offline_mode do plano, OS encerrada, técnico de
-- fora, outra empresa, tabela fechada e a exclusão da empresa.
-- =====================================================================
do $$
declare
  v_plano uuid; v_feature uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_carlos uuid := gen_random_uuid();
  v_bruno uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid;
  v_cli uuid; v_st uuid; v_st_canc uuid;
  v_os uuid; v_ag uuid; v_modelo uuid; v_chk uuid; v_i1 uuid; v_i2 uuid;
  v_k1 uuid := gen_random_uuid(); v_k2 uuid := gen_random_uuid(); v_k3 uuid := gen_random_uuid();
  v_k4 uuid := gen_random_uuid(); v_k5 uuid := gen_random_uuid();
  v_anexo uuid := gen_random_uuid();
  v_json jsonb; v_json2 jsonb; v_base timestamptz; v_txt text; v_n int; v_m int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  select id into v_feature from public.funcionalidades where key = 'offline_mode';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_carlos, v_bruno, v_owner_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_carlos, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_bruno, v_loja_a, 'Bruno', 'br@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id in (v_carlos, v_bruno);
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_carlos) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Bruno', 'Lima', v_bruno) returning id into v_t2;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_canc from public.status_os where loja_id = v_loja_a and chave = 'cancelada';
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'Manutenção') returning id into v_os;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os, v_t1, now(), now() + interval '1 hour') returning id into v_ag;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_modelo := public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Entrega'), jsonb_build_array(
    jsonb_build_object('rotulo', 'Testou?', 'tipo', 'checkbox'),
    jsonb_build_object('rotulo', 'Observação', 'tipo', 'texto')));
  v_chk := public.aplicar_checklist_os(v_os, v_modelo);
  execute 'reset role';
  select id into v_i1 from public.os_checklist_itens where checklist_id = v_chk and ordem = 1;
  select id into v_i2 from public.os_checklist_itens where checklist_id = v_chk and ordem = 2;

  -- ---------------- contexto ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  execute 'reset role';
  if (v_json->>'offline')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   contexto do portal informa que o plano tem modo offline';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA contexto offline: %s', v_json->'offline'); end if;

  -- ---------------- checklist: aplica uma vez só ----------------
  select count(*) into v_n from public.log_eventos where detalhes->>'os_id' = v_os::text;
  execute 'set local role authenticated';
  v_json := public.sincronizar_resposta_checklist(v_k1, v_i1, jsonb_build_object('valor', true), null);
  v_json2 := public.sincronizar_resposta_checklist(v_k1, v_i1, jsonb_build_object('valor', true), null);
  execute 'reset role';
  select count(*) into v_m from public.log_eventos where detalhes->>'os_id' = v_os::text;
  if v_json->>'status' = 'aplicado' and not coalesce((v_json->>'repetida')::boolean, false)
     and v_json2->>'status' = 'aplicado' and (v_json2->>'repetida')::boolean
     and exists (select 1 from public.os_checklist_itens where id = v_i1 and valor_booleano and respondido_por = v_carlos)
     and (select count(*) from public.sync_operacoes where usuario_id = v_carlos) = 1
     and v_m - v_n <= 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   resposta offline aplicada; reenviar a mesma chave devolve o resultado sem aplicar de novo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA idempotência do checklist: %s / %s (eventos +%s)', v_json, v_json2, v_m - v_n); end if;

  -- ---------------- checklist: conflito e resolução explícita ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_i2, jsonb_build_object('valor', 'Anotado pelo escritório'));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.sincronizar_resposta_checklist(v_k2, v_i2, jsonb_build_object('valor', 'Anotado em campo'), null);
  execute 'reset role';
  if v_json->>'status' = 'conflito' and v_json->'servidor'->>'valor_texto' = 'Anotado pelo escritório'
     and v_json->'servidor'->>'respondido_por' = 'Owner A'
     and exists (select 1 from public.os_checklist_itens where id = v_i2 and valor_texto = 'Anotado pelo escritório') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   checklist mudado no escritório enquanto o técnico estava offline → conflito, nada sobrescrito';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA conflito do checklist: %s', v_json); end if;

  v_base := (v_json->'servidor'->>'respondido_em')::timestamptz;
  execute 'set local role authenticated';
  v_json := public.sincronizar_resposta_checklist(v_k3, v_i2, jsonb_build_object('valor', 'Anotado em campo'), v_base);
  execute 'reset role';
  if v_json->>'status' = 'aplicado'
     and exists (select 1 from public.os_checklist_itens where id = v_i2 and valor_texto = 'Anotado em campo' and respondido_por = v_carlos) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico escolhe a própria versão reenviando com a versão atual do servidor';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA resolução do conflito: %s', v_json); end if;

  -- chave é por usuário: a de Carlos não vale para Bruno. Uma chave compartilhada
  -- devolveria o resultado guardado antes de qualquer checagem; como a OS não é do
  -- escopo de Bruno (fase3_34), o item nem é localizado — e nada do conflito vaza.
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    v_json := public.sincronizar_resposta_checklist(v_k1, v_i1, jsonb_build_object('valor', true), null);
    v_txt := format('respondeu %s', v_json);
  exception when no_data_found then
    v_txt := 'negado';
  end;
  execute 'reset role';
  if v_txt = 'negado' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a chave é por usuário e o item de OS de outro técnico não é localizado (nem no conflito)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA chave por usuário / escopo: %s', v_txt); end if;

  -- ---------------- diagnóstico: conflito por campo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.ordens_servico set solucao = 'Troca feita pelo escritório' where id = v_os;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.log_eventos where acao = 'os_atualizada' and detalhes->>'os_id' = v_os::text;
  execute 'set local role authenticated';
  v_json := public.sincronizar_atendimento_campo(v_k4, v_ag,
    jsonb_build_object('diagnostico', 'Filtro entupido', 'solucao', 'Limpeza do filtro'),
    jsonb_build_object('diagnostico', null, 'solucao', null));
  v_json2 := public.sincronizar_atendimento_campo(v_k4, v_ag,
    jsonb_build_object('diagnostico', 'Filtro entupido', 'solucao', 'Limpeza do filtro'),
    jsonb_build_object('diagnostico', null, 'solucao', null));
  execute 'reset role';
  select count(*) into v_m from public.log_eventos where acao = 'os_atualizada' and detalhes->>'os_id' = v_os::text;
  if v_json->>'status' = 'parcial' and v_json->'aplicados' = '["diagnostico"]'::jsonb
     and v_json->'conflitos'->0->>'campo' = 'solucao' and v_json->'conflitos'->0->>'servidor' = 'Troca feita pelo escritório'
     and exists (select 1 from public.ordens_servico where id = v_os and diagnostico = 'Filtro entupido' and solucao = 'Troca feita pelo escritório') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   diagnóstico offline: aplica o campo livre e devolve como conflito o que o escritório mudou';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA conflito por campo: %s', v_json); end if;

  if (v_json2->>'repetida')::boolean and v_m - v_n = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reenvio do diagnóstico não gera evento repetido na linha do tempo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA reenvio do diagnóstico: %s eventos', v_m - v_n); end if;

  execute 'set local role authenticated';
  v_json := public.sincronizar_atendimento_campo(v_k5, v_ag,
    jsonb_build_object('solucao', 'Troca feita pelo escritório'), jsonb_build_object('solucao', null));
  execute 'reset role';
  if v_json->>'status' = 'aplicado' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mesmo valor dos dois lados não é conflito';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA valor igual: %s', v_json); end if;

  -- ---------------- foto: o id gerado no aparelho impede duplicata ----------------
  perform set_config('request.jwt.claims', '{}', true);
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
    ('os-anexos', v_loja_a || '/' || v_os || '/' || v_anexo || '.jpg', v_carlos, v_carlos::text, '{"size": 2048, "mimetype": "image/jpeg"}');
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.os_anexos (id, loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_anexo, v_loja_a, v_os, 'foto', 'depois', 'depois.jpg', v_loja_a || '/' || v_os || '/' || v_anexo || '.jpg', 'image/jpeg', 2048);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.os_anexos (id, loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes)
      values (v_anexo, v_loja_a, v_os, 'foto', 'depois', 'depois.jpg', v_loja_a || '/' || v_os || '/' || v_anexo || '.jpg', 'image/jpeg', 2048);
    v_txt := 'duplicou';
  exception when unique_violation then
    v_txt := 'barrado';
  end;
  execute 'reset role';
  if v_txt = 'barrado' and (select count(*) from public.os_anexos where os_id = v_os) = 1
     and (select count(*) from public.log_eventos where acao like 'os\_anexo\_%' and detalhes->>'os_id' = v_os::text) = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   reenviar a mesma foto (mesmo id) não duplica o anexo nem o evento';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA foto duplicada: %s', v_txt); end if;

  -- ---------------- técnico de fora / tabela fechada ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.sincronizar_atendimento_campo(gen_random_uuid(), v_ag, '{"diagnostico": "invasão"}', '{}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico de fora sincronizou diagnóstico';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico de fora do atendimento não sincroniza o diagnóstico';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.sync_operacoes;
  execute 'reset role';
  if v_n = 0 and (select count(*) from public.sync_operacoes where usuario_id = v_carlos) = 5 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a tabela de idempotência não é lida pelo cliente (só pelas funções)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA sync_operacoes visível: %s', v_n); end if;

  -- ---------------- plano sem offline_mode ----------------
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.empresa_feature_overrides (loja_id, funcionalidade_id, habilitado) values (v_loja_a, v_feature, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.contexto_tecnico();
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.sincronizar_resposta_checklist(gen_random_uuid(), v_i1, jsonb_build_object('valor', false), now());
    v_txt := 'passou';
  exception when insufficient_privilege then
    get stacked diagnostics v_txt = message_text;
  end;
  execute 'reset role';
  if not (v_json->>'offline')::boolean and v_json->>'situacao' = 'liberado' and v_txt like 'O modo offline não faz parte do plano%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem offline_mode no plano: portal continua, mas sem guardar dados nem sincronizar';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA feature offline: %s / %s', v_json->'offline', v_txt); end if;
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.empresa_feature_overrides where loja_id = v_loja_a and funcionalidade_id = v_feature;

  -- ---------------- OS encerrada: erro, e nada registrado ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os, v_st_canc, 'Cliente desistiu');
  execute 'reset role';
  select respondido_em into v_base from public.os_checklist_itens where id = v_i1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.sync_operacoes where usuario_id = v_carlos;
  begin
    execute 'set local role authenticated';
    perform public.sincronizar_resposta_checklist(gen_random_uuid(), v_i1, jsonb_build_object('valor', false), v_base);
    v_txt := 'passou';
  exception when others then
    v_txt := sqlstate;
  end;
  execute 'reset role';
  if v_txt in ('23514', '42501') and (select count(*) from public.sync_operacoes where usuario_id = v_carlos) = v_n
     and exists (select 1 from public.os_checklist_itens where id = v_i1 and valor_booleano) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada: a operação offline é recusada e não fica registrada como feita';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA OS encerrada: %s', v_txt); end if;

  -- ---------------- outra empresa, exposição, exclusão ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.sincronizar_resposta_checklist(gen_random_uuid(), v_i1, jsonb_build_object('valor', false), null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B sincronizou item de A';
  exception when insufficient_privilege or no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não sincroniza nada de A';
  end;
  execute 'reset role';

  if not has_function_privilege('authenticated', 'public.sync_resultado_anterior(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.sync_exigir_offline()', 'execute')
     and not has_function_privilege('anon', 'public.sincronizar_resposta_checklist(uuid, uuid, jsonb, timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.sincronizar_atendimento_campo(uuid, uuid, jsonb, jsonb)', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   funções internas fora da API; anon não sincroniza';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exposição das funções'; end if;

  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.sync_operacoes where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove o registro de sincronização';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA sync_operacoes restou'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception E'%\n\nTOTAL: % ok, % falhas (transação desfeita de propósito)', v_log, v_ok, v_falhas;
end;
$$;
