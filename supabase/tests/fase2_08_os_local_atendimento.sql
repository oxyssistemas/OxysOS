-- =====================================================================
-- Teste do local do atendimento na OS (Fase 2 · 08)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_cli1 uuid; v_cli2 uuid; v_cli_b uuid;
  v_end1 uuid; v_end2 uuid; v_end_b uuid;
  v_st uuid; v_os_loja uuid; v_os_ext uuid;
  v_n int;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Condomínio Solar') returning id into v_cli1;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Padaria') returning id into v_cli2;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.cliente_enderecos (loja_id, cliente_id, logradouro, cidade, estado) values (v_loja_a, v_cli1, 'Rua A', 'SP', 'SP') returning id into v_end1;
  insert into public.cliente_enderecos (loja_id, cliente_id, logradouro, cidade, estado) values (v_loja_a, v_cli2, 'Rua B', 'SP', 'SP') returning id into v_end2;
  insert into public.cliente_enderecos (loja_id, cliente_id, logradouro, cidade, estado) values (v_loja_b, v_cli_b, 'Rua X', 'SP', 'SP') returning id into v_end_b;
  insert into public.status_os (loja_id, nome, categoria) values (v_loja_a, 'Aberta', 'aberto') returning id into v_st;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli2, v_st, 'Troca de tela') returning id into v_os_loja;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, local_atendimento, cliente_endereco_id)
    values (v_loja_a, v_cli1, v_st, 'Instalação de 8 câmeras', 'externo', v_end1) returning id into v_os_ext;
  execute 'reset role';

  if (select local_atendimento from public.ordens_servico where id = v_os_loja) = 'loja'
     and exists (select 1 from public.ordens_servico where id = v_os_ext and local_atendimento = 'externo' and cliente_endereco_id = v_end1) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS na loja por padrão; OS externa com endereço do cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA criação de OS na loja/externa'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, local_atendimento, cliente_endereco_id)
      values (v_loja_a, v_cli2, v_st, 'Endereço de outro cliente', 'externo', v_end1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço de outro cliente aceito';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço precisa ser do cliente da OS';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, local_atendimento, cliente_endereco_id)
      values (v_loja_a, v_cli2, v_st, 'Endereço de outra empresa', 'externo', v_end_b);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço de outra empresa aceito';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço de outra empresa → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, local_atendimento, cliente_endereco_id)
      values (v_loja_a, v_cli1, v_st, 'Na loja com endereço', 'loja', v_end1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS na loja com endereço aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS na loja não guarda endereço de atendimento';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.ordens_servico set local_atendimento = 'externo', cliente_endereco_id = v_end2 where id = v_os_loja;
  update public.ordens_servico set descricao = 'Troca de tela e bateria' where id = v_os_loja;
  execute 'reset role';
  select count(*) into v_n from public.log_eventos
   where acao = 'os_local_alterado' and detalhes->>'os_id' = v_os_loja::text
     and detalhes->>'para_local' = 'externo' and usuario_id = v_owner_a;
  if v_n = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mudança de local registra 1 evento (outras alterações não)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA eventos de mudança de local: %s', v_n); end if;

  begin
    execute 'set local role authenticated';
    delete from public.cliente_enderecos where id = v_end1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço usado em OS excluído';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço usado em OS não é excluído';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.ordens_servico set local_atendimento = 'loja', cliente_endereco_id = null where id = v_os_ext;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não altera o local de OS da empresa A';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B alterou OS de A'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
