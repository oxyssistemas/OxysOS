-- =====================================================================
-- Teste de fotos e evidências (Fase 3 · 18 e 19 — etapa 12)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre as seis categorias, a autoria do técnico gravada pelo servidor,
-- a permissão `attachments.upload` no Storage e na tabela, a remoção só
-- do que a pessoa enviou, a imutabilidade do anexo e o isolamento entre
-- empresas (Storage e RLS).
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
  v_t1 uuid; v_t2 uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid;
  v_os uuid; v_os_b uuid;
  v_c1 text; v_c2 text; v_c3 text; v_c4 text; v_doc text;
  v_a1 uuid; v_a2 uuid; v_adoc uuid;
  v_json jsonb; v_n int;
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

  -- cargo de campo: anexa, mas não edita a OS
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Campo', 'Anexa evidências', false) returning id into v_cargo_campo;
  insert into public.cargos (loja_id, nome, descricao, sistema)
    values (v_loja_a, 'Leitor', 'Só consulta', false) returning id into v_cargo_leitor;
  insert into public.cargo_permissoes (cargo_id, permissao_chave) values
    (v_cargo_campo, 'dashboard.view'), (v_cargo_campo, 'service_orders.view'), (v_cargo_campo, 'attachments.upload'),
    (v_cargo_leitor, 'dashboard.view'), (v_cargo_leitor, 'service_orders.view');
  update public.usuarios set cargo_id = v_cargo_campo where id in (v_campo_a, v_campo2_a);
  update public.usuarios set cargo_id = v_cargo_leitor where id = v_leitor_a;

  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_campo_a) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Marina', 'Reis', v_campo2_a) returning id into v_t2;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_a, v_cli, v_st, 'Instalação') returning id into v_os;
  -- fase3_32: técnico só mexe em OS do próprio escopo — os dois têm visita nesta OS
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os, v_t1, now(), now() + interval '1 hour'),
    (v_loja_a, v_os, v_t2, now() + interval '2 hours', now() + interval '3 hours');
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao)
    values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);

  v_c1 := v_loja_a || '/' || v_os || '/problema.jpg';
  v_c2 := v_loja_a || '/' || v_os || '/equipamento.jpg';
  v_c3 := v_loja_a || '/' || v_os || '/da-marina.jpg';
  v_c4 := v_loja_a || '/' || v_os || '/do-gestor.jpg';
  v_doc := v_loja_a || '/' || v_os || '/laudo.pdf';

  -- ---------------- Storage com attachments.upload ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('os-anexos', v_c1, v_campo_a, v_campo_a::text, '{"size": 2048, "mimetype": "image/jpeg"}'),
         ('os-anexos', v_c2, v_campo_a, v_campo_a::text, '{"size": 3072, "mimetype": "image/jpeg"}');
  execute 'reset role';
  v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem tem attachments.upload envia arquivo para a pasta da OS';

  perform set_config('request.jwt.claims', json_build_object('sub', v_leitor_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('os-anexos', v_loja_a || '/' || v_os || '/do-leitor.jpg', v_leitor_a, v_leitor_a::text, '{"size": 10, "mimetype": "image/jpeg"}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA cargo só leitura enviou arquivo';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem só consulta não envia arquivo';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('os-anexos', v_c4, v_owner_b, v_owner_b::text, '{"size": 10, "mimetype": "image/jpeg"}');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B enviou na pasta da empresa A';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não envia arquivo na pasta da empresa A';
  end;
  execute 'reset role';

  -- ---------------- categorias e autoria ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.os_anexos (loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes, descricao, tecnico_id)
  values (v_loja_a, v_os, 'foto', 'problema', 'problema.jpg', v_c1, 'image/jpeg', 1, 'Cabo rompido no rack', v_t2)
  returning id into v_a1;
  insert into public.os_anexos (loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes)
  values (v_loja_a, v_os, 'foto', 'equipamento', 'equipamento.jpg', v_c2, 'image/jpeg', 1)
  returning id into v_a2;
  execute 'reset role';
  if exists (select 1 from public.os_anexos where id = v_a1 and momento = 'problema' and tecnico_id = v_t1
                                              and enviado_por = v_campo_a and descricao = 'Cabo rompido no rack')
     and exists (select 1 from public.os_anexos where id = v_a2 and momento = 'equipamento') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   categorias novas gravadas e a autoria do técnico vem do login (ignora o que o cliente manda)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA categoria/autoria do anexo'; end if;

  -- documento não tem categoria
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
  values ('os-anexos', v_doc, v_owner_a, v_owner_a::text, '{"size": 5000, "mimetype": "application/pdf"}');
  insert into public.os_anexos (loja_id, os_id, tipo, momento, nome_arquivo, caminho, mime_type, tamanho_bytes)
  values (v_loja_a, v_os, 'foto', 'outros', 'laudo.pdf', v_doc, 'image/jpeg', 1)
  returning id into v_adoc;
  execute 'reset role';
  if exists (select 1 from public.os_anexos where id = v_adoc and tipo = 'documento' and momento is null and tecnico_id is null) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   documento perde a categoria e quem não é técnico não vira autoria de campo';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA regras do documento'; end if;

  -- ---------------- galeria ----------------
  execute 'set local role authenticated';
  v_json := public.anexos_os(v_os);
  execute 'reset role';
  if jsonb_array_length(v_json) = 3
     and v_json @> jsonb_build_array(jsonb_build_object('momento', 'problema', 'tecnico', 'Carlos Dias', 'enviado_por', 'Carlos'))
     and not (v_json->0->>'meu')::boolean is null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a galeria traz categoria, técnico e autor';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA galeria: %s', v_json); end if;

  -- ---------------- imutabilidade ----------------
  begin
    execute 'set local role authenticated';
    update public.os_anexos set momento = 'depois' where id = v_a1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA categoria do anexo alterada';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   categoria de anexo já enviado não é alterada';
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update public.os_anexos set tecnico_id = v_t2 where id = v_a1;
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA autoria do anexo trocada';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   autoria do anexo não é trocada depois';
  end;
  execute 'reset role';

  -- ---------------- remoção ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_campo2_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update public.os_anexos set removido_em = now() where id = v_a1;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem só anexa não remove a evidência de outra pessoa';
    else
      v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA removeu evidência de outra pessoa';
    end if;
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem só anexa não remove a evidência de outra pessoa';
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_campo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.os_anexos set removido_em = now() where id = v_a2;
  execute 'reset role';
  if exists (select 1 from public.os_anexos where id = v_a2 and removido_em is not null and removido_por = v_campo_a)
     and exists (select 1 from public.log_eventos where acao = 'os_anexo_removido' and detalhes->>'anexo_id' = v_a2::text) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   o técnico remove a foto que ele mesmo enviou (com evento)';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA remoção pelo autor'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.os_anexos set removido_em = now() where id = v_a1;
  execute 'reset role';
  if exists (select 1 from public.os_anexos where id = v_a1 and removido_em is not null and removido_por = v_owner_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem edita a OS remove qualquer evidência';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA remoção pelo gestor'; end if;

  -- ---------------- outra empresa ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.os_anexos where loja_id = v_loja_a;
  select v_n + count(*) into v_n from storage.objects where bucket_id = 'os-anexos' and name like v_loja_a || '/%';
  begin
    perform public.anexos_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B listou as evidências da empresa A';
  exception when no_data_found then
    v_n := v_n;
  end;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê anexos nem arquivos da empresa A (RLS e Storage)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa B enxerga %s registros de A', v_n); end if;

  -- ---------------- anônimo ----------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.anexos_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu as evidências';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê as evidências';
  end;
  execute 'reset role';

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.lojas where id = v_loja_a;
  if not exists (select 1 from public.os_anexos where loja_id = v_loja_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa leva junto as evidências';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anexos restaram após excluir a empresa'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
