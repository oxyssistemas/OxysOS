-- =====================================================================
-- Teste da finalização da OS (Fase 3 · 26/27 — etapa 15)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre os requisitos configurados por tipo de serviço (checklist, diagnóstico,
-- fotos, assinatura, materiais) nos dois caminhos — "Finalizar atendimento" no
-- portal do técnico e "Alterar status" no Portal da Empresa —, a mensagem com o
-- que falta, a regra "não finaliza o que não começou", a visita de retorno sem
-- encerrar a OS, o diagnóstico em campo, permissões, empresa suspensa e o
-- isolamento entre empresas e entre técnicos.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_tec2_a uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_limitado_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_cargo_lim uuid;
  v_tipo uuid; v_modelo uuid; v_chk uuid; v_item uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid; v_st_fim uuid;
  v_os uuid; v_os2 uuid; v_os3 uuid; v_os_b uuid;
  v_ag uuid; v_ag2 uuid; v_ag3 uuid; v_ag_lim uuid;
  v_img text;
  v_json jsonb; v_txt text; v_n int; v_versao int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_tec_a, v_tec2_a, v_atend_a, v_limitado_a, v_owner_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_tec_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_tec2_a, v_loja_a, 'Bruno', 'br@teste.invalid', 'funcionario'),
    (v_atend_a, v_loja_a, 'Atendente', 'at@teste.invalid', 'funcionario'),
    (v_limitado_a, v_loja_a, 'Ana', 'an@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and ((u.id in (v_tec_a, v_tec2_a) and c.chave = 'technician') or (u.id = v_atend_a and c.chave = 'attendant'));
  -- cargo de campo que inicia mas não finaliza (sem technician.jobs.complete)
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Ajudante', 'Inicia, não finaliza', false) returning id into v_cargo_lim;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values
    (v_cargo_lim, 'service_orders.view'), (v_cargo_lim, 'technician.jobs.view'), (v_cargo_lim, 'technician.jobs.start');
  update public.usuarios set cargo_id = v_cargo_lim where id = v_limitado_a;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_tec_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Bruno', 'Lima', v_tec2_a) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Ana', 'Reis', v_limitado_a) returning id into v_t3;

  -- tipo de serviço com todos os requisitos ligados
  insert into public.tipos_servico (loja_id, nome, exige_diagnostico, exige_assinatura, exige_materiais, fotos_minimas)
    values (v_loja_a, 'Instalação completa', true, true, true, 1) returning id into v_tipo;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and chave = 'finalizada';
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tipo_servico_id)
    values (v_loja_a, v_cli, v_st, 'Instalação', v_tipo) returning id into v_os;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Visita técnica') returning id into v_os2;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tipo_servico_id)
    values (v_loja_a, v_cli, v_st, 'Instalação no balcão', v_tipo) returning id into v_os3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os, v_t1, now(), now() + interval '1 hour') returning id into v_ag;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os2, v_t1, now() + interval '2 hours', now() + interval '3 hours') returning id into v_ag2;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os3, v_t2, now() + interval '4 hours', now() + interval '5 hours') returning id into v_ag3;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os2, v_t3, now() + interval '6 hours', now() + interval '7 hours') returning id into v_ag_lim;

  -- checklist com um item obrigatório na OS 1
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_modelo := public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Entrega'), jsonb_build_array(
    jsonb_build_object('rotulo', 'Testou o equipamento?', 'tipo', 'checkbox', 'obrigatorio', true)));
  v_chk := public.aplicar_checklist_os(v_os, v_modelo);
  execute 'reset role';
  select id into v_item from public.os_checklist_itens where checklist_id = v_chk;

  -- ---------------- resumo e requisitos antes de começar ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.finalizacao_atendimento(v_ag);
  execute 'reset role';
  if jsonb_array_length(v_json->'requisitos') = 5 and (v_json->>'pendentes')::int = 5
     and not (v_json->>'pode_finalizar')::boolean and (v_json->>'pode_registrar')::boolean
     and v_json->>'estado_campo' = 'nao_iniciado' and (v_json->'checklist'->>'pendentes')::int = 1
     and v_json->'tipo_servico'->>'nome' = 'Instalação completa' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   resumo lista os 5 requisitos do tipo de serviço, todos pendentes, e não deixa finalizar antes de iniciar';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA resumo inicial: %s', v_json); end if;

  begin
    execute 'set local role authenticated';
    perform public.finalizar_atendimento_campo(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA finalizou atendimento que nunca começou';
  exception when check_violation then
    get stacked diagnostics v_txt = message_text;
    if v_txt like 'Inicie o atendimento%' then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   não finaliza atendimento que não foi iniciado (§20)';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA mensagem inesperada: %s', v_txt); end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.iniciar_deslocamento(v_ag);
  perform public.iniciar_atendimento_campo(v_ag);
  execute 'reset role';

  -- ---------------- tudo faltando: a mensagem diz exatamente o quê ----------------
  begin
    execute 'set local role authenticated';
    perform public.finalizar_atendimento_campo(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA finalizou com requisitos pendentes';
  exception when check_violation then
    get stacked diagnostics v_txt = message_text;
    if v_txt like 'Antes de finalizar:%' and v_txt like '%item obrigatório do checklist%' and v_txt like '%preencha o diagnóstico%'
       and v_txt like '%envie ao menos 1 foto%' and v_txt like '%colha a assinatura%' and v_txt like '%registre os materiais%' then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   finalizar bloqueado com a lista do que falta (checklist, diagnóstico, foto, assinatura, materiais)';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA mensagem de pendências: %s', v_txt); end if;
  end;
  execute 'reset role';
  if exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'em_atendimento' and status = 'em_andamento')
     and exists (select 1 from public.os_apontamentos where agendamento_id = v_ag and fim_em is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tentativa recusada não mexe no atendimento nem no relógio';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA tentativa recusada alterou o atendimento'; end if;

  -- ---------------- outro técnico / outro cargo / outra empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec2_a, 'role', 'authenticated')::text, true);
  v_n := 0;
  begin
    execute 'set local role authenticated';
    perform public.finalizacao_atendimento(v_ag);
  exception when no_data_found then v_n := v_n + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.finalizar_atendimento_campo(v_ag);
  exception when no_data_found then v_n := v_n + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.registrar_atendimento_campo(v_ag, '{"diagnostico": "invasão"}');
  exception when no_data_found then v_n := v_n + 1;
  end;
  execute 'reset role';
  if v_n = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico de fora do atendimento não lê, não registra e não finaliza';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA técnico de fora: %s bloqueios de 3', v_n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.finalizar_atendimento_campo(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente finalizou pelo portal do técnico';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente (sem portal do técnico) não usa a finalização de campo';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  v_n := 0;
  begin
    execute 'set local role authenticated';
    perform public.finalizacao_os(v_os);
  exception when no_data_found then v_n := v_n + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os, v_st_fim);
  exception when no_data_found then v_n := v_n + 1;
  end;
  execute 'reset role';
  if v_n = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê o resumo nem finaliza OS da empresa A';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento: %s bloqueios de 2', v_n); end if;

  -- ---------------- diagnóstico em campo (§36) ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  select versao into v_versao from public.ordens_servico where id = v_os;
  begin
    execute 'set local role authenticated';
    perform public.registrar_atendimento_campo(v_ag, '{"descricao": "trocar a descrição"}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico alterou campo fora do atendimento';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   registro em campo só aceita os campos do atendimento';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.registrar_atendimento_campo(v_ag, jsonb_build_object(
    'diagnostico', '  Compressor travado  ', 'causa', 'Falta de manutenção', 'recomendacao', 'Limpeza a cada 6 meses'));
  execute 'reset role';
  if v_json->>'diagnostico' = 'Compressor travado' and v_json->>'causa' = 'Falta de manutenção'
     and exists (select 1 from public.ordens_servico where id = v_os and versao = v_versao + 1
                   and recomendacao = 'Limpeza a cada 6 meses' and solucao is null and descricao = 'Instalação')
     and exists (select 1 from public.log_eventos where acao = 'os_atualizada' and detalhes->>'os_id' = v_os::text
                   and detalhes->'campos' ?& array['diagnostico', 'causa', 'recomendacao']
                   and usuario_id = v_tec_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico registra diagnóstico, causa e recomendação (versão e linha do tempo atualizadas)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA registro do diagnóstico: %s', v_json); end if;

  -- cargo de campo sem service_orders.edit: a tabela continua fechada, a função do portal
  -- libera só o registro do atendimento (o técnico padrão tem edit desde a fase 2)
  perform set_config('request.jwt.claims', json_build_object('sub', v_limitado_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.ordens_servico set solucao = 'direto', titulo = 'x' where id = v_os2;
  get diagnostics v_n = row_count;
  v_json := public.registrar_atendimento_campo(v_ag_lim, '{"solucao": "Troca do capacitor"}');
  execute 'reset role';
  if v_n = 0 and exists (select 1 from public.ordens_servico where id = v_os2 and solucao = 'Troca do capacitor' and titulo is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem service_orders.edit não edita a OS direto, mas registra a solução pelo portal';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA ajudante: %s linhas diretas, %s', v_n, v_json); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);

  -- ---------------- cumpre os requisitos um a um ----------------
  execute 'set local role authenticated';
  perform public.responder_item_checklist(v_item, jsonb_build_object('valor', true));
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario, unidade)
    values (v_os, 'material', 'Tubo de cobre', 3, 0, 'm');
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.finalizacao_atendimento(v_ag);
  execute 'reset role';
  if (v_json->>'pendentes')::int = 2
     and (select count(*) from jsonb_array_elements(v_json->'requisitos') r
           where r->>'chave' in ('fotos', 'assinatura') and not (r->>'ok')::boolean) = 2
     and jsonb_array_length(v_json->'materiais') = 1 and v_json->'materiais'->0->>'unidade' = 'm'
     and v_json->'materiais'->0 ? 'descricao' and not (v_json->'materiais'->0 ? 'valor_unitario')
     and v_json->'atendimento'->>'causa' = 'Falta de manutenção'
     and (v_json->>'pode_finalizar')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   com checklist, diagnóstico e material, faltam só foto e assinatura (resumo sem valores)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA resumo parcial: %s', v_json); end if;

  perform set_config('request.jwt.claims', '{}', true);
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
    ('os-anexos', v_loja_a || '/' || v_os || '/depois.jpg', v_tec_a, v_tec_a::text, '{"size": 2048, "mimetype": "image/jpeg"}');
  insert into public.os_anexos (loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes)
    values (v_loja_a, v_os, 'foto', 'depois', 'depois.jpg', v_loja_a || '/' || v_os || '/depois.jpg', 'image/jpeg', 2048);
  v_img := 'data:image/png;base64,' || replace(encode('\x89504e470d0a1a0a'::bytea || extensions.gen_random_bytes(200), 'base64'), E'\n', '');
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.registrar_assinatura_os(v_os, 'Maria Souza', null, null, v_img, v_ag);
  v_json := public.finalizacao_atendimento(v_ag);
  execute 'reset role';
  if (v_json->>'pendentes')::int = 0 and (v_json->>'fotos')::int = 1
     and v_json->'assinatura'->>'nome_responsavel' = 'Maria Souza' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tudo cumprido: nenhuma pendência, resumo mostra foto e responsável';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA resumo completo: %s', v_json); end if;

  -- cargo sem technician.jobs.complete não finaliza, mesmo com tudo pronto
  perform set_config('request.jwt.claims', json_build_object('sub', v_limitado_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.iniciar_atendimento_campo(v_ag_lim);
  v_json := public.finalizacao_atendimento(v_ag_lim);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.finalizar_atendimento_campo(v_ag_lim, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo sem technician.jobs.complete finalizou';
  exception when insufficient_privilege then
    if not (v_json->>'pode_finalizar')::boolean and (v_json->>'pode_registrar')::boolean then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   finalizar exige technician.jobs.complete (o ajudante registra, mas não finaliza)';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA flags do ajudante: %s', v_json); end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update public.os_apontamentos set fim_em = now() where agendamento_id = v_ag_lim and fim_em is null;

  -- ---------------- finaliza em campo encerrando a OS ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.finalizar_atendimento_campo(v_ag, true, null);
  execute 'reset role';
  if (v_json->>'encerrou_os')::boolean and (v_json->>'status_id')::uuid = v_st_fim
     and exists (select 1 from public.ordens_servico where id = v_os and status_id = v_st_fim and concluido_em is not null)
     and exists (select 1 from public.agendamentos where id = v_ag and estado_campo = 'finalizado' and status = 'concluido')
     and not exists (select 1 from public.os_apontamentos where os_id = v_os and fim_em is null)
     and exists (select 1 from public.os_historico where os_id = v_os and status_novo_id = v_st_fim
                   and usuario_id = v_tec_a and observacao = 'Atendimento finalizado em campo.') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico finaliza: OS no status "finalizada", visita concluída, relógio fechado e histórico com o autor';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA finalização em campo: %s', v_json); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.timeline_os(v_os);
  execute 'reset role';
  if exists (select 1 from jsonb_array_elements(v_json) e
              where e->>'acao' = 'os_atendimento_finalizado' and (e->'dados'->>'encerrou_os')::boolean
                and e->'dados'->>'tecnico' = 'Carlos Dias')
     and exists (select 1 from jsonb_array_elements(v_json) e
                  where e->>'acao' = 'os_status_alterado' and e->'dados'->>'status_para' is not null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   linha do tempo mostra o atendimento finalizado pelo técnico e a troca de status';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA linha do tempo da finalização'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  v_n := 0;
  begin
    execute 'set local role authenticated';
    perform public.finalizar_atendimento_campo(v_ag);
  exception when check_violation then v_n := v_n + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.registrar_atendimento_campo(v_ag, '{"solucao": "depois"}');
  exception when check_violation then v_n := v_n + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.iniciar_atendimento_campo(v_ag);
  exception when check_violation then v_n := v_n + 1;
  end;
  execute 'reset role';
  if v_n = 3 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada: não finaliza de novo, não reabre o atendimento e não aceita registro em campo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA OS encerrada: %s bloqueios de 3', v_n); end if;

  -- ---------------- visita de retorno: fecha a visita sem encerrar a OS ----------------
  execute 'set local role authenticated';
  perform public.iniciar_atendimento_campo(v_ag2);
  v_json := public.finalizar_atendimento_campo(v_ag2, false, 'Aguardando peça, volto amanhã');
  execute 'reset role';
  if not (v_json->>'encerrou_os')::boolean
     and exists (select 1 from public.ordens_servico where id = v_os2 and status_id = v_st and concluido_em is null)
     and exists (select 1 from public.agendamentos where id = v_ag2 and estado_campo = 'finalizado' and status = 'concluido')
     and not exists (select 1 from public.os_apontamentos where agendamento_id = v_ag2 and fim_em is null)
     and exists (select 1 from public.log_eventos where acao = 'os_atendimento_finalizado' and detalhes->>'agendamento_id' = v_ag2::text
                   and not (detalhes->>'encerrou_os')::boolean and detalhes->>'observacao' = 'Aguardando peça, volto amanhã') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   visita de retorno: fecha a visita e o relógio, a OS continua aberta';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA visita de retorno: %s', v_json); end if;

  -- ---------------- Portal da Empresa: mesma regra no "Alterar status" ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os3, v_st_fim);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA owner finalizou OS com requisitos pendentes';
  exception when check_violation then
    get stacked diagnostics v_txt = message_text;
    if v_txt like 'Antes de finalizar:%preencha o diagnóstico%' and v_txt not like '%checklist%' then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   "Alterar status" também exige os requisitos do tipo de serviço (e cita só o que falta)';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA mensagem no Alterar status: %s', v_txt); end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_json := public.finalizacao_os(v_os3);
  execute 'reset role';
  if (v_json->>'pendentes')::int = 4 and (v_json->>'pode_finalizar')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   resumo do Portal da Empresa mostra as 4 pendências e que o owner pode finalizar';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA resumo do owner: %s', v_json); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.finalizacao_os(v_os3);
  execute 'reset role';
  if not (v_json->>'pode_finalizar')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente vê o resumo, mas sem poder finalizar (service_orders.finish)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente pode_finalizar'; end if;

  -- sem requisitos no tipo, finaliza; relógio aberto e visita pendente são encerrados junto
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.os_apontamentos (loja_id, os_id, agendamento_id, tecnico_id, tipo, inicio_em)
    values (v_loja_a, v_os3, v_ag3, v_t2, 'atendimento', now() - interval '30 minutes');
  update public.agendamentos set estado_campo = 'em_atendimento', status = 'em_andamento' where id = v_ag3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.tipos_servico set exige_diagnostico = false, exige_assinatura = false, exige_materiais = false, fotos_minimas = 0
   where id = v_tipo;
  v_json := public.alterar_status_os(v_os3, v_st_fim, 'Entregue no balcão');
  execute 'reset role';
  if (v_json->>'alterado')::boolean
     and not exists (select 1 from public.os_apontamentos where os_id = v_os3 and fim_em is null)
     and exists (select 1 from public.agendamentos where id = v_ag3 and status = 'concluido' and estado_campo = 'finalizado') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem requisitos o owner finaliza; relógio aberto fechado e visita pendente concluída';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA finalização do owner: %s', v_json); end if;

  -- ---------------- configuração e exposição ----------------
  begin
    execute 'set local role authenticated';
    update public.tipos_servico set fotos_minimas = 21 where id = v_tipo;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou 21 fotos mínimas';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   fotos mínimas limitadas a 0–20';
  end;
  execute 'reset role';

  if not has_function_privilege('authenticated', 'public.requisitos_finalizacao_os(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.pendencias_finalizacao_os(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.resumo_finalizacao_os(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.efetivar_status_os(uuid, uuid, text)', 'execute')
     and not has_function_privilege('anon', 'public.finalizar_atendimento_campo(uuid, boolean, text)', 'execute')
     and not has_function_privilege('anon', 'public.finalizacao_os(uuid)', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   funções internas fora da API; anon não chama as públicas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exposição das funções'; end if;

  -- ---------------- empresa suspensa ----------------
  update public.lojas set status = 'suspensa' where id = v_loja_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  v_n := 0;
  begin
    execute 'set local role authenticated';
    perform public.finalizacao_atendimento(v_ag2);
  exception when insufficient_privilege then v_n := v_n + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.alterar_status_os(v_os2, v_st_fim);
  exception when insufficient_privilege then v_n := v_n + 1;
  end;
  execute 'reset role';
  if v_n = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa: técnico e owner bloqueados';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa suspensa: %s bloqueios de 2', v_n); end if;

  raise exception E'%\n\nTOTAL: % ok, % falhas (transação desfeita de propósito)', v_log, v_ok, v_falhas;
end;
$$;
