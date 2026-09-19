-- =====================================================================
-- Teste de equipe, cargos e permissões (Fase 2 · 19)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Nota: sem política de RLS, UPDATE/DELETE não levantam erro — afetam
-- zero linhas. Por isso a escrita direta é conferida por row_count.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_gestor_a uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_super uuid := gen_random_uuid();
  v_c_owner uuid; v_c_manager uuid; v_c_attendant uuid; v_c_tech uuid; v_c_owner_b uuid;
  v_cargo_novo uuid; v_cargo_sem_uso uuid;
  v_versao int;
  v_n int; v_m int;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, last_sign_in_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now(),
         case when u = v_atend_a then now() - interval '2 hours' end
  from unnest(array[v_owner_a, v_owner_b, v_gestor_a, v_atend_a, v_tec_a, v_super]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_gestor_a, v_loja_a, 'Gestor A', 'ga@teste.invalid', 'funcionario'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_a, v_loja_a, 'Tecnico A', 'tc@teste.invalid', 'funcionario');
  insert into public.usuarios (id, loja_id, nome, email, papel)
    values (v_super, null, 'Super Admin', 'sa@teste.invalid', 'super_admin');
  select id into v_c_owner from public.cargos where loja_id = v_loja_a and chave = 'owner';
  select id into v_c_manager from public.cargos where loja_id = v_loja_a and chave = 'manager';
  select id into v_c_attendant from public.cargos where loja_id = v_loja_a and chave = 'attendant';
  select id into v_c_tech from public.cargos where loja_id = v_loja_a and chave = 'technician';
  select id into v_c_owner_b from public.cargos where loja_id = v_loja_b and chave = 'owner';
  update public.usuarios set cargo_id = v_c_owner where id = v_owner_a;
  update public.usuarios set cargo_id = v_c_owner_b where id = v_owner_b;
  update public.usuarios set cargo_id = v_c_attendant where id = v_atend_a;
  update public.usuarios set cargo_id = v_c_tech where id = v_tec_a;
  -- gestor: cargo personalizado com team.manage, mas não é Proprietário
  insert into public.cargos (loja_id, nome, descricao, sistema) values (v_loja_a, 'Supervisor Técnico', 'Equipe e OS', false)
    returning id into v_cargo_novo;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values
    (v_cargo_novo, 'team.manage'), (v_cargo_novo, 'service_orders.view'), (v_cargo_novo, 'service_orders.edit');
  update public.usuarios set cargo_id = v_cargo_novo where id = v_gestor_a;

  -- ---------------- escrita direta nas tabelas ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.usuarios set papel = 'super_admin' where id = v_owner_a;
  get diagnostics v_n = row_count;
  delete from public.usuarios where id = v_atend_a;
  get diagnostics v_m = row_count;
  execute 'reset role';
  if v_n = 0 and v_m = 0 and exists (select 1 from public.usuarios where id = v_owner_a and papel = 'gerente')
     and exists (select 1 from public.usuarios where id = v_atend_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   usuários não aceitam UPDATE nem DELETE direto (nem virar super_admin)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA escrita direta em usuarios: update %s, delete %s', v_n, v_m); end if;

  begin
    execute 'set local role authenticated';
    insert into public.usuarios (id, loja_id, nome, email, papel)
      values (gen_random_uuid(), v_loja_a, 'Forjado', 'f@teste.invalid', 'funcionario');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA INSERT direto em usuarios aceito';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   INSERT direto em usuarios negado (só pelo servidor)';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.cargos set nome = 'Direto' where id = v_c_tech;
  get diagnostics v_n = row_count;
  delete from public.cargos where id = v_c_tech;
  get diagnostics v_m = row_count;
  execute 'reset role';
  if v_n = 0 and v_m = 0 and exists (select 1 from public.cargos where id = v_c_tech and nome = 'Técnico') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargos não aceitam UPDATE nem DELETE direto';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA escrita direta em cargos: update %s, delete %s', v_n, v_m); end if;

  begin
    execute 'set local role authenticated';
    insert into public.cargo_permissoes (cargo_id, permissao_chave) values (v_c_tech, 'team.manage');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA permissão adicionada direto na tabela';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   permissões de cargo só mudam pelas funções do banco';
  end;
  execute 'reset role';

  -- ---------------- listagens ----------------
  execute 'set local role authenticated';
  v_json := public.listar_equipe();
  execute 'reset role';
  if jsonb_array_length(v_json) = 4
     and v_json @> '[{"nome":"Atendente A","cargo":{"nome":"Atendente"}}]'
     and not (v_json @> '[{"papel":"super_admin"}]')
     and (select count(*) from jsonb_array_elements(v_json) e where e->>'ultimo_acesso' is not null) = 1
     and v_json @> '[{"nome":"Owner A","eh_voce":true}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   equipe com cargo, situação e último acesso (sem o Super Admin)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA listar_equipe: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.listar_cargos_permissoes();
  execute 'reset role';
  if jsonb_array_length(v_json->'permissoes') = 20
     and v_json->'cargos' @> '[{"chave":"owner","sistema":true,"usuarios":1,"seu_cargo":true}]'
     and v_json->'cargos' @> '[{"nome":"Supervisor Técnico","sistema":false,"usuarios":1}]'
     and (select count(*) from jsonb_array_elements(v_json->'permissoes') p where (p->>'disponivel')::boolean) > 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargos e catálogo de permissões (com as features do plano)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA listar_cargos_permissoes: %s', v_json); end if;

  -- ---------------- usuários ----------------
  execute 'set local role authenticated';
  perform public.definir_cargo_usuario(v_atend_a, v_c_manager);
  execute 'reset role';
  if exists (select 1 from public.usuarios where id = v_atend_a and cargo_id = v_c_manager)
     and exists (select 1 from public.log_eventos where acao = 'funcionario_cargo_alterado' and detalhes->>'funcionario_id' = v_atend_a::text)
     and exists (select 1 from public.logs_auditoria where acao = 'usuario_cargo_alterado' and entidade_id = v_atend_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   troca de cargo registra evento e auditoria';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA troca de cargo'; end if;

  begin
    execute 'set local role authenticated';
    perform public.definir_cargo_usuario(v_owner_a, v_c_attendant);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA usuário trocou o próprio cargo';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   ninguém troca o próprio cargo (evita perder o acesso)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.definir_usuario_ativo(v_super, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa desativou o Super Admin';
  exception when others then
    if sqlstate in ('42501', 'P0002') then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   Super Admin não é administrado pela empresa';
    else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA super admin: %s', sqlerrm); end if;
  end;
  execute 'reset role';

  -- gestor com team.manage, sem o cargo Proprietário
  perform set_config('request.jwt.claims', json_build_object('sub', v_gestor_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.definir_cargo_usuario(v_tec_a, v_c_owner);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA não-proprietário criou Proprietário';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   só um Proprietário concede o cargo Proprietário';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.definir_usuario_ativo(v_owner_a, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA responsável da empresa desativado por não-proprietário';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   responsável pela empresa só é alterado por um Proprietário';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform public.definir_usuario_ativo(v_tec_a, false);
  perform public.renomear_usuario_equipe(v_tec_a, '  Técnico   A  ');
  execute 'reset role';
  if exists (select 1 from public.usuarios where id = v_tec_a and not ativo and nome = 'Técnico A')
     and exists (select 1 from public.log_eventos where acao = 'funcionario_desativado' and detalhes->>'funcionario_id' = v_tec_a::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   desativar e renomear usuário (nome normalizado) com evento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA desativar/renomear'; end if;

  begin
    execute 'set local role authenticated';
    perform public.renomear_usuario_equipe(v_tec_a, 'A');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA nome de 1 caractere aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nome curto → negado';
  end;
  execute 'reset role';

  -- ---------------- cargos ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_cargo_sem_uso := public.salvar_cargo(null, null,
    jsonb_build_object('nome', '  Recepção   Noturna ', 'descricao', 'Atende após as 18h'),
    array['customers.view', 'service_orders.view', 'service_orders.create', 'customers.view']);
  execute 'reset role';
  if exists (select 1 from public.cargos where id = v_cargo_sem_uso and nome = 'Recepção Noturna' and not sistema and chave is null and versao = 1)
     and (select count(*) from public.cargo_permissoes where cargo_id = v_cargo_sem_uso) = 3
     and exists (select 1 from public.logs_auditoria where acao = 'cargo_criado' and entidade_id = v_cargo_sem_uso) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo personalizado criado (permissões sem repetição) e auditado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA criação de cargo'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(null, null, jsonb_build_object('nome', 'Sem permissão'), array[]::text[]);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo sem permissão aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo precisa de ao menos uma permissão';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(null, null, jsonb_build_object('nome', 'Inventada'), array['tudo.liberado']);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA permissão inexistente aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   permissão fora do catálogo → negada';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(v_c_owner, 1, jsonb_build_object('nome', 'Dono editado'), array['dashboard.view']);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo Proprietário alterado';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo Proprietário (acesso total) não é alterado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.definir_cargo_ativo(v_c_owner, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo Proprietário desativado';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo Proprietário não é desativado';
  end;
  execute 'reset role';

  select versao into v_versao from public.cargos where id = v_c_tech;
  execute 'set local role authenticated';
  perform public.salvar_cargo(v_c_tech, v_versao, jsonb_build_object('nome', 'Técnico de campo'),
    array['dashboard.view', 'service_orders.view', 'service_orders.edit']);
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(v_c_tech, v_versao, jsonb_build_object('nome', 'Versão antiga'), array['dashboard.view']);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão antiga do cargo sobrescreveu';
  exception when serialization_failure then
    if exists (select 1 from public.cargos where id = v_c_tech and nome = 'Técnico de campo' and sistema and chave = 'technician')
       and (select count(*) from public.cargo_permissoes where cargo_id = v_c_tech) = 3 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo padrão ajustável (chave preservada); versão antiga → conflito';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA ajuste do cargo padrão'; end if;
  end;
  execute 'reset role';

  -- não é possível ficar sem acesso à própria equipe
  perform set_config('request.jwt.claims', json_build_object('sub', v_gestor_a, 'role', 'authenticated')::text, true);
  select versao into v_versao from public.cargos where id = v_cargo_novo;
  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(v_cargo_novo, v_versao, jsonb_build_object('nome', 'Supervisor Técnico'),
      array['service_orders.view', 'service_orders.edit']);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA usuário removeu a própria permissão de equipe';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   não é possível remover team.manage do próprio cargo';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.excluir_cargo(v_c_attendant);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo padrão excluído';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo padrão não é excluído (só desativado)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.excluir_cargo(v_cargo_novo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo com usuários excluído';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo em uso não é excluído';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.definir_cargo_ativo(v_cargo_novo, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo com usuário ativo desativado';
  exception when check_violation then
    execute 'reset role';
    execute 'set local role authenticated';
    perform public.excluir_cargo(v_cargo_sem_uso);
    if not exists (select 1 from public.cargos where id = v_cargo_sem_uso) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo sem uso é excluído; com usuário ativo não desativa';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA exclusão de cargo sem uso'; end if;
  end;
  execute 'reset role';

  -- ---------------- sem permissão, outra empresa e anônimo ----------------
  perform set_config('request.jwt.claims', '{}', true);
  update public.usuarios set cargo_id = v_c_attendant where id = v_atend_a;

  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.listar_equipe();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente listou a equipe';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem team.manage não lê a equipe';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.definir_cargo_usuario(v_tec_a, v_c_manager);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente trocou o cargo de outro usuário';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem team.manage não troca cargos';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.listar_equipe();
  select count(*) into v_n from public.cargos where loja_id = v_loja_a;
  execute 'reset role';
  if jsonb_array_length(v_json) = 1 and v_json->0->>'nome' = 'Owner B' and v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B só vê a própria equipe e os próprios cargos';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA isolamento B: %s / cargos de A %s', v_json, v_n); end if;

  begin
    execute 'set local role authenticated';
    perform public.definir_usuario_ativo(v_atend_a, false);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B desativou usuário de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não administra usuário de A';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(v_c_tech, 2, jsonb_build_object('nome', 'Invadido'), array['dashboard.view']);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA B alterou cargo de A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   B não altera cargo de A';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.listar_equipe();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo listou a equipe';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não acessa a equipe';
  end;
  execute 'reset role';

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  begin
    delete from public.lojas where id = v_loja_a;
    if not exists (select 1 from public.cargos where loja_id = v_loja_a)
       and not exists (select 1 from public.usuarios where loja_id = v_loja_a) then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa remove usuários e cargos';
    else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA dados restaram após excluir a empresa'; end if;
  exception when others then
    v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA exclusão da empresa: %s', sqlerrm);
  end;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
