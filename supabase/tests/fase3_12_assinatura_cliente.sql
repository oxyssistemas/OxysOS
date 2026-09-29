-- =====================================================================
-- Teste da assinatura e confirmação do cliente (Fase 3 · 24 — etapa 14)
-- Resultado esperado: "TOTAL: N ok, 0 falhas" (tudo desfeito ao final).
-- Cobre o registro com hash e relógio do servidor, a substituição com
-- histórico, a validação do PNG, a permissão `service_orders.sign`, o
-- documento opcional, a OS encerrada, a escrita direta bloqueada e o
-- isolamento entre empresas.
-- =====================================================================
do $$
declare
  v_plano uuid;
  v_loja_a uuid; v_loja_b uuid;
  v_owner_a uuid := gen_random_uuid();
  v_tec_a uuid := gen_random_uuid();
  v_atend_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_t1 uuid;
  v_cli uuid; v_cli_b uuid; v_st uuid; v_st_b uuid; v_st_fim uuid;
  v_os uuid; v_os2 uuid; v_os_b uuid; v_ag uuid; v_ag2 uuid;
  v_png1 bytea; v_png2 bytea; v_img1 text; v_img2 text; v_jpeg text;
  v_a1 uuid; v_a2 uuid;
  v_json jsonb; v_n int; v_m int;
  v_ok int := 0; v_falhas int := 0; v_log text := '';
