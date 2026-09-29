-- =====================================================================
-- Fase 3 · 20 — Catálogo de materiais e serviços (etapa 13)
-- O que a empresa costuma usar/cobrar, para o técnico escolher em campo
-- em vez de digitar tudo (§35 "utilizar catálogo existente"). É só um
-- catálogo: não tem saldo, nem entrada, nem baixa — estoque é outra fase
-- (§65). A ligação com a OS fica em `os_itens.catalogo_item_id`, que é o
-- ponto de encaixe para o estoque no futuro (§34).
-- =====================================================================

create table public.catalogo_itens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  tipo public.tipo_item_os not null,
  codigo text,
  nome text not null,
  unidade text not null default 'un',
  valor_padrao numeric(12,2) not null default 0,
  observacao text,
  ativo boolean not null default true,
  versao int not null default 1,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint catalogo_itens_loja_id_id_key unique (loja_id, id),
  constraint catalogo_itens_nome_tamanho check (length(btrim(nome)) between 1 and 120),
  constraint catalogo_itens_codigo_tamanho check (codigo is null or length(btrim(codigo)) between 1 and 40),
  constraint catalogo_itens_unidade_tamanho check (length(btrim(unidade)) between 1 and 10),
  constraint catalogo_itens_observacao_tamanho check (observacao is null or length(observacao) <= 300),
  constraint catalogo_itens_valor_valido check (valor_padrao >= 0 and valor_padrao <= 9999999)
);

-- o mesmo nome não se repete no mesmo tipo (acento e caixa não contam)
create unique index catalogo_itens_nome_unico
  on public.catalogo_itens(loja_id, tipo, public.normalizar_busca(nome));
create unique index catalogo_itens_codigo_unico
  on public.catalogo_itens(loja_id, upper(btrim(codigo))) where codigo is not null;
create index idx_catalogo_itens_loja_ativos on public.catalogo_itens(loja_id, tipo, nome) where ativo;

alter table public.catalogo_itens enable row level security;

-- quem vê OS consulta o catálogo; a escrita passa pelas funções abaixo
create policy catalogo_itens_select on public.catalogo_itens for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('service_orders'))
    and (select public.tem_permissao('service_orders.view'))
  );

-- ---------------------------------------------------------------------
-- Escrita (Configurações)
-- ---------------------------------------------------------------------
create or replace function public.salvar_item_catalogo(
  p_id uuid,
  p_versao integer,
  p_dados jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_id uuid;
  v_nome text := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_tipo public.tipo_item_os;
  v_unidade text := lower(nullif(btrim(coalesce(p_dados->>'unidade', '')), ''));
  v_codigo text := nullif(btrim(coalesce(p_dados->>'codigo', '')), '');
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  begin
    v_tipo := (p_dados->>'tipo')::public.tipo_item_os;
  exception when invalid_text_representation then
    raise exception 'Tipo de item inválido.' using errcode = '22023';
  end;

  if p_id is null then
    insert into public.catalogo_itens (loja_id, tipo, codigo, nome, unidade, valor_padrao, observacao, ativo, criado_por)
    values (v_loja, v_tipo, v_codigo, v_nome, coalesce(v_unidade, 'un'),
            coalesce(nullif(btrim(coalesce(p_dados->>'valor_padrao', '')), '')::numeric, 0),
            nullif(btrim(coalesce(p_dados->>'observacao', '')), ''),
            coalesce((p_dados->>'ativo')::boolean, true), v_uid)
    returning id into v_id;
  else
    update public.catalogo_itens
       set tipo = v_tipo,
           codigo = v_codigo,
           nome = v_nome,
           unidade = coalesce(v_unidade, unidade),
           valor_padrao = coalesce(nullif(btrim(coalesce(p_dados->>'valor_padrao', '')), '')::numeric, valor_padrao),
           observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''),
           ativo = coalesce((p_dados->>'ativo')::boolean, ativo),
           versao = versao + 1,
           atualizado_em = now()
     where id = p_id and loja_id = v_loja and versao = p_versao
    returning id into v_id;
    if v_id is null then
      if exists (select 1 from public.catalogo_itens where id = p_id and loja_id = v_loja) then
        raise exception 'Este item foi alterado por outra pessoa. Recarregue antes de salvar.' using errcode = '40001';
      end if;
      raise exception 'Item do catálogo não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (v_uid, v_loja, case when p_id is null then 'catalogo_item_criado' else 'catalogo_item_alterado' end,
          'catalogo_item', v_id, jsonb_build_object('nome', v_nome, 'tipo', v_tipo));
  return v_id;
end;
$$;

create or replace function public.definir_item_catalogo_ativo(p_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  update public.catalogo_itens set ativo = p_ativo, versao = versao + 1, atualizado_em = now()
   where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Item do catálogo não encontrado.' using errcode = 'P0002';
  end if;
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_ativo then 'catalogo_item_reativado' else 'catalogo_item_desativado' end,
          'catalogo_item', p_id, '{}'::jsonb);
end;
$$;

/* Item já usado em OS não some: vira inativo, para o histórico continuar
   fazendo sentido (mesma regra de status, prioridade e tipo de serviço). */
create or replace function public.excluir_item_catalogo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.catalogo_itens where id = p_id and loja_id = v_loja) then
    raise exception 'Item do catálogo não encontrado.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.os_itens where catalogo_item_id = p_id) then
    raise exception 'Este item já foi usado em OS: desative em vez de excluir.' using errcode = '23503';
  end if;
  delete from public.catalogo_itens where id = p_id and loja_id = v_loja;
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'catalogo_item_excluido', 'catalogo_item', p_id, '{}'::jsonb);
end;
$$;

create or replace function public.listar_catalogo_itens()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('service_orders')
     or not (public.tem_permissao('service_orders.view') or public.tem_permissao('settings.manage')) then
    raise exception 'Sem acesso ao catálogo.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'tipo', c.tipo, 'codigo', c.codigo, 'nome', c.nome, 'unidade', c.unidade,
             'valor_padrao', c.valor_padrao, 'observacao', c.observacao, 'ativo', c.ativo, 'versao', c.versao,
             'total_uso', (select count(*) from public.os_itens i where i.catalogo_item_id = c.id))
           order by c.ativo desc, c.tipo, c.nome), '[]'::jsonb)
    from public.catalogo_itens c
    where c.loja_id = v_loja
  );
end;
$$;

revoke execute on function public.salvar_item_catalogo(uuid, integer, jsonb) from public, anon;
revoke execute on function public.definir_item_catalogo_ativo(uuid, boolean) from public, anon;
revoke execute on function public.excluir_item_catalogo(uuid) from public, anon;
revoke execute on function public.listar_catalogo_itens() from public, anon;
grant execute on function public.salvar_item_catalogo(uuid, integer, jsonb) to authenticated;
grant execute on function public.definir_item_catalogo_ativo(uuid, boolean) to authenticated;
grant execute on function public.excluir_item_catalogo(uuid) to authenticated;
grant execute on function public.listar_catalogo_itens() to authenticated;
