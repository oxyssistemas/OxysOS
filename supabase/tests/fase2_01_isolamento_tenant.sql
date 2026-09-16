-- =====================================================================
-- Teste de isolamento multi-tenant e bloqueio de acesso (Fase 2 · 01)
--
-- Cria Empresa A e Empresa B dentro de uma transação, simula requisições
-- como usuários reais (role authenticated + JWT) e, ao final, lança uma
-- exceção com o relatório — o que desfaz TODOS os dados criados.
--
-- Como rodar: cole no SQL Editor do Supabase (ou execute via MCP).
-- Resultado esperado: "TOTAL: N ok, 0 falhas".
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_func_a uuid := gen_random_uuid();
  v_status_a uuid; v_status_b uuid;
  v_cli_a uuid; v_cli_b uuid;
  v_os_a uuid; v_os_b uuid;
  v_n int;
  v_txt text;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  -- ---------------- Preparação (como postgres) ----------------
  select id into v_plano from public.planos where nome = 'Start';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    (v_owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@teste.invalid', '', now(), now()),
    (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@teste.invalid', '', now(), now()),
    (v_func_a,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'func-a@teste.invalid',  '', now(), now());

  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');

  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'owner-a@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'owner-b@teste.invalid', 'gerente'),
    (v_func_a,  v_loja_a, 'Func A',  'func-a@teste.invalid',  'funcionario');

  insert into public.status_os (loja_id, nome, categoria) values (v_loja_a, 'Aberta', 'aberto') returning id into v_status_a;
  insert into public.status_os (loja_id, nome, categoria) values (v_loja_b, 'Aberta', 'aberto') returning id into v_status_b;
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli_a;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli_a, v_status_a, 'OS A') returning id into v_os_a;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_b, v_cli_b, v_status_b, 'OS B') returning id into v_os_b;

  -- Cargos atribuídos automaticamente
  select count(*) into v_n from public.usuarios u join public.cargos c on c.id = u.cargo_id
   where (u.id = v_owner_a and c.chave = 'owner' and c.loja_id = v_loja_a)
      or (u.id = v_func_a and c.chave = 'attendant' and c.loja_id = v_loja_a);
  if v_n = 2 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargos padrão atribuídos (owner/attendant)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargos padrão atribuídos'; end if;

  -- ================= Owner A: acesso aos próprios dados =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes;
  select public.obter_contexto_empresa() into v_json;
  execute 'reset role';
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   owner A vê somente 1 cliente (o seu)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA owner A vê %s clientes', v_n); end if;
  if v_json->>'situacao' = 'liberado' and v_json->'features' ? 'customers'
     and v_json->'permissoes' ? 'team.manage' and v_json->'empresa'->>'id' = v_loja_a::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   contexto da empresa A (liberado, features, permissões)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA contexto A: %s', v_json); end if;

  -- ================= Owner A tentando acessar B =================
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes where id = v_cli_b;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   select cliente B por ID → negado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA select cliente B por ID'; end if;

  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico where id = v_os_b;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   select OS B por ID → negado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA select OS B por ID'; end if;

  execute 'set local role authenticated';
  update public.clientes set nome = 'invadido' where id = v_cli_b;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   update cliente B → 0 linhas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA update cliente B'; end if;

  execute 'set local role authenticated';
  delete from public.ordens_servico where id = v_os_b;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   delete OS B → 0 linhas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA delete OS B'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.clientes (loja_id, nome) values (v_loja_b, 'payload forjado');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA insert cliente com loja_id de B foi aceito';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   insert cliente com loja_id de B → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli_b, v_status_a, 'OS A apontando para cliente B');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS de A referenciando cliente de B foi aceita';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS de A referenciando cliente de B → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao) values (v_os_b, 'servico', 'item forjado');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA item inserido na OS de B';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   inserir item na OS de B → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.os_historico (os_id, usuario_id) values (v_os_a, v_func_a);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA histórico com autor forjado aceito';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   histórico com autor forjado → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.os_historico (os_id, usuario_id) values (v_os_a, v_owner_a);
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   histórico legítimo (autor = usuário logado) aceito';
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA histórico legítimo negado: %s', sqlerrm);
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  select count(*) into v_n from public.cargos where loja_id = v_loja_b;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargos da empresa B invisíveis';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargos de B visíveis'; end if;

  execute 'set local role authenticated';
  select count(*) into v_n from public.usuarios;
  execute 'reset role';
  if v_n = 2 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   owner A lista só usuários da empresa A (2)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA owner A lista %s usuários', v_n); end if;

  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner) values ('os-fotos', v_loja_b || '/x/forjado.jpg', v_owner_a);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA upload na pasta da empresa B aceito';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   upload na pasta da empresa B → negado';
  end;
  execute 'reset role';

  -- ================= Escalada de privilégio =================
  begin
    execute 'set local role authenticated';
    update public.usuarios set papel = 'super_admin', loja_id = null where id = v_owner_a;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA owner virou super_admin';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   owner → super_admin → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.usuarios set loja_id = v_loja_b where id = v_func_a;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mover funcionário para empresa B → negado';
    else
      v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA funcionário movido para empresa B';
    end if;
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mover funcionário para empresa B → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.usuarios set ativo = false where id = v_owner_a;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa ficou sem proprietário ativo';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   desativar o único proprietário → negado';
  end;
  execute 'reset role';

  -- ================= Funcionário (attendant) =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_func_a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  select public.tem_permissao('team.manage') into v_txt;
  execute 'reset role';
  if v_txt = 'false' then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente não tem team.manage';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente com team.manage'; end if;

  begin
    execute 'set local role authenticated';
    update public.usuarios
       set cargo_id = (select id from public.cargos where loja_id = v_loja_a and chave = 'owner')
     where id = v_func_a;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente se promover a proprietário → negado';
    else
      v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente virou proprietário';
    end if;
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente se promover a proprietário → negado';
  end;
  execute 'reset role';

  -- desativação feita "pelo servidor" (sem JWT), como a Edge Function faz
  perform set_config('request.jwt.claims', '{}', true);
  update public.usuarios set ativo = false where id = v_func_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_func_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes;
  select public.obter_contexto_empresa()->>'situacao' into v_txt;
  execute 'reset role';
  if v_n = 0 and v_txt = 'usuario_inativo' then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   usuário desativado → sem acesso a dados';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA usuário desativado vê %s clientes (%s)', v_n, v_txt); end if;

  -- ================= Situação da empresa A =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  update public.lojas set status = 'suspensa' where id = v_loja_a;
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico;
  select public.obter_contexto_empresa()->>'situacao' into v_txt;
  execute 'reset role';
  if v_n = 0 and v_txt = 'loja_suspensa' then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa → sem acesso à operação';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa suspensa vê %s OS (%s)', v_n, v_txt); end if;

  select count(*) into v_n from public.ordens_servico where loja_id = v_loja_a;
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   dados da empresa suspensa preservados';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dados da empresa suspensa'; end if;

  update public.lojas set status = 'ativa' where id = v_loja_a;
  update public.assinaturas set status = 'trial', trial_termina_em = now() - interval '1 day' where loja_id = v_loja_a;
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes;
  select public.obter_contexto_empresa()->>'situacao' into v_txt;
  execute 'reset role';
  if v_n = 0 and v_txt = 'trial_expirado' then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   trial expirado → sem acesso à operação';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA trial expirado vê %s clientes (%s)', v_n, v_txt); end if;

  update public.assinaturas set trial_termina_em = now() + interval '7 days' where loja_id = v_loja_a;
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes;
  execute 'reset role';
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   trial válido → acesso liberado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA trial válido sem acesso'; end if;

  -- Feature removida do plano via override → backend nega
  insert into public.empresa_feature_overrides (loja_id, funcionalidade_id, habilitado)
  select v_loja_a, id, false from public.funcionalidades where key = 'customers';
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   feature customers bloqueada → backend nega clientes';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA feature bloqueada ainda retorna clientes'; end if;

  -- ================= Anônimo =================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into v_n from public.clientes;
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê clientes';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo lê clientes'; end if;

  begin
    execute 'set local role anon';
    perform public.obter_contexto_empresa();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo executa obter_contexto_empresa';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não executa obter_contexto_empresa';
  end;
  execute 'reset role';

  begin
    execute 'set local role anon';
    perform public.empresa_tem_feature(v_loja_b, 'customers');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo consulta features de outra empresa';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não consulta features de empresas';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
