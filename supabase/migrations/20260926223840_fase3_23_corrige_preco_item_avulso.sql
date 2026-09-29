-- =====================================================================
-- Fase 3 · 23 — Correção do preço no item avulso (etapa 13)
-- Em `trg_os_itens_regras` o preço lia `v_catalogo.valor_padrao` mesmo
-- quando o item não vinha do catálogo, e o registro nunca tinha sido
-- atribuído (55000). Agora o valor do catálogo vai para uma variável
-- própria, que fica nula no item avulso.
-- =====================================================================

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
  v_valor_catalogo numeric;
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
    v_valor_catalogo := v_catalogo.valor_padrao;
  end if;

  -- sem service_orders.edit ninguém define preço: vem do catálogo ou fica zero
  if auth.uid() is not null and not coalesce(v_edita, false) then
    new.valor_unitario := coalesce(v_valor_catalogo, 0);
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
