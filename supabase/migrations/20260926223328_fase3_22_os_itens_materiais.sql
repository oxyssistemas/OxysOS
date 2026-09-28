-- =====================================================================
-- Fase 3 · 22 — Materiais e serviços na OS (etapa 13)
-- * O item da OS ganha unidade, observação e a ligação com o catálogo
--   (`catalogo_item_id`), que é o encaixe para o estoque no futuro (§34).
-- * `service_orders.add_material` passa a valer: o técnico registra o que
--   usou e mexe no que ele mesmo lançou, sem editar a OS inteira.
-- * Quem não edita a OS não define preço: o valor vem do catálogo.
-- =====================================================================

alter table public.os_itens
  add column unidade text not null default 'un',
  add column observacao text,
  add column catalogo_item_id uuid references public.catalogo_itens(id) on delete set null,
  add constraint os_itens_unidade_tamanho check (length(btrim(unidade)) between 1 and 10),
  add constraint os_itens_observacao_tamanho check (observacao is null or length(observacao) <= 300);

comment on column public.os_itens.catalogo_item_id is
  'Item do catálogo que originou a linha. Ponto de encaixe da futura baixa de estoque (§34).';

create index idx_os_itens_catalogo on public.os_itens(catalogo_item_id) where catalogo_item_id is not null;

-- ---------------------------------------------------------------------
-- Regras do item: permissão de campo, catálogo da própria empresa e preço
-- ---------------------------------------------------------------------
create or replace function public.trg_os_itens_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_os_id uuid;
  v_loja uuid;
  v_categoria public.categoria_status;
  v_edita boolean;
  v_lanca boolean;
  v_catalogo record;
begin
  v_os_id := case when tg_op = 'DELETE' then old.os_id else new.os_id end;

  if tg_op = 'UPDATE' and new.os_id <> old.os_id then
    raise exception 'O item não pode mudar de OS.' using errcode = '42501';
  end if;

  select os.loja_id, s.categoria into v_loja, v_categoria
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id
  where os.id = v_os_id;

  -- OS já removida (exclusão da empresa): nada a validar
  if found and auth.uid() is not null then
    v_edita := public.tem_permissao('service_orders.edit');
    v_lanca := public.tem_permissao('service_orders.add_material');
    if not (v_edita or v_lanca) then
      raise exception 'Sem permissão para alterar os itens da OS.' using errcode = '42501';
    end if;
    -- quem só lança material mexe no que ele mesmo registrou
    if not v_edita and tg_op in ('UPDATE', 'DELETE') and old.criado_por is distinct from auth.uid() then
      raise exception 'Você só pode alterar os itens que registrou.' using errcode = '42501';
    end if;
    if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
      raise exception 'OS encerrada: reabra a OS para alterar os itens.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.descricao := btrim(regexp_replace(coalesce(new.descricao, ''), '\s+', ' ', 'g'));
  new.observacao := nullif(btrim(coalesce(new.observacao, '')), '');
  new.unidade := lower(coalesce(nullif(btrim(coalesce(new.unidade, '')), ''), 'un'));

  -- item do catálogo: só o da própria empresa, e ele manda no nome/unidade
  if new.catalogo_item_id is not null then
    select * into v_catalogo from public.catalogo_itens c
     where c.id = new.catalogo_item_id and c.loja_id = v_loja;
    if not found then
      raise exception 'Item do catálogo não encontrado.' using errcode = 'P0002';
    end if;
    if tg_op = 'INSERT' and not v_catalogo.ativo then
      raise exception 'Este item do catálogo está desativado.' using errcode = '23514';
    end if;
    new.tipo := v_catalogo.tipo;
    new.descricao := v_catalogo.nome;
    new.unidade := v_catalogo.unidade;
  end if;

  -- sem service_orders.edit ninguém define preço: vem do catálogo ou fica zero
  if auth.uid() is not null and not coalesce(v_edita, false) then
    new.valor_unitario := coalesce(v_catalogo.valor_padrao, 0);
  end if;

  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_em := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- o evento da linha do tempo passa a levar unidade e observação
