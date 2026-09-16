-- =====================================================================
-- Teste do módulo de Clientes (Fase 2 · 04)
-- Documentos, transação, permissões por cargo, arquivamento, concorrência,
-- endereços (principal único), busca sem acento, histórico e isolamento A × B.
-- Tudo dentro de uma transação desfeita ao final.
-- Resultado esperado: "TOTAL: N ok, 0 falhas".
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_cli_pj uuid; v_cli_pf uuid; v_cli_b uuid; v_tmp uuid;
  v_end1 uuid; v_end2 uuid;
  v_status_a uuid;
  v_n int; v_versao int;
  v_txt text;
  v_json jsonb;
  v_ok int := 0; v_falhas int := 0;
  v_log text := '';

  -- helpers de relatório não existem em DO; usamos o padrão abaixo em cada caso
begin
  -- ---------------- Funções de documento ----------------
  if public.cpf_valido('52998224725') and not public.cpf_valido('52998224724')
     and not public.cpf_valido('11111111111') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   CPF: dígito verificador e sequências repetidas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA validação de CPF'; end if;

  if public.cnpj_valido('11222333000181') and public.cnpj_valido('12ABC34501DE35')
     and not public.cnpj_valido('11222333000182') and not public.cnpj_valido('12ABC34501DE36') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   CNPJ numérico e alfanumérico (regra 2026)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA validação de CNPJ'; end if;

  if public.normalizar_busca('João Ávila') = 'joao avila' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   normalização de busca sem acento';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA normalizar_busca'; end if;

  -- ---------------- Preparação ----------------
  select id into v_plano from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_owner_b, v_atend_a, v_tec_a]) u;

  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_atend_a, v_loja_a, 'Atendente A', 'at@teste.invalid', 'funcionario'),
    (v_tec_a,   v_loja_a, 'Técnico A', 'tc@teste.invalid', 'funcionario');
  update public.usuarios set cargo_id = (select id from public.cargos where loja_id = v_loja_a and chave = 'technician')
   where id = v_tec_a;
  insert into public.status_os (loja_id, nome, categoria) values (v_loja_a, 'Aberta', 'aberto') returning id into v_status_a;

  -- ================= Owner A =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);

  execute 'set local role authenticated';
  v_cli_pj := public.criar_cliente(
    jsonb_build_object('tipo_pessoa', 'pj', 'razao_social', 'Condomínio Solar LTDA', 'nome_fantasia', 'Condomínio Solar',
                       'documento', '11.222.333/0001-81', 'email', ' CONTATO@Solar.com ', 'telefone', '(11) 3333-4444',
                       'tags', jsonb_build_array('VIP', ' contrato ', 'vip')),
    jsonb_build_object('rotulo', 'Matriz', 'cep', '01310-100', 'logradouro', 'Av. Paulista', 'numero', '1000',
                       'cidade', 'São Paulo', 'estado', 'sp'));
  execute 'reset role';

  select count(*) into v_n from public.clientes
   where id = v_cli_pj and documento = '11222333000181' and nome = 'Condomínio Solar'
     and email = 'contato@solar.com' and tags = array['contrato', 'vip'] and criado_por = v_owner_a;
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   criar_cliente PJ normaliza documento, nome, e-mail e tags';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA normalização do cliente PJ'; end if;

  select count(*) into v_n from public.cliente_enderecos
   where cliente_id = v_cli_pj and principal and cep = '01310100' and estado = 'SP' and loja_id = v_loja_a;
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço principal criado na mesma transação';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço principal'; end if;

  select count(*) into v_n from public.clientes where loja_id = v_loja_a;
  begin
    execute 'set local role authenticated';
    perform public.criar_cliente(jsonb_build_object('nome', 'Cliente Endereço Ruim'),
                                 jsonb_build_object('logradouro', 'Rua X', 'cidade', 'Y', 'estado', 'XX'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço com UF inválida aceito';
  exception when others then
    null;
  end;
  execute 'reset role';
  if (select count(*) from public.clientes where loja_id = v_loja_a) = v_n then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço inválido desfaz também o cliente (atômico)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cliente ficou criado sem endereço'; end if;

  begin
    execute 'set local role authenticated';
    perform public.criar_cliente(jsonb_build_object('tipo_pessoa', 'pf', 'nome', 'CPF Ruim', 'documento', '529.982.247-24'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA CPF inválido aceito';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   CPF inválido → negado pelo banco';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.criar_cliente(jsonb_build_object('tipo_pessoa', 'pj', 'nome', 'Sem razão'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA PJ sem razão social aceita';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   PJ sem razão social → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.criar_cliente(jsonb_build_object('tipo_pessoa', 'pj', 'razao_social', 'Duplicada SA', 'documento', '11222333000181'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA CNPJ duplicado na mesma empresa aceito';
  exception when unique_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   CNPJ duplicado na mesma empresa → negado';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_cli_pf := public.criar_cliente(jsonb_build_object('tipo_pessoa', 'pf', 'nome', 'João Ávila', 'documento', '52998224725',
                                                      'tags', jsonb_build_array('residencial')));
  select count(*) into v_n from public.clientes where busca like '%' || public.normalizar_busca('joao avil') || '%';
  execute 'reset role';
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   busca "joao avil" encontra "João Ávila"';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA busca sem acento: %s', v_n); end if;

  -- ---------------- Endereços ----------------
  select id into v_end1 from public.cliente_enderecos where cliente_id = v_cli_pj and principal;
  execute 'set local role authenticated';
  insert into public.cliente_enderecos (loja_id, cliente_id, rotulo, logradouro, cidade, estado, principal)
  values (v_loja_a, v_cli_pj, 'Filial', 'Rua B', 'Campinas', 'SP', true) returning id into v_end2;
  select count(*) into v_n from public.cliente_enderecos where cliente_id = v_cli_pj and principal;
  execute 'reset role';
  if v_n = 1 and (select principal from public.cliente_enderecos where id = v_end2) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   novo endereço principal desmarca o anterior (sempre 1 principal)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA principal único: %s', v_n); end if;

  begin
    execute 'set local role authenticated';
    update public.cliente_enderecos set principal = false where id = v_end2;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cliente ficou sem endereço principal';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   desmarcar o único principal → negado';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  delete from public.cliente_enderecos where id = v_end2;
  execute 'reset role';
  if (select principal from public.cliente_enderecos where id = v_end1) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir o principal promove o endereço restante';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA promoção de principal'; end if;

  -- ---------------- Concorrência otimista ----------------
  select versao into v_versao from public.clientes where id = v_cli_pf;
  execute 'set local role authenticated';
  update public.clientes set telefone = '(11) 98888-7777' where id = v_cli_pf and versao = v_versao;
  get diagnostics v_n = row_count;
  update public.clientes set telefone = '(11) 97777-6666' where id = v_cli_pf and versao = v_versao;
  get diagnostics v_versao = row_count;
  execute 'reset role';
  if v_n = 1 and v_versao = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   edição com versão desatualizada não sobrescreve (0 linhas)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA concorrência: %s / %s', v_n, v_versao); end if;

  -- ================= Atendente (sem customers.archive) =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.clientes set observacoes = 'Portão azul' where id = v_cli_pf;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente edita cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente não conseguiu editar'; end if;

  begin
    execute 'set local role authenticated';
    update public.clientes set arquivado_em = now() where id = v_cli_pf;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente arquivou cliente';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente sem customers.archive → arquivar negado';
  end;
  execute 'reset role';

  -- ================= Técnico (somente leitura) =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes;
  update public.clientes set nome = 'Alterado pelo técnico' where id = v_cli_pf;
  get diagnostics v_versao = row_count;
  execute 'reset role';
  if v_n = 2 and v_versao = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico lê clientes mas não edita';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA técnico: lê %s, editou %s', v_n, v_versao); end if;

  begin
    execute 'set local role authenticated';
    perform public.criar_cliente(jsonb_build_object('nome', 'Criado pelo técnico'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico criou cliente';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico sem customers.create → negado';
  end;
  execute 'reset role';

  -- ================= Owner A: arquivamento =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli_pf, v_status_a, 'OS do João');

  execute 'set local role authenticated';
  update public.clientes set arquivado_em = now() where id = v_cli_pf;
  delete from public.clientes where id = v_cli_pj;
  get diagnostics v_n = row_count;
  select count(*) into v_versao from public.ordens_servico where cliente_id = v_cli_pf;
  execute 'reset role';

  if exists (select 1 from public.clientes where id = v_cli_pf and arquivado_em is not null and arquivado_por = v_owner_a)
     and exists (select 1 from public.logs_auditoria where entidade_id = v_cli_pf and acao = 'cliente_arquivado') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   arquivamento registra autor e auditoria';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA arquivamento/auditoria'; end if;

  if v_n = 0 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   exclusão definitiva de cliente → bloqueada';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cliente excluído'; end if;

  if v_versao = 1 then v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS continua visível após arquivar o cliente';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA OS sumiu com o cliente arquivado'; end if;

  execute 'set local role authenticated';
  v_json := public.cliente_historico(v_cli_pj, 50);
  select array_to_string(array(select public.clientes_tags()), ',') into v_txt;
  execute 'reset role';
  if v_json @> '[{"acao":"cliente_cadastrado"}]' and v_json @> '[{"acao":"cliente_endereco_removido","rotulo":"Filial"}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   histórico do cliente (cadastro e endereços)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA histórico: %s', v_json); end if;

  -- ================= Owner B e isolamento =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_cli_b := public.criar_cliente(jsonb_build_object('tipo_pessoa', 'pj', 'razao_social', 'Outra Empresa SA',
                                                     'documento', '11222333000181', 'tags', jsonb_build_array('segredo-b')));
  execute 'reset role';
  if v_cli_b is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mesmo CNPJ pode existir em outra empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA CNPJ bloqueado entre empresas'; end if;

  if v_txt = 'contrato,residencial,vip' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   tags sugeridas são só da própria empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA tags: %s', v_txt); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.clientes where id = v_cli_b;
  update public.clientes set nome = 'invadido' where id = v_cli_b;
  get diagnostics v_versao = row_count;
  execute 'reset role';
  if v_n = 0 and v_versao = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   owner A não lê nem altera cliente de B';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA acesso a cliente de B'; end if;

  begin
    execute 'set local role authenticated';
    insert into public.cliente_enderecos (loja_id, cliente_id, logradouro, cidade, estado)
    values (v_loja_a, v_cli_b, 'Rua Forjada', 'X', 'SP');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço (loja A) em cliente de B aceito';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço apontando para cliente de B → negado (FK de tenant)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    insert into public.cliente_enderecos (loja_id, cliente_id, logradouro, cidade, estado)
    values (v_loja_b, v_cli_b, 'Rua Forjada', 'X', 'SP');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA endereço com loja_id de B aceito';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   endereço com loja_id de B → negado (RLS)';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    perform public.cliente_historico(v_cli_b, 10);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA histórico de cliente de B acessível';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   histórico de cliente de B → negado';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.clientes set loja_id = v_loja_b where id = v_cli_pj;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cliente movido para empresa B';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   mover cliente para outra empresa → negado';
  end;
  execute 'reset role';

  -- anônimo
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.criar_cliente(jsonb_build_object('nome', 'anon'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo criou cliente';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não cria clientes';
  end;
  execute 'reset role';

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
