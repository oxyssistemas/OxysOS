-- =====================================================================
-- Fase 2 · 19 — Equipe e permissões (etapa 13)
-- * usuarios: nenhuma escrita direta pelo cliente (fecha a brecha que
--   permitia a um gerente virar super_admin via UPDATE) — tudo por RPC.
-- * cargos: versão para edição concorrente, limites de nome/descrição e
--   escrita só pelas funções abaixo (cargo Proprietário protegido).
-- * RPCs de equipe: listar, trocar cargo, ativar/desativar, renomear,
--   salvar/excluir cargo e catálogo de permissões.
-- * "Último acesso" vem de auth.users.last_sign_in_at (o cliente não grava).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cargos: versão, limites e escrita só pelas funções
-- ---------------------------------------------------------------------
alter table public.cargos
  add column if not exists versao integer not null default 1;

alter table public.cargos
  add constraint cargos_nome_tamanho check (length(btrim(nome)) between 2 and 60),
  add constraint cargos_descricao_tamanho check (descricao is null or length(descricao) <= 200),
  add constraint cargos_chave_sistema check ((sistema and chave is not null) or (not sistema and chave is null));

drop policy cargos_insert on public.cargos;
drop policy cargos_update on public.cargos;
drop policy cargos_delete on public.cargos;
drop policy cargo_permissoes_insert on public.cargo_permissoes;
drop policy cargo_permissoes_delete on public.cargo_permissoes;

-- ---------------------------------------------------------------------
-- 2. Usuários: leitura pela empresa, escrita só pelo servidor
-- ---------------------------------------------------------------------
drop policy usuarios_insert on public.usuarios;
drop policy usuarios_update on public.usuarios;
drop policy usuarios_delete on public.usuarios;

alter table public.usuarios
  add constraint usuarios_nome_tamanho check (length(btrim(nome)) between 2 and 80);

-- ---------------------------------------------------------------------
-- 3. Apoio
-- ---------------------------------------------------------------------
-- empresa do usuário atual com permissão de equipe
create or replace function public.exigir_equipe()
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('team.manage') then
    raise exception 'Sem permissão para gerenciar a equipe.' using errcode = '42501';
  end if;
  return v_loja;
end;
$$;

-- o próprio usuário tem o cargo Proprietário (maior autoridade do tenant)
create or replace function public.eh_proprietario()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.usuarios u
    join public.cargos c on c.id = u.cargo_id and c.loja_id = u.loja_id
    where u.id = auth.uid() and u.ativo and c.chave = 'owner'
  );
$$;

-- usuário da mesma empresa que pode ser administrado pela equipe
create or replace function public.exigir_usuario_equipe(p_usuario_id uuid, p_permitir_proprio boolean)
returns public.usuarios
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_usuario public.usuarios;
begin
  select * into v_usuario from public.usuarios where id = p_usuario_id and loja_id = v_loja;
  if not found then
    raise exception 'Usuário não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if v_usuario.papel = 'super_admin' then
    raise exception 'Este usuário não é administrado pela empresa.' using errcode = '42501';
  end if;
  if not p_permitir_proprio and v_usuario.id = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio acesso.' using errcode = '23514';
  end if;
  -- o login responsável pela empresa (papel gerente) só é alterado por um Proprietário
  if v_usuario.papel = 'gerente' and not public.eh_proprietario() then
    raise exception 'O responsável pela empresa só pode ser alterado por um Proprietário.' using errcode = '42501';
  end if;
  return v_usuario;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Consultas da equipe
-- ---------------------------------------------------------------------
create or replace function public.listar_equipe()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'nome', u.nome, 'email', u.email, 'papel', u.papel, 'ativo', u.ativo,
             'criado_em', u.criado_em, 'ultimo_acesso', a.last_sign_in_at,
             'eh_voce', u.id = auth.uid(),
             'cargo', case when c.id is null then null else
               jsonb_build_object('id', c.id, 'nome', c.nome, 'chave', c.chave, 'sistema', c.sistema, 'ativo', c.ativo) end)
           order by u.ativo desc, u.nome), '[]'::jsonb)
    from public.usuarios u
    left join public.cargos c on c.id = u.cargo_id and c.loja_id = v_loja
    left join auth.users a on a.id = u.id
    where u.loja_id = v_loja and u.papel <> 'super_admin'
  );
end;
$$;