begin
  select id into v_plano from public.planos where nome = 'Pro';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u || '@teste.invalid', '', now(), now()
  from unnest(array[v_owner_a, v_tec_a, v_atend_a, v_owner_b]) u;
  insert into public.lojas (nome) values ('TESTE Empresa A') returning id into v_loja_a;
  insert into public.lojas (nome) values ('TESTE Empresa B') returning id into v_loja_b;
  insert into public.assinaturas (loja_id, plano_id, status) values (v_loja_a, v_plano, 'active'), (v_loja_b, v_plano, 'active');
  insert into public.usuarios (id, loja_id, nome, email, papel) values
    (v_owner_a, v_loja_a, 'Owner A', 'oa@teste.invalid', 'gerente'),
    (v_tec_a, v_loja_a, 'Carlos', 'ca@teste.invalid', 'funcionario'),
    (v_atend_a, v_loja_a, 'Atendente', 'at@teste.invalid', 'funcionario'),
    (v_owner_b, v_loja_b, 'Owner B', 'ob@teste.invalid', 'gerente');
  update public.usuarios u set cargo_id = c.id from public.cargos c
   where c.loja_id = v_loja_a and ((u.id = v_tec_a and c.chave = 'technician') or (u.id = v_atend_a and c.chave = 'attendant'));
  insert into public.tecnicos (loja_id, nome, sobrenome, usuario_id) values (v_loja_a, 'Carlos', 'Dias', v_tec_a) returning id into v_t1;

  insert into public.clientes (loja_id, nome) values (v_loja_a, 'Cliente A') returning id into v_cli;
  insert into public.clientes (loja_id, nome) values (v_loja_b, 'Cliente B') returning id into v_cli_b;
  select id into v_st from public.status_os where loja_id = v_loja_a and inicial;
  select id into v_st_b from public.status_os where loja_id = v_loja_b and inicial;
  select id into v_st_fim from public.status_os where loja_id = v_loja_a and categoria = 'finalizado_sucesso' limit 1;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'Instalação') returning id into v_os;
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_a, v_cli, v_st, 'Outra OS') returning id into v_os2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  insert into public.ordens_servico (loja_id, cliente_id, status_id, descricao) values (v_loja_b, v_cli_b, v_st_b, 'Da empresa B') returning id into v_os_b;
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os, v_t1, now(), now() + interval '1 hour') returning id into v_ag;
  insert into public.agendamentos (loja_id, os_id, tecnico_id, inicio_em, fim_em)
    values (v_loja_a, v_os2, v_t1, now() + interval '2 hours', now() + interval '3 hours') returning id into v_ag2;

  -- dois "PNG" (assinatura de arquivo + bytes) e um JPEG disfarçado
  v_png1 := '\x89504e470d0a1a0a'::bytea || extensions.gen_random_bytes(200);
  v_png2 := '\x89504e470d0a1a0a'::bytea || extensions.gen_random_bytes(200);
  v_img1 := 'data:image/png;base64,' || replace(encode(v_png1, 'base64'), E'\n', '');
  v_img2 := 'data:image/png;base64,' || replace(encode(v_png2, 'base64'), E'\n', '');
  v_jpeg := 'data:image/png;base64,' || replace(encode('\xffd8ffe000104a464946'::bytea || extensions.gen_random_bytes(200), 'base64'), E'\n', '');

  -- ---------------- registro em campo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_tec_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.registrar_assinatura_os(v_os, '  Maria   Souza ', null, 'Acompanhou a instalação', v_img1, v_ag);
  execute 'reset role';
  v_a1 := (v_json->>'id')::uuid;
  if exists (select 1 from public.os_assinaturas
              where id = v_a1 and nome_responsavel = 'Maria Souza' and documento is null
                and tecnico_id = v_t1 and registrado_por = v_tec_a and agendamento_id = v_ag
                and hash_sha256 = encode(extensions.digest(v_png1, 'sha256'), 'hex')
                and assinado_em > now() - interval '1 minute' and substituida_em is null)
     and not (v_json->>'substituiu')::boolean then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   assinatura gravada com SHA-256 dos bytes, técnico do login e relógio do servidor (documento opcional)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA registro da assinatura: %s', v_json); end if;

  execute 'set local role authenticated';
  v_json := public.assinatura_os(v_os);
  execute 'reset role';
  if (v_json->>'pode_assinar')::boolean and v_json->'atual'->>'imagem_png' = v_img1
     and v_json->'atual'->>'tecnico' = 'Carlos Dias' and jsonb_array_length(v_json->'substituidas') = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a consulta devolve a assinatura válida com a imagem e quem colheu';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA consulta da assinatura'; end if;

  -- ---------------- substituição ----------------
  execute 'set local role authenticated';
  v_json := public.registrar_assinatura_os(v_os, 'Maria Souza', 'RG 12.345.678-9', null, v_img2);
  v_a2 := (v_json->>'id')::uuid;
  v_json := public.assinatura_os(v_os);
  execute 'reset role';
  if exists (select 1 from public.os_assinaturas where id = v_a1 and substituida_em is not null and substituida_por = v_tec_a)
     and (select count(*) from public.os_assinaturas where os_id = v_os and substituida_em is null) = 1
     and v_json->'atual'->>'id' = v_a2::text and v_json->'atual'->>'documento' = 'RG 12.345.678-9'
     and jsonb_array_length(v_json->'substituidas') = 1
     and not (v_json->'substituidas'->0 ? 'imagem_png') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nova assinatura substitui a anterior, que fica no histórico (sem reenviar a imagem antiga)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA substituição: %s', v_json); end if;

  if (select count(*) from public.log_eventos where acao = 'os_assinatura_registrada' and detalhes->>'os_id' = v_os::text) = 2
     and exists (select 1 from public.log_eventos where acao = 'os_assinatura_registrada'
                  and detalhes->>'assinatura_id' = v_a2::text and (detalhes->>'substituiu')::boolean) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   cada assinatura gera evento, marcando quando substituiu outra';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA eventos da assinatura'; end if;

  -- ---------------- validações ----------------
  execute 'set local role authenticated';
  begin
    perform public.registrar_assinatura_os(v_os2, ' A ', null, null, v_img1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou nome de uma letra';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   nome de quem acompanhou é obrigatório';
  end;

  begin
    perform public.registrar_assinatura_os(v_os2, 'João', 'ab', null, v_img1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou documento de 2 caracteres';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   documento, quando informado, tem tamanho mínimo';
  end;

  begin
    perform public.registrar_assinatura_os(v_os2, 'João', null, null, v_jpeg);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou JPEG com prefixo de PNG';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   imagem que não é PNG de verdade é recusada';
  end;

  begin
    perform public.registrar_assinatura_os(v_os2, 'João', null, null, 'data:image/png;base64,@@@não é base64@@@');
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou base64 inválido';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   base64 inválido é recusado';
  end;

  begin
    perform public.registrar_assinatura_os(v_os2, 'João', null, null, replace(v_img1, 'image/png', 'image/svg+xml'));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou outro formato';
  exception when invalid_parameter_value then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   só PNG é aceito';
  end;

  begin
    perform public.registrar_assinatura_os(v_os2, 'João', null, null, v_img1, v_ag);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA aceitou atendimento de outra OS';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   atendimento informado precisa ser da própria OS';
  end;
  execute 'reset role';

  -- ---------------- permissão ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_atend_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_json := public.assinatura_os(v_os);
  begin
    perform public.registrar_assinatura_os(v_os2, 'João', null, null, v_img1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA atendente colheu assinatura';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   colher assinatura exige service_orders.sign';
  end;
  execute 'reset role';
  if not (v_json->>'pode_assinar')::boolean and v_json->'atual'->>'id' = v_a2::text then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   quem vê a OS consulta a assinatura, sem o botão de colher';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA leitura sem permissão de assinar'; end if;

  -- ---------------- escrita direta ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.os_assinaturas (loja_id, os_id, nome_responsavel, imagem_png, hash_sha256)
    values (v_loja_a, v_os2, 'Forjada', v_img1, repeat('0', 64));
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA insert direto na tabela aceito';
  exception when insufficient_privilege then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a tabela não aceita insert direto (só a função grava)';
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  update public.os_assinaturas set nome_responsavel = 'Trocado' where id = v_a2;
  get diagnostics v_n = row_count;
  delete from public.os_assinaturas where id = v_a1;
  get diagnostics v_m = row_count;
  execute 'reset role';
  v_n := v_n + v_m;
  if v_n = 0 and exists (select 1 from public.os_assinaturas where id = v_a2 and nome_responsavel = 'Maria Souza') then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   assinatura não é editada nem apagada, nem pelo dono da empresa';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA alterou/apagou %s assinaturas', v_n); end if;

  -- ---------------- linha do tempo ----------------
  execute 'set local role authenticated';
  v_json := public.timeline_os(v_os);
  execute 'reset role';
  if v_json @> '[{"acao":"os_assinatura_registrada","dados":{"responsavel":"Maria Souza","substituiu":true}}]' then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   a linha do tempo mostra quem assinou e a substituição';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA timeline da assinatura'; end if;

  -- ---------------- outra empresa e anônimo ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.os_assinaturas;
  begin
    perform public.registrar_assinatura_os(v_os, 'Invasor', null, null, v_img1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B assinou OS da empresa A';
  exception when no_data_found then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não assina OS da empresa A';
  end;
  begin
    perform public.assinatura_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA empresa B leu a assinatura da empresa A';
  exception when no_data_found then
    v_n := v_n;
  end;
  execute 'reset role';
  if v_n = 0 then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   empresa B não lê as assinaturas da empresa A (RLS e função)';
  else v_falhas := v_falhas + 1; v_log := v_log || format(E'\n  FALHA empresa B enxerga %s assinaturas', v_n); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    execute 'set local role anon';
    perform public.assinatura_os(v_os);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA anônimo leu a assinatura';
  exception when others then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   anônimo não lê nem registra assinatura';
  end;
  execute 'reset role';

  -- ---------------- OS encerrada ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.alterar_status_os(v_os, v_st_fim);
  begin
    perform public.registrar_assinatura_os(v_os, 'Depois de fechar', null, null, v_img1);
    v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA assinou OS encerrada';
  exception when check_violation then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   OS encerrada não recebe assinatura nova';
  end;
  v_json := public.assinatura_os(v_os);
  execute 'reset role';
  if (v_json->>'encerrada')::boolean and not (v_json->>'pode_assinar')::boolean and v_json->'atual' is not null then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   depois de finalizar a assinatura continua consultável';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA consulta após encerrar'; end if;

  -- ---------------- exclusão da empresa ----------------
  perform set_config('request.jwt.claims', '{}', true);
  delete from public.lojas where id = v_loja_a;
  if not exists (select 1 from public.os_assinaturas where loja_id = v_loja_a) then
    v_ok := v_ok + 1; v_log := v_log || E'\n  ok   excluir a empresa leva junto as assinaturas';
  else v_falhas := v_falhas + 1; v_log := v_log || E'\n  FALHA assinaturas restaram após excluir a empresa'; end if;

  raise exception '%', format(E'RELATÓRIO (transação desfeita)%s\nTOTAL: %s ok, %s falhas', v_log, v_ok, v_falhas);
end $$;
