-- =====================================================================
-- Revisão de segurança da fase 3 (Fase 3 · 32/33 — etapa 19)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- §68: técnico A → OS da empresa B; owner A → agenda da empresa B; técnico
-- trocando a empresa da OS; técnico → função de owner; plano sem dispatch;
-- empresa suspensa. §55: o técnico vê só as OS dele, da equipe dele ou com
-- visita marcada para ele — pela tabela, pelas funções (ler e alterar), pela
-- lista, agenda, dashboard, central de despacho e arquivos do Storage; quem tem
-- service_orders.view_all volta a ver tudo. Também: anon sem nada no schema.
-- =====================================================================
do $$
declare
  v_pro uuid; v_start uuid;
  v_loja_a uuid; v_loja_b uuid; v_loja_c uuid;
  v_owner_a uuid := gen_random_uuid();
  v_carlos uuid := gen_random_uuid();
  v_bruno uuid := gen_random_uuid();
  v_dani uuid := gen_random_uuid();
  v_ana uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_owner_c uuid := gen_random_uuid();
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_eq uuid; v_supervisor uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid;
  v_os1 uuid; v_os2 uuid; v_os3 uuid; v_os4 uuid; v_os_b uuid;
  v_json jsonb; v_txt text; v_n int; v_m int; v_b1 boolean; v_b2 boolean;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_pro from public.planos where nome = 'Pro';
  select id into v_start from public.planos where nome = 'Start';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_carlos, v_bruno, v_dani, v_ana, v_owner_b, v_owner_c]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.lojas (nome) values ('TESTE Empresa C') returning id into v_loja_c;
  insert into public.assinaturas (loja_id, plano_id, status) values
    (v_loja_a, v_pro, 'active'), (v_loja_b, v_pro, 'active'), (v_loja_c, v_start, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_carlos, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_bruno, v_loja_a, 'Bruno', 'br@teste.invalid', 'funcionario'),
    (v_dani, v_loja_a, 'Dani', 'da@teste.invalid', 'funcionario'),
    (v_ana, v_loja_a, 'Ana', 'an@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente'),
    (v_owner_c, v_loja_c, 'Owner C', 'oc@teste.invalid', 'gerente');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'technician' and u.id in (v_carlos, v_bruno, v_dani);
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and c.chave = 'attendant' and u.id = v_ana;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_carlos) returning id into v_t1;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Bruno', 'Lima', v_bruno) returning id into v_t2;
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Dani', 'Reis', v_dani) returning id into v_t3;
  insert into public.equipes (loja_id, nome) values (v_loja_a, 'Equipe Norte') returning id into v_eq;
  insert into public.equipe_membros (loja_id, equipe_id, tecnico_id, lider) values
    (v_loja_a, v_eq, v_t1, true), (v_loja_a, v_eq, v_t3, false);
  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  -- OS1: do Carlos · OS2: do Bruno · OS3: da equipe (Carlos e Dani) · OS4: sem técnico, visita marcada para Carlos
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tecnico_id) values (v_loja_a, v_cli, v_st, 'OS do Carlos', v_t1) returning id into v_os1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, tecnico_id) values (v_loja_a, v_cli, v_st, 'OS do Bruno', v_t2) returning id into v_os2;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao, equipe_id) values (v_loja_a, v_cli, v_st, 'OS da equipe', v_eq) returning id into v_os3;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'OS agendada') returning id into v_os4;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_b, v_cli_b, v_st_b, 'OS da empresa B') returning id into v_os_b;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em) values
    (v_loja_a, v_os1, v_t1, now() + interval '1 hour', now() + interval '2 hours'),
    (v_loja_a, v_os2, v_t2, now() + interval '1 hour', now() + interval '2 hours'),
    (v_loja_a, v_os4, v_t1, now() + interval '3 hours', now() + interval '4 hours');
  insert into public.agendamentos (loja_id, os_id, inicio_em, fim_em) values
    (v_loja_b, v_os_b, now() + interval '1 hour', now() + interval '2 hours');

  -- ================= §55 escopo do técnico =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where id in (v_os1, v_os3, v_os4)), count(*) filter (where id = v_os2) into v_n, v_m from public.ordens_servico;
  execute 'reset role';
  if v_n = 3 and v_m = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico lê na tabela as OS dele, da equipe e com visita dele — não a do colega';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA tabela: vê %s das suas, %s do colega', v_n, v_m); end if;

  begin
    execute 'set local role authenticated';
    perform public.obter_ordem_servico(v_os2);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico abriu a OS do colega pelo id (URL)';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   trocar o id na URL: OS do colega → "não encontrada"';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  v_txt := public.obter_ordem_servico(v_os1)::text;
  v_json := public.listar_ordens_servico(p_grupo => 'todas');
  execute 'reset role';
  if v_txt is not null and (v_json->>'total')::int = 3 and v_json::text not like '%' || v_os2 || '%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a própria OS abre; a lista de OS traz só as 3 do escopo';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA lista: total %s', v_json->>'total'); end if;

  v_n := 0;
  foreach v_txt in array array['timeline', 'anexos', 'status', 'relatorio', 'horas'] loop
    begin
      execute 'set local role authenticated';
      case v_txt
        when 'timeline' then perform public.timeline_os(v_os2);
        when 'anexos' then perform public.anexos_os(v_os2);
        when 'status' then perform public.alterar_status_os(v_os2, v_st, 'forçado');
        when 'relatorio' then perform public.relatorio_tecnico_os(v_os2);
        when 'horas' then perform public.horas_os(v_os2);
      end case;
    exception when no_data_found then
      v_n := v_n + 1;
    end;
    execute 'reset role';
  end loop;
  if v_n = 5 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   funções da OS do colega (timeline, anexos, status, relatório, horas) → "não encontrada"';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA funções por id: %s de 5 barradas', v_n); end if;

  execute 'set local role authenticated';
  update public.ordens_servico set descricao = 'alterada pelo colega' where id = v_os2;
  get diagnostics v_n = row_count;
  select count(*) into v_m from public.agendamentos where os_id = v_os2;
  execute 'reset role';
  if v_n = 0 and v_m = 0 and exists (select 1 from public.ordens_servico where id = v_os2 and descricao = 'OS do Bruno') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   update direto na OS do colega não pega nada; agendamento dela invisível';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA update/agendamento: %s / %s', v_n, v_m); end if;

  execute 'set local role authenticated';
  v_json := public.agenda_periodo(now() - interval '1 day', now() + interval '1 day');
  v_txt := public.dashboard_resumo(now() - interval '30 days', now() + interval '1 day')->>'os_por_tecnico';
  execute 'reset role';
  if v_json::text like '%' || v_os1 || '%' and v_json::text like '%' || v_os4 || '%' and v_json::text not like '%' || v_os2 || '%'
     and v_txt like '%' || v_t1 || '%' and v_txt not like '%' || v_t2 || '%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   agenda e dashboard do técnico contam só o escopo dele';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA agenda/dashboard: %s', v_txt); end if;

  begin
    execute 'set local role authenticated';
    perform public.painel_despacho(null, 'America/Sao_Paulo');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico restrito abriu a central de despacho';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   central de despacho (todas as OS) negada ao técnico restrito';
  end;
  execute 'reset role';

  -- Storage: pasta da OS do colega
  execute 'set local role authenticated';
  v_b1 := public.pode_acessar_arquivo_os(v_loja_a || '/' || v_os1 || '/foto.jpg', 'ver');
  v_b2 := public.pode_acessar_arquivo_os(v_loja_a || '/' || v_os2 || '/foto.jpg', 'ver');
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('os-anexos', v_loja_a || '/' || v_os2 || '/forjado.jpg', v_carlos, v_carlos::text, '{"size": 10, "mimetype": "image/jpeg"}');
    v_txt := 'aceito';
  exception when insufficient_privilege then
    v_txt := 'negado';
  end;
  execute 'reset role';
  if v_b1 and not v_b2 and v_txt = 'negado' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   arquivos: vê os da própria OS; ler/enviar na pasta da OS do colega → negado';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA storage: própria %s, colega %s, upload %s', v_b1, v_b2, v_txt); end if;

  -- equipe: Dani vê a OS da equipe, não a do Carlos
  perform set_config('request.jwt.claims', json_build_object('sub', v_dani, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where id = v_os3), count(*) filter (where id in (v_os1, v_os2, v_os4)) into v_n, v_m from public.ordens_servico;
  execute 'reset role';
  if v_n = 1 and v_m = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   membro da equipe vê a OS da equipe e não as individuais dos colegas';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA equipe: %s / %s', v_n, v_m); end if;

  -- Bruno só vê a dele; promovido a cargo com view_all, vê tudo
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.cargos (loja_id, nome, descricao, sistema) values (v_loja_a, 'Supervisor de campo', 'teste', false) returning id into v_supervisor;
  insert into public.cargo_permissoes (cargo_id, permissao_chave)
  select v_supervisor, permissao_chave from public.cargo_permissoes cp join public.cargos c on c.id = cp.cargo_id
  where c.loja_id = v_loja_a and c.chave = 'technician'
  union all select v_supervisor, 'service_orders.view_all';
  update public.usuarios set cargo_id = v_supervisor where id = v_bruno;
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.ordens_servico;
  v_json := public.listar_ordens_servico(p_grupo => 'todas');
  execute 'reset role';
  if v_n = 1 and v_m = 4 and (v_json->>'total')::int = 4 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico com service_orders.view_all volta a ver todas as OS da empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA view_all: antes %s, depois %s / %s', v_n, v_m, v_json->>'total'); end if;

  -- quem não é técnico não muda
  perform set_config('request.jwt.claims', json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.ordens_servico;
  execute 'reset role';
  if v_n = 4 and v_m = 4 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendente e owner seguem vendo todas as OS';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA atendente %s / owner %s', v_n, v_m); end if;

  if exists (select 1 from public.cargo_permissoes cp join public.cargos c on c.id = cp.cargo_id
             where c.loja_id = v_loja_a and c.chave = 'attendant' and cp.permissao_chave = 'service_orders.view_all')
     and exists (select 1 from public.cargo_permissoes cp join public.cargos c on c.id = cp.cargo_id
             where c.loja_id = v_loja_a and c.chave = 'manager' and cp.permissao_chave = 'service_orders.view_all')
     and not exists (select 1 from public.cargo_permissoes cp join public.cargos c on c.id = cp.cargo_id
             where c.chave = 'technician' and cp.permissao_chave = 'service_orders.view_all') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa nova: gerente e atendente com view_all; nenhum cargo Técnico tem';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA seed/backfill de service_orders.view_all'; end if;

  -- ================= §68 =================
  -- técnico A → OS da empresa B
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico where id = v_os_b;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.obter_ordem_servico(v_os_b);
    v_txt := 'abriu';
  exception when no_data_found or insufficient_privilege then
    v_txt := 'negado';
  end;
  execute 'reset role';
  if v_n = 0 and v_txt = 'negado' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico A → OS da empresa B: NEGADO';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA técnico A → OS B: %s / %s', v_n, v_txt); end if;

  -- técnico trocando a empresa da própria OS
  begin
    execute 'set local role authenticated';
    update public.ordens_servico set loja_id = v_loja_b where id = v_os1;
    v_txt := 'aceito';
  exception when insufficient_privilege or foreign_key_violation or check_violation then
    v_txt := 'negado';
  end;
  execute 'reset role';
  if v_txt = 'negado' and exists (select 1 from public.ordens_servico where id = v_os1 and loja_id = v_loja_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico alterando company_id da OS: NEGADO';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico mudou a empresa da OS'; end if;

  -- técnico → função de owner (cargos e permissões)
  begin
    execute 'set local role authenticated';
    perform public.salvar_cargo(null, null, jsonb_build_object('nome', 'Chefe'), array['team.manage']);
    v_txt := 'aceito';
  exception when insufficient_privilege then
    v_txt := 'negado';
  end;
  execute 'reset role';
  if v_txt = 'negado' and not exists (select 1 from public.cargos where loja_id = v_loja_a and nome = 'Chefe') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   técnico → endpoint de owner (salvar cargo): NEGADO';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA técnico criou cargo'; end if;

  -- owner A → agenda da empresa B
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.agendamentos where loja_id = v_loja_b;
  v_json := public.agenda_periodo(now() - interval '1 day', now() + interval '1 day');
  execute 'reset role';
  if v_n = 0 and v_json::text not like '%' || v_os_b || '%' and v_json::text like '%' || v_os2 || '%' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   owner A → agenda da empresa B: NEGADO (vê só a própria)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA owner A → agenda B: %s', v_n); end if;

  -- plano sem dispatch
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_c, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    perform public.painel_despacho(null, 'America/Sao_Paulo');
    v_txt := 'abriu';
  exception when insufficient_privilege then
    v_txt := 'negado';
  end;
  execute 'reset role';
  if v_txt = 'negado' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   sem feature dispatch: central NEGADA';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA plano Start abriu a central'; end if;

  -- empresa suspensa
  update public.lojas set status = 'suspensa' where id = v_loja_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_carlos, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ordens_servico;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform public.obter_ordem_servico(v_os1);
    v_txt := 'abriu';
  exception when others then
    v_txt := 'negado';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.agendamentos;
  execute 'reset role';
  update public.lojas set status = 'ativa' where id = v_loja_a;
  if v_n = 0 and v_txt = 'negado' and v_m = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa suspensa: técnico e owner BLOQUEADOS';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa suspensa: OS %s, função %s, agenda %s', v_n, v_txt, v_m); end if;

  -- ================= exposição =================
  if not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')
     and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute'))
     and not has_function_privilege('authenticated', 'public.exigir_os_visivel(uuid)', 'execute') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anon sem tabela nem função no schema public; helper interno fora da API';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA privilégios de anon/helpers'; end if;

  raise exception E'%\n\nTOTAL: % ok, % falhas (transação desfeita de propósito)', v_log, v_ok, v_falhas;
end;
$$;