-- cargos da empresa + catálogo de permissões (disponivel = feature do plano)
create or replace function public.listar_cargos_permissoes()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
begin
  return jsonb_build_object(
    'permissoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'chave', p.chave, 'modulo', p.modulo, 'descricao', p.descricao,
               'feature_key', p.feature_key,
               'disponivel', p.feature_key is null or public.tem_feature(p.feature_key))
             order by p.ordem, p.chave), '[]'::jsonb)
      from public.permissoes p
    ),
    'cargos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'nome', c.nome, 'chave', c.chave, 'descricao', c.descricao,
               'sistema', c.sistema, 'ativo', c.ativo, 'versao', c.versao,
               'permissoes', (
                 select coalesce(jsonb_agg(cp.permissao_chave order by cp.permissao_chave), '[]'::jsonb)
                 from public.cargo_permissoes cp where cp.cargo_id = c.id
               ),
               'usuarios', (select count(*) from public.usuarios u where u.cargo_id = c.id),
               'seu_cargo', exists (select 1 from public.usuarios u where u.id = auth.uid() and u.cargo_id = c.id))
             order by c.sistema desc, c.nome), '[]'::jsonb)
      from public.cargos c
      where c.loja_id = v_loja
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Usuários da equipe
-- ---------------------------------------------------------------------
create or replace function public.definir_cargo_usuario(p_usuario_id uuid, p_cargo_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_usuario public.usuarios := public.exigir_usuario_equipe(p_usuario_id, false);
  v_cargo public.cargos;
begin
  select * into v_cargo from public.cargos where id = p_cargo_id and loja_id = v_loja;
  if not found then
    raise exception 'Cargo não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if not v_cargo.ativo then
    raise exception 'Este cargo está desativado.' using errcode = '23514';
  end if;
  if v_cargo.chave = 'owner' and not public.eh_proprietario() then
    raise exception 'Somente um Proprietário pode dar o cargo Proprietário.' using errcode = '42501';
  end if;

  update public.usuarios set cargo_id = p_cargo_id where id = p_usuario_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'funcionario_cargo_alterado',
          jsonb_build_object('funcionario_id', p_usuario_id, 'nome', v_usuario.nome, 'cargo', v_cargo.nome));
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'usuario_cargo_alterado', 'usuario', p_usuario_id,
          jsonb_build_object('cargo_id', p_cargo_id, 'cargo', v_cargo.nome));
end;
$$;

create or replace function public.definir_usuario_ativo(p_usuario_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_usuario public.usuarios := public.exigir_usuario_equipe(p_usuario_id, false);
begin
  if v_usuario.ativo = p_ativo then
    return;
  end if;
  update public.usuarios set ativo = p_ativo where id = p_usuario_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), case when p_ativo then 'funcionario_reativado' else 'funcionario_desativado' end,
          jsonb_build_object('funcionario_id', p_usuario_id, 'nome', v_usuario.nome));
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_ativo then 'usuario_reativado' else 'usuario_desativado' end,
          'usuario', p_usuario_id, jsonb_build_object('nome', v_usuario.nome));
end;
$$;

create or replace function public.renomear_usuario_equipe(p_usuario_id uuid, p_nome text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_usuario public.usuarios := public.exigir_usuario_equipe(p_usuario_id, true);
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
begin
  if length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'O nome deve ter de 2 a 80 caracteres.' using errcode = '23514';
  end if;
  if v_nome = v_usuario.nome then
    return;
  end if;
  update public.usuarios set nome = v_nome where id = p_usuario_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'funcionario_atualizado',
          jsonb_build_object('funcionario_id', p_usuario_id, 'nome', v_nome));
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'usuario_renomeado', 'usuario', p_usuario_id,
          jsonb_build_object('de', v_usuario.nome, 'para', v_nome));
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Cargos personalizados
-- ---------------------------------------------------------------------
create or replace function public.salvar_cargo(p_id uuid, p_versao integer, p_dados jsonb, p_permissoes text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_id uuid;
  v_cargo public.cargos;
  v_nome text := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_permissoes text[];
  v_invalida text;
begin
  select coalesce(array_agg(distinct chave), '{}') into v_permissoes from unnest(coalesce(p_permissoes, '{}')) as p(chave);

  select p.chave into v_invalida
  from unnest(v_permissoes) as p(chave)
  where not exists (select 1 from public.permissoes x where x.chave = p.chave)
  limit 1;
  if v_invalida is not null then
    raise exception 'Permissão desconhecida.' using errcode = '23514';
  end if;
  if cardinality(v_permissoes) = 0 then
    raise exception 'Escolha ao menos uma permissão para o cargo.' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.cargos (loja_id, nome, descricao, sistema, ativo)
    values (v_loja, v_nome, nullif(btrim(coalesce(p_dados->>'descricao', '')), ''), false,
            coalesce((p_dados->>'ativo')::boolean, true))
    returning id into v_id;
  else
    select * into v_cargo from public.cargos where id = p_id and loja_id = v_loja;
    if not found then
      raise exception 'Cargo não encontrado nesta empresa.' using errcode = 'P0002';
    end if;
    if v_cargo.chave = 'owner' then
      raise exception 'O cargo Proprietário tem acesso total e não pode ser alterado.' using errcode = '42501';
    end if;
    update public.cargos
       set nome = v_nome,
           descricao = nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
           versao = versao + 1,
           atualizado_em = now()
     where id = p_id and loja_id = v_loja and versao = p_versao
    returning id into v_id;
    if v_id is null then
      raise exception 'Este cargo foi alterado por outra pessoa. Recarregue antes de salvar.' using errcode = '40001';
    end if;
    delete from public.cargo_permissoes where cargo_id = v_id;
  end if;

  insert into public.cargo_permissoes (cargo_id, permissao_chave)
  select v_id, chave from unnest(v_permissoes) as p(chave);

  -- ninguém tira a própria permissão de equipe (evita ficar sem acesso)
  if exists (select 1 from public.usuarios u where u.id = auth.uid() and u.cargo_id = v_id)
     and not ('team.manage' = any (v_permissoes)) then
    raise exception 'Você não pode remover do seu próprio cargo a permissão de gerenciar a equipe.' using errcode = '23514';
  end if;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_id is null then 'cargo_criado' else 'cargo_alterado' end,
          'cargo', v_id, jsonb_build_object('nome', v_nome, 'permissoes', cardinality(v_permissoes)));
  return v_id;
