-- =====================================================================
-- Teste do módulo de Técnicos (Fase 2 · 06)
-- Cadastro transacional com especialidades, permissões por cargo,
-- concorrência, ativar/desativar, atribuição a OS, contadores, dashboard
-- e isolamento A × B. Tudo desfeito ao final.
-- Resultado esperado: "TOTAL: N ok, 0 falhas".
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_user_a uuid := gen_random_uuid();
  v_esp_cftv uuid; v_esp_redes uuid; v_esp_b uuid;
  v_tec1 uuid; v_tec2 uuid; v_tec_b uuid;
  v_cli uuid; v_st_and uuid; v_st_fin uuid;
  v_n int; v_versao int;
  v_txt text;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';
begin
  -- ---------------- Preparação ----------------
  select id into v_plano from public.planos where nome = 'Start';
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
    (v_tec_user_a, v_loja_a, 'Login Técnico A', 'lt@teste.invalid', 'funcionario');
  update public.usuarios set cargo_id = (select id from public.cargos where loja_id = v_loja_a and chave = 'technician')
   where id = v_tec_user_a;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  select id into v_st_and from public.status_os where loja_id = v_loja_a and chave = 'em_atendimento';
  select id into v_st_fin from public.status_os where loja_id = v_loja_a and chave = 'finalizada';

  -- ================= Owner A =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  insert into public.especialidades (loja_id, nome) values (v_loja_a, '  CFTV ') returning id into v_esp_cftv;
  insert into public.especialidades (loja_id, nome) values (v_loja_a, 'Redes') returning id into v_esp_redes;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.especialidades (loja_id, nome) values (v_loja_a, 'cftv');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA especialidade duplicada aceita';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   especialidade duplicada (sem diferenciar maiúsculas) → negada';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_tec1 := public.salvar_tecnico(null, null,
    jsonb_build_object('nome', ' Carlos ', 'sobrenome', 'Souza', 'email', 'CARLOS@Oxys.com', 'telefone', '(11) 98888-0000',
                       'documento', '529.982.247-25', 'usuario_id', v_tec_user_a),
    array[v_esp_cftv, v_esp_redes]);
  execute 'reset role';

  select count(*) into v_n from public.tecnicos
   where id = v_tec1 and nome = 'Carlos' and email = 'carlos@oxys.com' and documento = '52998224725'
     and usuario_id = v_tec_user_a and ativo and criado_por = v_owner_a;
  if v_n = 1 and (select count(*) from public.tecnico_especialidades where tecnico_id = v_tec1) = 2 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   salvar_tecnico cria técnico normalizado + 2 especialidades';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA criação do técnico'; end if;

  if exists (select 1 from public.log_eventos where acao = 'tecnico_cadastrado' and detalhes->>'tecnico_id' = v_tec1::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   evento "técnico cadastrado" registrado';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento tecnico_cadastrado'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(null, null, jsonb_build_object('nome', 'Outro', 'email', 'carlos@oxys.com'), array[]::uuid[]);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA e-mail duplicado aceito';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   e-mail de técnico duplicado na empresa → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(null, null, jsonb_build_object('nome', 'CPF ruim', 'documento', '52998224724'), null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA CPF inválido aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   CPF inválido → negado';
  end;
  execute 'reset role';

  -- especialidades: troca atômica + concorrência
  select versao into v_versao from public.tecnicos where id = v_tec1;
  execute 'set local role authenticated';
  perform public.salvar_tecnico(v_tec1, v_versao,
    jsonb_build_object('nome', 'Carlos', 'sobrenome', 'Souza', 'email', 'carlos@oxys.com', 'telefone', '(11) 98888-0000',
                       'documento', '52998224725', 'usuario_id', v_tec_user_a),
    array[v_esp_redes]);
  execute 'reset role';
  if (select array_agg(especialidade_id) from public.tecnico_especialidades where tecnico_id = v_tec1) = array[v_esp_redes]
     and exists (select 1 from public.log_eventos where acao = 'tecnico_atualizado' and detalhes->'campos' ? 'especialidades') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   especialidades substituídas e alteração registrada';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA troca de especialidades'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(v_tec1, v_versao, jsonb_build_object('nome', 'Versão antiga'), null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA versão desatualizada sobrescreveu';
  exception when serialization_failure then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   versão desatualizada → conflito, nada sobrescrito';
  end;
  execute 'reset role';

  -- o evento de técnico só é gravado pelo servidor (log_eventos não aceita escrita direta)
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.registrar_evento_tecnico(v_tec1, array['forjado']);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente registrou evento de técnico';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem technicians.manage não registra evento de técnico';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  -- especialidade inativa e exclusão em uso
  execute 'set local role authenticated';
  update public.especialidades set ativo = false where id = v_esp_cftv;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into public.tecnico_especialidades (loja_id, tecnico_id, especialidade_id) values (v_loja_a, v_tec1, v_esp_cftv);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA especialidade inativa atribuída';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   especialidade inativa não é atribuída a técnicos';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    delete from public.especialidades where id = v_esp_redes;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA especialidade em uso excluída';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   especialidade em uso não pode ser excluída';
  end;
  execute 'reset role';

  -- contadores de OS
  execute 'set local role authenticated';
  v_tec2 := public.salvar_tecnico(null, null, jsonb_build_object('nome', 'Ana', 'sobrenome', 'Lima'), array[]::uuid[]);
  execute 'reset role';
  insert into public.ordens_servico (loja_id, cliente_id, status_id, tecnico_id, descricao) values
    (v_loja_a, v_cli, v_st_and, v_tec1, 'OS 1'),
    (v_loja_a, v_cli, v_st_and, v_tec1, 'OS 2'),
    (v_loja_a, v_cli, v_st_and, v_tec1, 'OS 3');
  perform set_config('oxys.alterar_status_os', 'on', true);
  update public.ordens_servico set status_id = v_st_fin where loja_id = v_loja_a and descricao in ('OS 2', 'OS 3');
  perform set_config('oxys.alterar_status_os', 'off', true);

  execute 'set local role authenticated';
  v_json := public.listar_tecnicos(null, 'ativos', null, 1, 20);
  execute 'reset role';
  if (v_json->>'total')::int = 2
     and v_json->'itens' @> jsonb_build_array(jsonb_build_object('nome', 'Carlos', 'os_em_andamento', 1, 'os_concluidas', 2))
     and v_json->'itens' @> jsonb_build_array(jsonb_build_object('nome', 'Ana', 'os_em_andamento', 0, 'os_concluidas', 0)) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   listagem com contadores reais de OS por técnico';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA listagem: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.listar_tecnicos('carlos souza', 'todos', v_esp_redes, 1, 20);
  execute 'reset role';
  if (v_json->>'total')::int = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   busca + filtro por especialidade';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA busca/filtro: %s', v_json); end if;

  -- desativar
  execute 'set local role authenticated';
  update public.tecnicos set ativo = false where id = v_tec2;
  v_json := public.dashboard_resumo(now() - interval '1 day', now() + interval '1 day');
  execute 'reset role';
  if exists (select 1 from public.tecnicos where id = v_tec2 and not ativo and desativado_por = v_owner_a)
     and (v_json->'cards'->>'tecnicos_ativos')::int = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   desativação registra autor e dashboard conta só ativos';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA desativação/dashboard: %s', v_json->'cards'); end if;

  begin
    execute 'set local role authenticated';
    insert into public.ordens_servico (loja_id, cliente_id, status_id, tecnico_id, descricao)
    values (v_loja_a, v_cli, v_st_and, v_tec2, 'OS para inativo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS atribuída a técnico inativo';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico inativo não recebe OS';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  delete from public.tecnicos where id = v_tec2;
  get diagnostics v_n = row_count;
  v_json := public.dashboard_atividade(50);
  execute 'reset role';
  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   exclusão de técnico → bloqueada (só desativar)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico excluído'; end if;
  if v_json @> '[{"acao":"tecnico_cadastrado","tecnico":"Carlos Souza"}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atividade do dashboard mostra "técnico cadastrado"';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atividade: %s', v_json); end if;

  -- ================= Atendente: vê, não gerencia =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.listar_tecnicos(null, 'todos', null, 1, 20);
  update public.tecnicos set nome = 'Alterado' where id = v_tec1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if (v_json->>'total')::int = 2 and v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente lista técnicos mas não edita';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atendente: total %s editou %s', v_json->>'total', v_n); end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(null, null, jsonb_build_object('nome', 'Pelo atendente'), null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente cadastrou técnico';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente sem technicians.manage → cadastro negado';
  end;
  execute 'reset role';

  -- ================= Cargo técnico: sem technicians.view, mas vê nomes via OS =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_user_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.tecnicos;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.listar_tecnicos(null, 'todos', null, 1, 20);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo técnico acessou o módulo de técnicos';
  exception when insufficient_privilege then
    if v_n = 2 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cargo técnico: sem módulo, mas lê nomes (necessário nas OS)';
    else
      v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA cargo técnico lê %s técnicos', v_n);
    end if;
  end;
  execute 'reset role';

  -- ================= Isolamento A × B =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.especialidades (loja_id, nome) values (v_loja_b, 'Segredo B') returning id into v_esp_b;
  v_tec_b := public.salvar_tecnico(null, null, jsonb_build_object('nome', 'Técnico B', 'email', 'carlos@oxys.com'), array[v_esp_b]);
  select count(*) into v_n from public.tecnicos;
  execute 'reset role';
  if v_tec_b is not null and v_n = 1 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B vê só o próprio técnico (mesmo e-mail permitido entre empresas)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa B vê %s técnicos', v_n); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(null, null, jsonb_build_object('nome', 'Com skill de B'), array[v_esp_b]);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA especialidade de B atribuída em A';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   especialidade de outra empresa → negada (FK de tenant)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(null, null, jsonb_build_object('nome', 'Login de B', 'usuario_id', v_owner_b), null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA usuário de B vinculado a técnico de A';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   vincular usuário de outra empresa → negado';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.tecnicos set nome = 'invadido' where id = v_tec_b;
  get diagnostics v_n = row_count;
  select count(*) into v_versao from public.especialidades where id = v_esp_b;
  execute 'reset role';
  if v_n = 0 and v_versao = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   owner A não altera técnico nem lê especialidades de B';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA acesso a dados de B'; end if;

  begin
    execute 'set local role authenticated';
    perform public.salvar_tecnico(v_tec_b, 1, jsonb_build_object('nome', 'invadido via RPC'), null);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA salvar_tecnico alterou técnico de B';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   salvar_tecnico com ID de B → não encontrado';
  end;
  execute 'reset role';

  -- anônimo
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.listar_tecnicos();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo listou técnicos';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lista técnicos';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