create or replace function public.trg_os_itens_totais()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item public.os_itens%rowtype;
  v_loja uuid;
  v_cliente uuid;
  v_acao text;
begin
  if tg_op = 'DELETE' then
    v_item := old;
  else
    v_item := new;
  end if;

  select loja_id, cliente_id into v_loja, v_cliente from public.ordens_servico where id = v_item.os_id;
  if not found then
    return null;
  end if;

  -- a regra da OS recalcula o total
  update public.ordens_servico set valor_total = valor_total where id = v_item.os_id;

  if tg_op = 'UPDATE' and (new.descricao, new.tipo, new.quantidade, new.valor_unitario, new.unidade, new.observacao)
                          is not distinct from
                          (old.descricao, old.tipo, old.quantidade, old.valor_unitario, old.unidade, old.observacao) then
    return null;
  end if;

  v_acao := case tg_op when 'INSERT' then 'os_item_adicionado' when 'UPDATE' then 'os_item_alterado' else 'os_item_removido' end;
  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), v_acao,
          jsonb_build_object('os_id', v_item.os_id, 'cliente_id', v_cliente, 'item', v_item.descricao,
                             'quantidade', v_item.quantidade, 'unidade', v_item.unidade,
                             'observacao', v_item.observacao,
                             'subtotal', round(v_item.quantidade * v_item.valor_unitario, 2)));
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: add_material entra ao lado de service_orders.edit
-- ---------------------------------------------------------------------
drop policy if exists os_itens_insert on public.os_itens;
create policy os_itens_insert on public.os_itens for insert to authenticated
  with check (
    exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id)
    and ((select public.tem_permissao('service_orders.edit'))
         or (select public.tem_permissao('service_orders.add_material')))
  );

drop policy if exists os_itens_update on public.os_itens;
create policy os_itens_update on public.os_itens for update to authenticated
  using (
    exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id)
    and ((select public.tem_permissao('service_orders.edit'))
         or ((select public.tem_permissao('service_orders.add_material')) and criado_por = (select auth.uid())))
  )
  with check (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id));

drop policy if exists os_itens_delete on public.os_itens;
create policy os_itens_delete on public.os_itens for delete to authenticated
  using (
    exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id)
    and ((select public.tem_permissao('service_orders.edit'))
         or ((select public.tem_permissao('service_orders.add_material')) and criado_por = (select auth.uid())))
  );

-- ---------------------------------------------------------------------
-- Itens da OS para o portal do técnico (sem preço, que é da empresa)
-- ---------------------------------------------------------------------
create or replace function public.itens_os(p_os_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_valores boolean;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ordens_servico where id = p_os_id and loja_id = v_loja) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  -- o técnico registra o que usou; o valor é assunto de quem edita a OS
  v_valores := public.tem_permissao('service_orders.edit');

  return jsonb_build_object(
    'pode_lancar', public.tem_permissao('service_orders.edit') or public.tem_permissao('service_orders.add_material'),
    'mostra_valores', v_valores,
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', i.id, 'tipo', i.tipo, 'descricao', i.descricao, 'unidade', i.unidade,
               'quantidade', i.quantidade, 'observacao', i.observacao,
               'catalogo_item_id', i.catalogo_item_id,
               'valor_unitario', case when v_valores then i.valor_unitario end,
               'subtotal', case when v_valores then i.subtotal end,
               'criado_em', i.criado_em, 'criado_por', u.nome, 'meu', i.criado_por = v_uid)
             order by i.criado_em, i.id), '[]'::jsonb)
      from public.os_itens i
      left join public.usuarios u on u.id = i.criado_por and u.loja_id = v_loja
      where i.os_id = p_os_id
    ));
end;
$$;

revoke execute on function public.itens_os(uuid) from public, anon;
grant execute on function public.itens_os(uuid) to authenticated;
