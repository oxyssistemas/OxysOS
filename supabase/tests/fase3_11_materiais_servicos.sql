-- =====================================================================
-- Teste de materiais e serviços (Fase 3 · 20 a 22 — etapa 13)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre o catálogo da empresa, o item da OS vindo do catálogo, a
-- permissão `service_orders.add_material` (lançar sem editar a OS e sem
-- definir preço), o que cada cargo enxerga e o isolamento entre empresas.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_campo_a uuid := gen_random_uuid();
  v_campo2_a uuid := gen_random_uuid();
  v_leitor_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_cargo_campo uuid; v_cargo_leitor uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid; v_st_fim uuid;
  v_os uuid; v_os_b uuid;
  v_cabo uuid; v_visita uuid; v_cabo_b uuid; v_inativo uuid; v_sem_uso uuid;
  v_i_cat uuid; v_i_avulso uuid; v_i_gestor uuid;
  v_json jsonb; v_n int; v_num numeric;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_campo_a, v_campo2_a, v_leitor_a, v_owner_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_campo_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_campo2_a, v_loja_a, 'Marina', 'ma@teste.invalid', 'funcionario'),
    (v_leitor_a, v_loja_a, 'Leitor', 'le@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');

  -- cargo de campo: lança material, mas não edita a OS nem as configurações
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Campo', 'Lança material', false) returning id into v_cargo_campo;
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Leitor', 'Só consulta', false) returning id into v_cargo_leitor;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values
    (v_cargo_campo, 'dashboard.view'), (v_cargo_campo, 'service_orders.view'), (v_cargo_campo, 'service_orders.add_material'),
    (v_cargo_leitor, 'dashboard.view'), (v_cargo_leitor, 'service_orders.view');
  update public.usuarios set cargo_id = v_cargo_campo where id in (v_campo_a, v_campo2_a);
  update public.usuarios set cargo_id = v_cargo_leitor where id = v_leitor_a;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Instalação') returning id into v_os;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);

  -- ---------------- catálogo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_cabo := public.salvar_item_catalogo(null, null, jsonb_build_object(
    'tipo', 'material', 'nome', '  Cabo   UTP cat6 ', 'unidade', 'M', 'valor_padrao', '3.50', 'codigo', 'cb-utp6'));
  v_visita := public.salvar_item_catalogo(null, null, jsonb_build_object(
    'tipo', 'servico', 'nome', 'Visita técnica', 'unidade', 'un', 'valor_padrao', '150'));
  v_inativo := public.salvar_item_catalogo(null, null, jsonb_build_object(
    'tipo', 'material', 'nome', 'Conector antigo', 'ativo', false));
  v_sem_uso := public.salvar_item_catalogo(null, null, jsonb_build_object('tipo', 'peca', 'nome', 'Fonte 12V'));
  execute 'reset role';
  if exists (select 1 from public.catalogo_itens
              where id = v_cabo and nome = 'Cabo UTP cat6' and unidade = 'm' and valor_padrao = 3.50 and codigo = 'cb-utp6')
     and (select count(*) from public.catalogo_itens where loja_id = v_loja_a) = 4 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   catálogo grava nome limpo, unidade em minúscula, valor e código';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA gravação do catálogo'; end if;

  execute 'set local role authenticated';
  begin
    perform public.salvar_item_catalogo(null, null, jsonb_build_object('tipo', 'material', 'nome', 'cabo utp CAT6'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA nome repetido no mesmo tipo aceito';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o mesmo nome não se repete no mesmo tipo (acento e caixa não contam)';
  end;

  begin
    perform public.salvar_item_catalogo(null, null, jsonb_build_object('tipo', 'peca', 'nome', 'Outro', 'codigo', 'CB-UTP6'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA código repetido aceito';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   código do catálogo não se repete na empresa';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.salvar_item_catalogo(null, null, jsonb_build_object('tipo', 'material', 'nome', 'Do técnico'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico mexeu no catálogo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o catálogo é das configurações (settings.manage)';
  end;

  -- ---------------- lançar material em campo ----------------
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario, unidade, observacao, catalogo_item_id)
  values (v_os, 'servico', 'nome forjado', 20, 999, 'km', 'Passagem no forro', v_cabo)
  returning id into v_i_cat;
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario, observacao)
  values (v_os, 'material', 'Abraçadeira avulsa', 5, 777, 'Sobrou do estoque do cliente')
  returning id into v_i_avulso;
  execute 'reset role';
  if exists (select 1 from public.os_itens
              where id = v_i_cat and tipo = 'material' and descricao = 'Cabo UTP cat6' and unidade = 'm'
                and valor_unitario = 3.50 and quantidade = 20 and observacao = 'Passagem no forro'
                and criado_por = v_campo_a)
     and exists (select 1 from public.os_itens where id = v_i_avulso and valor_unitario = 0 and unidade = 'un') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item do catálogo manda no nome/unidade e o preço não vem do cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA lançamento do material em campo'; end if;

  execute 'set local role authenticated';
  begin
    insert into public.os_itens (os_id, tipo, descricao, quantidade, catalogo_item_id)
    values (v_os, 'material', 'x', 1, v_inativo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA item desativado do catálogo aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item desativado do catálogo não entra na OS';
  end;
  execute 'reset role';

  -- catálogo de outra empresa
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_cabo_b := public.salvar_item_catalogo(null, null, jsonb_build_object('tipo', 'material', 'nome', 'Cabo da empresa B'));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade, catalogo_item_id)
    values (v_os, 'material', 'x', 1, v_cabo_b);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA usou item do catálogo de outra empresa';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   catálogo de outra empresa não entra na OS';
  end;
  execute 'reset role';

  -- ---------------- quem mexe no quê ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.os_itens (os_id, tipo, descricao, quantidade, valor_unitario, unidade)
  values (v_os, 'servico', 'Instalação combinada', 1, 450, 'un')
  returning id into v_i_gestor;
  execute 'reset role';
  if exists (select 1 from public.os_itens where id = v_i_gestor and valor_unitario = 450) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem edita a OS define o preço livremente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA preço definido pelo gestor'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_campo2_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.os_itens set quantidade = 99 where id = v_i_cat;
  get diagnostics v_n = row_count;
  delete from public.os_itens where id = v_i_avulso;
  get diagnostics v_num = row_count;
  execute 'reset role';
  if v_n = 0 and v_num = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem só lança material não mexe no item de outra pessoa';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA alterou %s e removeu %s itens de outro', v_n, v_num); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.os_itens set quantidade = 25, valor_unitario = 999 where id = v_i_cat;
  delete from public.os_itens where id = v_i_avulso;
  execute 'reset role';
  if exists (select 1 from public.os_itens where id = v_i_cat and quantidade = 25 and valor_unitario = 3.50)
     and not exists (select 1 from public.os_itens where id = v_i_avulso) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico ajusta e remove o que ele mesmo lançou, sem mexer no preço';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA edição do próprio item'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_leitor_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade) values (v_os, 'material', 'Do leitor', 1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA quem só lê lançou item';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem só consulta não lança item';
  end;
  execute 'reset role';

  -- ---------------- consulta ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.itens_os(v_os);
  execute 'reset role';
  if (v_json->>'pode_lancar')::boolean
     and not (v_json->>'mostra_valores')::boolean
     and jsonb_array_length(v_json->'itens') = 2
     -- itens criados na mesma transação empatam no criado_em: localizar pelo nome, não pela posição
     and (select e->'valor_unitario' from jsonb_array_elements(v_json->'itens') e where e->>'descricao' = 'Cabo UTP cat6') = 'null'::jsonb
     and (select e->>'unidade' from jsonb_array_elements(v_json->'itens') e where e->>'descricao' = 'Cabo UTP cat6') = 'm' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico vê o que usou, com unidade, mas sem preço';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA consulta do técnico: %s', v_json); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.itens_os(v_os);
  select valor_total into v_num from public.ordens_servico where id = v_os;
  execute 'reset role';
  if (v_json->>'mostra_valores')::boolean
     and (select (e->>'subtotal')::numeric from jsonb_array_elements(v_json->'itens') e where e->>'descricao' = 'Cabo UTP cat6') = 87.50
     and v_num = 537.50 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem edita a OS vê valores e o total da OS acompanha os itens';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA valores: total %s / %s', v_num, v_json->'itens'->0); end if;

  if exists (select 1 from public.log_eventos
              where acao = 'os_item_adicionado' and detalhes->>'item' = 'Cabo UTP cat6' and detalhes->>'unidade' = 'm') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a linha do tempo registra o item com unidade';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA evento do item'; end if;

  -- ---------------- outra empresa e anônimo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.catalogo_itens where loja_id = v_loja_a;
  select v_n + count(*) into v_n from public.os_itens where os_id = v_os;
  begin
    perform public.itens_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B leu os itens da empresa A';
  exception when no_data_found then
    v_n := v_n;
  end;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê catálogo nem itens da empresa A';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa B enxerga %s registros de A', v_n); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.listar_catalogo_itens();
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu o catálogo';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê o catálogo';
  end;
  execute 'reset role';

  -- ---------------- desativar e excluir no catálogo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.excluir_item_catalogo(v_cabo);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA excluiu item de catálogo já usado';
  exception when foreign_key_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item de catálogo já usado em OS não é excluído';
  end;
  perform public.definir_item_catalogo_ativo(v_cabo, false);
  perform public.excluir_item_catalogo(v_sem_uso);
  v_json := public.listar_catalogo_itens();
  execute 'reset role';
  if not exists (select 1 from public.catalogo_itens where id = v_sem_uso)
     and exists (select 1 from public.catalogo_itens where id = v_cabo and not ativo)
     and v_json @> jsonb_build_array(jsonb_build_object('nome', 'Cabo UTP cat6', 'total_uso', 1)) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   item usado é desativado, item sem uso é excluído e a lista mostra o uso';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA desativar/excluir no catálogo'; end if;

  -- ---------------- OS encerrada ----------------
  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os, v_st_fim);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.os_itens (os_id, tipo, descricao, quantidade) values (v_os, 'material', 'Depois de fechar', 1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA lançou item em OS encerrada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada não recebe item novo';
  end;
  execute 'reset role';

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.lojas where id = v_loja_a;
  if not exists (select 1 from public.catalogo_itens where loja_id = v_loja_a)
     and not exists (select 1 from public.os_itens where os_id = v_os) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa leva junto o catálogo e os itens';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA catálogo/itens restaram após excluir a empresa'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
