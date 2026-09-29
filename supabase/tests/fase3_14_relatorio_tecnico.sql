-- =====================================================================
-- Teste do relatório técnico (Fase 3 · 29 — etapa 16)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre a prévia antes de finalizar, a versão congelada na finalização (com
-- os dados do §41), a imutabilidade depois de editar a OS, novas versões ao
-- reabrir e finalizar de novo, o contato do cliente só para quem vê clientes,
-- a escrita direta bloqueada, técnico de fora, outra empresa, cargo sem
-- acesso, empresa suspensa e a exclusão da empresa.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_tec2_a uuid := gen_random_uuid();
  v_ajud_a uuid := gen_random_uuid();
  v_estoque_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_cargo_ajud uuid;
  v_cli uuid; v_cli_b uuid; v_end uuid; v_eqp uuid; v_st uuid; v_st_b uuid; v_st_fim uuid;
  v_os uuid; v_os_b uuid; v_ag uuid; v_ag_ajud uuid;
  v_modelo uuid; v_chk uuid; v_item uuid;
  v_img text;
  v_json jsonb; v_rel jsonb; v_n int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_tec_a, v_tec2_a, v_ajud_a, v_estoque_a, v_owner_b]) u;
  insert into public.lojas (nome, cnpj, cidade, estado) values ('TESTE Empresa A', '11222333000181', 'Curitiba', 'PR')
    returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_tec_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_tec2_a, v_loja_a, 'Bruno', 'br@teste.invalid', 'funcionario'),
    (v_ajud_a, v_loja_a, 'Ana', 'an@teste.invalid', 'funcionario'),
    (v_estoque_a, v_loja_a, 'Estoque', 'es@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a
     and ((u.id in (v_tec_a, v_tec2_a) and c.chave = 'technician') or (u.id = v_estoque_a and c.chave = 'inventory'));
  -- cargo de campo sem customers.view
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Ajudante', 'Campo sem cadastro de clientes', false) returning id into v_cargo_ajud;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values
    (v_cargo_ajud, 'service_orders.view'), (v_cargo_ajud, 'technician.jobs.view'), (v_cargo_ajud, 'technician.jobs.start');
  update public.usuarios set cargo_id = v_cargo_ajud where id = v_ajud_a;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_tec_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Bruno', 'Lima', v_tec2_a) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Ana', 'Reis', v_ajud_a) returning id into v_t3;

  insert into public.clientes (loja_id, nome, telefone, documento) values (v_loja_a, 'Condomínio Solar', '41999990000', '52998224725')
    returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.cliente_enderecos (loja_id, cliente_id, rotulo, logradouro, numero, bairro, cidade, estado)
    values (v_loja_a, v_cli, 'Portaria', 'Rua das Flores', '100', 'Centro', 'Curitiba', 'PR') returning id into v_end;
  insert into public.equipamentos (loja_id, cliente_id, nome, marca, modelo, numero_serie)
    values (v_loja_a, v_cli, 'Split sala', 'Marca X', 'MX-12', 'SN123') returning id into v_eqp;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and chave = 'finalizada';
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, local_atendimento, cliente_endereco_id,
                                     equipamento_id, tecnico_id)
    values (v_loja_a, v_cli, v_st, 'Ar não gela', 'externo', v_end, v_eqp, v_t1) returning id into v_os;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os, v_t1, now(), now() + interval '1 hour') returning id into v_ag;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os, v_t3, now() + interval '2 hours', now() + interval '3 hours') returning id into v_ag_ajud;
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario, unidade)
    values (v_os, 'material', 'Gás R410', 1.5, 90, 'kg'), (v_os, 'servico', 'Recarga de gás', 1, 250, null);

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_modelo := public.salvar_checklist_modelo(null, null, jsonb_build_object('nome', 'Entrega'), jsonb_build_array(
    jsonb_build_object('rotulo', 'Testou o equipamento?', 'tipo', 'checkbox', 'obrigatorio', true)));
  v_chk := public.aplicar_checklist_os(v_os, v_modelo);
  execute 'reset role';
  select id into v_item from public.os_checklist_itens where checklist_id = v_chk;

  -- ---------------- prévia antes de finalizar ----------------
  execute 'set local role authenticated';
  v_json := public.relatorio_tecnico_os(v_os);
  execute 'reset role';
  if v_json->>'origem' = 'previa' and v_json->'versao' = 'null'::jsonb and jsonb_array_length(v_json->'versoes') = 0
     and v_json->'relatorio'->>'problema' = 'Ar não gela'
     and jsonb_array_length(v_json->'relatorio'->'checklists'->0->'itens') = 1
     and not (v_json->>'encerrada')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS aberta: prévia com os dados atuais e nenhuma versão';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA prévia: %s', v_json); end if;

  -- ---------------- atendimento em campo e finalização ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  v_img := 'data:image/png;base64,' || replace(encode('\x89504e470d0a1a0a'::bytea || extensions.gen_random_bytes(200), 'base64'), E'\n', '');
  execute 'set local role authenticated';
  perform public.iniciar_deslocamento(v_ag);
  perform public.registrar_chegada(v_ag);
  perform public.iniciar_atendimento_campo(v_ag);
  perform public.responder_item_checklist(v_item, jsonb_build_object('valor', true));
  perform public.registrar_atendimento_campo(v_ag, jsonb_build_object(
    'diagnostico', 'Vazamento na conexão', 'solucao', 'Conexão refeita e gás recarregado', 'recomendacao', 'Limpeza semestral'));
  perform public.registrar_assinatura_os(v_os, 'Maria Souza', '12345678900', null, v_img, v_ag);
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
    ('os-anexos', v_loja_a || '/' || v_os || '/depois.jpg', v_tec_a, v_tec_a::text, '{"size": 2048, "mimetype": "image/jpeg"}');
  insert into public.os_anexos (loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes, descricao, tecnico_id)
    values (v_loja_a, v_os, 'foto', 'depois', 'depois.jpg', v_loja_a || '/' || v_os || '/depois.jpg', 'image/jpeg', 2048, 'Unidade funcionando', v_t1);
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.finalizar_atendimento_campo(v_ag, true, null);
  execute 'reset role';

  if (select count(*) from public.os_relatorios where os_id = v_os) = 1
     and exists (select 1 from public.os_relatorios where os_id = v_os and versao = 1 and gerado_por = v_tec_a)
     and exists (select 1 from public.log_eventos where acao = 'os_relatorio_gerado' and detalhes->>'os_id' = v_os::text
                   and (detalhes->>'versao')::int = 1) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   finalizar congela a versão 1 do relatório, com autor e evento na linha do tempo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão congelada na finalização'; end if;

  -- ---------------- conteúdo do §41 ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.relatorio_tecnico_os(v_os);
  execute 'reset role';
  v_rel := v_json->'relatorio';
  if v_json->>'origem' = 'finalizacao' and (v_json->>'versao')::int = 1 and v_json->>'gerado_por' = 'Carlos'
     and v_rel->'empresa'->>'nome' = 'TESTE Empresa A' and v_rel->'empresa'->>'cidade' = 'Curitiba'
     and v_rel->'os'->'status'->>'categoria' = 'finalizado_sucesso' and v_rel->'os'->>'concluida_em' is not null
     and v_rel->'cliente'->>'nome' = 'Condomínio Solar' and v_rel->'cliente'->>'telefone' = '41999990000'
     and v_rel->'endereco'->>'logradouro' = 'Rua das Flores'
     and v_rel->'equipamento'->>'numero_serie' = 'SN123'
     and v_rel->>'tecnico' = 'Carlos Dias' and v_rel->>'problema' = 'Ar não gela' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cabeçalho: empresa, OS finalizada, cliente, endereço, equipamento, técnico e problema';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cabeçalho do relatório: %s', v_rel); end if;

  if v_rel->'atendimento'->>'diagnostico' = 'Vazamento na conexão'
     and v_rel->'atendimento'->>'solucao' = 'Conexão refeita e gás recarregado'
     and (v_rel->'checklists'->0->'itens'->0->>'valor_booleano')::boolean
     and v_rel->'materiais'->0->>'descricao' = 'Gás R410' and v_rel->'materiais'->0->>'unidade' = 'kg'
     and not (v_rel->'materiais'->0 ? 'valor_unitario') and not (v_rel->'servicos'->0 ? 'subtotal')
     and v_rel->'servicos'->0->>'descricao' = 'Recarga de gás'
     and v_rel->'fotos'->0->>'descricao' = 'Unidade funcionando' and v_rel->'fotos'->0->>'tecnico' = 'Carlos Dias'
     and v_rel->'fotos'->0->>'caminho' like v_loja_a || '/%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   corpo: diagnóstico, solução, checklist, materiais e serviços sem valores, fotos com autoria';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA corpo do relatório: %s', v_rel); end if;

  if v_rel->'visitas'->0->>'tecnico' = 'Carlos Dias' and v_rel->'visitas'->0->>'status' = 'concluido'
     and v_rel->'visitas'->0->>'saida_em' is not null and v_rel->'visitas'->0->>'chegada_em' is not null
     and v_rel->'visitas'->0->>'inicio_atendimento_em' is not null and v_rel->'visitas'->0->>'termino_em' is not null
     and v_rel->'tempos' ? 'atendimento_min'
     and v_rel->'assinatura'->>'nome_responsavel' = 'Maria Souza' and length(v_rel->'assinatura'->>'hash_sha256') = 64
     and v_rel->'assinatura'->>'imagem_png' like 'data:image/png;base64,%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   horários da visita (saída, chegada, início, término), tempos e assinatura com hash e imagem';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA horários/assinatura: %s / %s', v_rel->'visitas', v_rel->'assinatura'); end if;

  -- ---------------- a versão não muda com a OS ----------------
  execute 'set local role authenticated';
  update public.ordens_servico set observacoes_tecnicas = 'Anotação depois de encerrar' where id = v_os;
  v_json := public.relatorio_tecnico_os(v_os);
  execute 'reset role';
  if v_json->'relatorio'->'atendimento'->'observacoes_tecnicas' = 'null'::jsonb
     and public.montar_relatorio_os(v_os)->'atendimento'->>'observacoes_tecnicas' = 'Anotação depois de encerrar' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   editar a OS depois de finalizar não altera a versão congelada';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão congelada mudou'; end if;

  -- ---------------- reabrir e finalizar de novo ----------------
  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os, v_st, 'Cliente relatou ruído');
  v_json := public.relatorio_tecnico_os(v_os);
  execute 'reset role';
  if v_json->>'origem' = 'previa' and jsonb_array_length(v_json->'versoes') = 1
     and v_json->'relatorio'->'atendimento'->>'observacoes_tecnicas' = 'Anotação depois de encerrar' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS reaberta volta à prévia, com a versão anterior no histórico';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA reabertura: %s', v_json->>'origem'); end if;

  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os, v_st_fim, 'Ruído resolvido');
  v_json := public.relatorio_tecnico_os(v_os);
  v_rel := public.relatorio_tecnico_os(v_os, 1);
  execute 'reset role';
  if (v_json->>'versao')::int = 2 and v_json->>'gerado_por' = 'Owner A' and jsonb_array_length(v_json->'versoes') = 2
     and (v_rel->>'versao')::int = 1 and v_rel->'relatorio'->'atendimento'->'observacoes_tecnicas' = 'null'::jsonb
     and v_json->'relatorio'->'atendimento'->>'observacoes_tecnicas' = 'Anotação depois de encerrar' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   finalizar de novo gera a versão 2; a versão 1 continua disponível como estava';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA nova versão: %s', v_json - 'relatorio'); end if;

  begin
    execute 'set local role authenticated';
    perform public.relatorio_tecnico_os(v_os, 9);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão inexistente devolvida';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   versão inexistente → não encontrada';
  end;
  execute 'reset role';

  -- ---------------- portal do técnico e contato do cliente ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.relatorio_tecnico_atendimento(v_ag);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_ajud_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_rel := public.relatorio_tecnico_atendimento(v_ag_ajud);
  execute 'reset role';
  if (v_json->>'versao')::int = 2 and v_json->'relatorio'->'cliente'->>'telefone' = '41999990000'
     and v_rel->'relatorio'->'cliente' = '{"nome": "Condomínio Solar"}'::jsonb
     and v_rel->'relatorio'->'endereco'->>'logradouro' = 'Rua das Flores' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico lê o relatório pelo atendimento; sem customers.view o contato do cliente some (endereço fica)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA portal/contato: %s / %s', v_json->'relatorio'->'cliente', v_rel->'relatorio'->'cliente'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_tec2_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.relatorio_tecnico_atendimento(v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico de fora leu o relatório pelo atendimento';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico de fora do atendimento → não encontrado';
  end;
  execute 'reset role';

  -- ---------------- escrita direta, outra empresa, cargo sem acesso ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_n := 0;
  begin
    execute 'set local role authenticated';
    insert into public.os_relatorios (loja_id, os_id, versao, conteudo) values (v_loja_a, v_os, 3, '{}');
  exception when insufficient_privilege then v_n := v_n + 1;
  end;
  execute 'reset role';
  execute 'set local role authenticated';
  update public.os_relatorios set conteudo = '{}' where os_id = v_os;
  delete from public.os_relatorios where os_id = v_os;
  execute 'reset role';
  if v_n = 1 and (select count(*) from public.os_relatorios where os_id = v_os and conteudo <> '{}'::jsonb) = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nem o dono grava, altera ou apaga relatório direto na tabela';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA escrita direta em os_relatorios'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.relatorio_tecnico_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B leu relatório de A';
  exception when no_data_found then
    v_n := -1;
  end;
  execute 'reset role';
  -- o set local role do bloco acima é desfeito junto com a exceção: conta de novo como B
  if v_n = -1 then
    execute 'set local role authenticated';
    select count(*) into v_n from public.os_relatorios where os_id = v_os;
    execute 'reset role';
    if v_n = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê o relatório de A (função nem tabela)';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B viu linhas de os_relatorios'; end if;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_estoque_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.relatorio_tecnico_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo sem service_orders.view leu o relatório';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem service_orders.view não lê o relatório';
  end;
  execute 'reset role';

  if not has_function_privilege('authenticated', 'public.montar_relatorio_os(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.ler_relatorio_os(uuid, integer)', 'execute')
     and not has_function_privilege('anon', 'public.relatorio_tecnico_os(uuid, integer)', 'execute')
     and not has_function_privilege('anon', 'public.relatorio_tecnico_atendimento(uuid)', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   montagem e leitura internas fora da API; anon não chama as públicas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exposição das funções'; end if;

  -- ---------------- empresa suspensa e exclusão ----------------
  update public.lojas set status = 'suspensa' where id = v_loja_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.relatorio_tecnico_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa suspensa leu relatório';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa → bloqueado';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.os_relatorios where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove os relatórios';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA relatórios restaram'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception E'%\n\nTOTAL: % ok, % falhas (transação desfeita de propósito)', v_log, v_ok, v_falhas;
end;
$$;