end;
$$;

create or replace function public.definir_cargo_ativo(p_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_cargo public.cargos;
begin
  select * into v_cargo from public.cargos where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Cargo não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if v_cargo.chave = 'owner' then
    raise exception 'O cargo Proprietário não pode ser desativado.' using errcode = '42501';
  end if;
  if not p_ativo and exists (select 1 from public.usuarios u where u.cargo_id = p_id and u.ativo) then
    raise exception 'Há usuários ativos com este cargo. Troque o cargo deles antes de desativar.' using errcode = '23514';
  end if;

  update public.cargos set ativo = p_ativo, versao = versao + 1, atualizado_em = now() where id = p_id;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_ativo then 'cargo_reativado' else 'cargo_desativado' end,
          'cargo', p_id, jsonb_build_object('nome', v_cargo.nome));
end;
$$;

create or replace function public.excluir_cargo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_equipe();
  v_cargo public.cargos;
begin
  select * into v_cargo from public.cargos where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Cargo não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if v_cargo.sistema then
    raise exception 'Cargos padrão não podem ser excluídos. Desative-o em vez de excluir.' using errcode = '42501';
  end if;
  if exists (select 1 from public.usuarios u where u.cargo_id = p_id) then
    raise exception 'Há usuários com este cargo. Troque o cargo deles antes de excluir.' using errcode = '23503';
  end if;

  delete from public.cargos where id = p_id;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'cargo_excluido', 'cargo', p_id, jsonb_build_object('nome', v_cargo.nome));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Legado: código de autorização nunca foi usado (0 registros)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.usuarios_seguranca) then
    raise exception 'usuarios_seguranca possui registros: revise antes de remover a tabela.';
  end if;
end $$;
drop table public.usuarios_seguranca;

-- ---------------------------------------------------------------------
-- 8. Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.exigir_equipe() from public, anon, authenticated;
revoke execute on function public.exigir_usuario_equipe(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.eh_proprietario() from public, anon;
revoke execute on function public.listar_equipe() from public, anon;
revoke execute on function public.listar_cargos_permissoes() from public, anon;
revoke execute on function public.definir_cargo_usuario(uuid, uuid) from public, anon;
revoke execute on function public.definir_usuario_ativo(uuid, boolean) from public, anon;
revoke execute on function public.renomear_usuario_equipe(uuid, text) from public, anon;
revoke execute on function public.salvar_cargo(uuid, integer, jsonb, text[]) from public, anon;
revoke execute on function public.definir_cargo_ativo(uuid, boolean) from public, anon;
revoke execute on function public.excluir_cargo(uuid) from public, anon;

grant execute on function public.eh_proprietario() to authenticated;
grant execute on function public.listar_equipe() to authenticated;
grant execute on function public.listar_cargos_permissoes() to authenticated;
grant execute on function public.definir_cargo_usuario(uuid, uuid) to authenticated;
grant execute on function public.definir_usuario_ativo(uuid, boolean) to authenticated;
grant execute on function public.renomear_usuario_equipe(uuid, text) to authenticated;
grant execute on function public.salvar_cargo(uuid, integer, jsonb, text[]) to authenticated;
grant execute on function public.definir_cargo_ativo(uuid, boolean) to authenticated;
grant execute on function public.excluir_cargo(uuid) to authenticated;
