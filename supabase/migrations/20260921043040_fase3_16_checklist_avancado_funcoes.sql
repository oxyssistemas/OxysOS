-- =====================================================================
-- Fase 3 · 16 — Checklist avançado: regras e funções (etapa 11)
-- * Itens de hora, medição (com unidade e faixa esperada) e assinatura.
-- * Item condicional: aparece só quando o item anterior (caixa de seleção
--   ou lista) responder o valor combinado. Item escondido não é exigido
--   na finalização e perde a resposta se a condição deixar de valer.
-- * Responder o checklist passa a aceitar `checklists.fill` além de
--   `service_orders.edit` (é o que o técnico usa em campo).
-- * Tipos novos e condição exigem a feature `advanced_checklists`.
-- =====================================================================

-- unidade e faixa só fazem sentido em medição
alter table public.checklist_modelo_itens
  add constraint checklist_modelo_itens_medicao
    check (tipo = 'medicao' or (unidade is null and valor_min is null and valor_max is null));
alter table public.os_checklist_itens
  add constraint os_checklist_itens_medicao
    check (tipo = 'medicao' or (unidade is null and valor_min is null and valor_max is null));

-- ---------------------------------------------------------------------
-- Estado de um item
-- ---------------------------------------------------------------------
create or replace function public.item_checklist_respondido(p_item public.os_checklist_itens)
returns boolean
language sql immutable set search_path = '' as $$
  select case p_item.tipo
    when 'checkbox' then coalesce(p_item.valor_booleano, false)
    when 'texto' then p_item.valor_texto is not null
    when 'numero' then p_item.valor_numero is not null
    when 'medicao' then p_item.valor_numero is not null
    when 'data' then p_item.valor_data is not null
    when 'hora' then p_item.valor_hora is not null
    when 'selecao' then p_item.valor_opcao is not null
    when 'foto' then p_item.anexo_id is not null
    when 'assinatura' then p_item.anexo_id is not null
  end;
$$;

/* Item condicional aparece só quando o item de que depende responder o
   valor combinado. Como a condição olha a resposta do irmão, um item que
   depende de outro escondido também fica escondido (o pai fica sem
   resposta), o que já dá o encadeamento sem engine nenhuma (§28). */
create or replace function public.item_checklist_visivel(p_item public.os_checklist_itens)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_item.depende_de_ordem is null or exists (
    select 1
    from public.os_checklist_itens pai
    where pai.checklist_id = p_item.checklist_id
      and pai.ordem = p_item.depende_de_ordem
      and case pai.tipo
            when 'checkbox' then coalesce(pai.valor_booleano, false)::text = p_item.condicao_valor
            when 'selecao' then pai.valor_opcao = p_item.condicao_valor
            else false
          end
  );
$$;

-- o que ainda falta responder: obrigatório, visível e sem resposta
create or replace function public.item_checklist_pendente(p_item public.os_checklist_itens)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_item.obrigatorio
     and public.item_checklist_visivel(p_item)
     and not public.item_checklist_respondido(p_item);
$$;

-- medição fora da faixa esperada (informativo: a leitura real é gravada)
create or replace function public.item_checklist_fora_faixa(p_item public.os_checklist_itens)
returns boolean
language sql immutable set search_path = '' as $$
  select p_item.tipo = 'medicao' and p_item.valor_numero is not null
     and ((p_item.valor_min is not null and p_item.valor_numero < p_item.valor_min)
       or (p_item.valor_max is not null and p_item.valor_numero > p_item.valor_max));
$$;

-- ---------------------------------------------------------------------
-- Modelos
-- ---------------------------------------------------------------------
create or replace function public.salvar_checklist_modelo(
  p_id uuid,
  p_versao integer,
  p_dados jsonb,
  p_itens jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_avancado boolean;
  v_id uuid;
  v_item jsonb;
  v_ordem int := 0;
  v_tipo public.tipo_item_checklist;
  v_opcoes text[];
  v_depende int;
  v_condicao text;
  v_rotulo_erro text;
  v_nome text := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Inclua ao menos um item no checklist.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_itens) > 100 then
    raise exception 'O checklist pode ter no máximo 100 itens.' using errcode = '23514';
  end if;
  v_avancado := public.tem_feature('advanced_checklists');

  if p_id is null then
    insert into public.checklist_modelos (loja_id, nome, descricao, tipo_servico_id, ativo, criado_por)
    values (
      v_loja, v_nome, nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
      nullif(p_dados->>'tipo_servico_id', '')::uuid, coalesce((p_dados->>'ativo')::boolean, true), v_uid
    )
    returning id into v_id;
  else
    update public.checklist_modelos
       set nome = v_nome,
           descricao = nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
           tipo_servico_id = nullif(p_dados->>'tipo_servico_id', '')::uuid,
           ativo = coalesce((p_dados->>'ativo')::boolean, ativo),
           versao = versao + 1,
           atualizado_em = now()
     where id = p_id and loja_id = v_loja and versao = p_versao
    returning id into v_id;
    if v_id is null then
      if exists (select 1 from public.checklist_modelos where id = p_id and loja_id = v_loja) then
        raise exception 'Este modelo foi alterado por outra pessoa. Recarregue antes de salvar.' using errcode = '40001';
      end if;
      raise exception 'Modelo de checklist não encontrado.' using errcode = 'P0002';
    end if;
    delete from public.checklist_modelo_itens where modelo_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    begin
      v_tipo := (v_item->>'tipo')::public.tipo_item_checklist;
    exception when invalid_text_representation then
      raise exception 'Tipo de item inválido.' using errcode = '23514';
    end;

    if not v_avancado and v_tipo in ('hora', 'medicao', 'assinatura') then
      raise exception 'Itens de hora, medição e assinatura fazem parte dos checklists avançados do plano.'
        using errcode = '42501';
    end if;

    -- opções sem repetição, na ordem informada
    select coalesce(array_agg(u.opcao order by u.posicao), '{}')
      into v_opcoes
      from (
        select btrim(o.valor) as opcao, min(o.posicao) as posicao
        from jsonb_array_elements_text(coalesce(v_item->'opcoes', '[]'::jsonb)) with ordinality as o(valor, posicao)
        where btrim(o.valor) <> ''
        group by btrim(o.valor)
      ) u;
    if v_tipo = 'selecao' and cardinality(v_opcoes) < 2 then
      raise exception 'O item "%" precisa de ao menos duas opções.', left(v_item->>'rotulo', 60) using errcode = '23514';
    end if;

    v_depende := nullif(btrim(coalesce(v_item->>'depende_de_ordem', '')), '')::int;
    v_condicao := nullif(btrim(coalesce(v_item->>'condicao_valor', '')), '');
    if v_depende is null or v_condicao is null then
      v_depende := null;
      v_condicao := null;
    elsif not v_avancado then
      raise exception 'Itens condicionais fazem parte dos checklists avançados do plano.' using errcode = '42501';
    elsif v_depende >= v_ordem then
      raise exception 'O item "%" só pode depender de um item acima dele.', left(v_item->>'rotulo', 60)
        using errcode = '23514';
    end if;

    insert into public.checklist_modelo_itens (
      loja_id, modelo_id, ordem, rotulo, tipo, obrigatorio, opcoes, ajuda,
      unidade, valor_min, valor_max, depende_de_ordem, condicao_valor)
    values (
      v_loja, v_id, v_ordem,
      btrim(regexp_replace(coalesce(v_item->>'rotulo', ''), '\s+', ' ', 'g')),
      v_tipo,
      coalesce((v_item->>'obrigatorio')::boolean, false),
      case when v_tipo = 'selecao' then v_opcoes else '{}' end,
      nullif(btrim(coalesce(v_item->>'ajuda', '')), ''),
      case when v_tipo = 'medicao' then nullif(btrim(coalesce(v_item->>'unidade', '')), '') end,
      case when v_tipo = 'medicao' then nullif(btrim(coalesce(v_item->>'valor_min', '')), '')::numeric end,
      case when v_tipo = 'medicao' then nullif(btrim(coalesce(v_item->>'valor_max', '')), '')::numeric end,
      v_depende, v_condicao
    );
  end loop;

  -- a condição precisa apontar para uma caixa de seleção ou lista com valor possível
  select i.rotulo into v_rotulo_erro
  from public.checklist_modelo_itens i
  left join public.checklist_modelo_itens pai on pai.modelo_id = i.modelo_id and pai.ordem = i.depende_de_ordem
  where i.modelo_id = v_id and i.depende_de_ordem is not null
    and (
      pai.id is null
      or pai.tipo not in ('checkbox', 'selecao')
      or (pai.tipo = 'checkbox' and i.condicao_valor not in ('true', 'false'))
      or (pai.tipo = 'selecao' and not (i.condicao_valor = any (pai.opcoes)))
    )
  limit 1;
  if v_rotulo_erro is not null then
    raise exception 'A condição do item "%" precisa apontar para uma caixa de seleção ou lista anterior, com um valor possível.',
      left(v_rotulo_erro, 60) using errcode = '23514';
  end if;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (v_uid, v_loja, case when p_id is null then 'checklist_modelo_criado' else 'checklist_modelo_alterado' end,
          'checklist_modelo', v_id, jsonb_build_object('nome', v_nome, 'itens', v_ordem));
  return v_id;
end;
$$;

create or replace function public.listar_checklist_modelos()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not (public.tem_permissao('settings.manage') or public.tem_permissao('service_orders.view')) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', m.nome, 'descricao', m.descricao, 'ativo', m.ativo, 'versao', m.versao,
             'tipo_servico', case when t.id is null then null else jsonb_build_object('id', t.id, 'nome', t.nome) end,
             'total_uso', (select count(*) from public.os_checklists c where c.modelo_id = m.id),
             'itens', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id, 'ordem', i.ordem, 'rotulo', i.rotulo, 'tipo', i.tipo,
                        'obrigatorio', i.obrigatorio, 'opcoes', to_jsonb(i.opcoes), 'ajuda', i.ajuda,
                        'unidade', i.unidade, 'valor_min', i.valor_min, 'valor_max', i.valor_max,
                        'depende_de_ordem', i.depende_de_ordem, 'condicao_valor', i.condicao_valor)
                      order by i.ordem), '[]'::jsonb)
               from public.checklist_modelo_itens i where i.modelo_id = m.id
             ))
           order by m.ativo desc, m.nome), '[]'::jsonb)
    from public.checklist_modelos m
    left join public.tipos_servico t on t.id = m.tipo_servico_id and t.loja_id = v_loja
    where m.loja_id = v_loja
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Aplicar e responder
-- ---------------------------------------------------------------------
create or replace function public.aplicar_checklist_os(p_os_id uuid, p_modelo_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_os_editavel(p_os_id);
  v_modelo record;
  v_id uuid;
begin
  select id, nome, ativo into v_modelo from public.checklist_modelos where id = p_modelo_id and loja_id = v_loja;
  if not found then
    raise exception 'Modelo de checklist não encontrado.' using errcode = 'P0002';
  end if;
  if not v_modelo.ativo then
    raise exception 'Este modelo de checklist está desativado.' using errcode = '23514';
  end if;
  if exists (select 1 from public.os_checklists where os_id = p_os_id and modelo_id = p_modelo_id) then
    raise exception 'Este checklist já foi aplicado nesta OS.' using errcode = '23505';
  end if;

  insert into public.os_checklists (loja_id, os_id, modelo_id, nome, aplicado_por)
  values (v_loja, p_os_id, p_modelo_id, v_modelo.nome, auth.uid())
  returning id into v_id;

  insert into public.os_checklist_itens (
    loja_id, checklist_id, ordem, rotulo, tipo, obrigatorio, opcoes, ajuda,
    unidade, valor_min, valor_max, depende_de_ordem, condicao_valor)
  select v_loja, v_id, i.ordem, i.rotulo, i.tipo, i.obrigatorio, i.opcoes, i.ajuda,
         i.unidade, i.valor_min, i.valor_max, i.depende_de_ordem, i.condicao_valor
  from public.checklist_modelo_itens i where i.modelo_id = p_modelo_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  select v_loja, auth.uid(), 'os_checklist_aplicado',
         jsonb_build_object('os_id', p_os_id, 'cliente_id', os.cliente_id, 'checklist_id', v_id, 'checklist', v_modelo.nome)
  from public.ordens_servico os where os.id = p_os_id;
  return v_id;
end;
$$;

/* Quem responde o checklist: além de quem edita a OS, quem tem
   `checklists.fill` (o cargo de técnico em campo). A OS precisa estar
   aberta, como no resto do módulo. */
create or replace function public.exigir_checklist_respondivel(p_os_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_categoria public.categoria_status;
begin
  if v_loja is null or not public.tem_feature('service_orders')
     or not (public.tem_permissao('checklists.fill') or public.tem_permissao('service_orders.edit')) then
    raise exception 'Sem permissão para responder o checklist.' using errcode = '42501';
  end if;
  select s.categoria into v_categoria
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id
  where os.id = p_os_id and os.loja_id = v_loja;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
    raise exception 'OS encerrada: reabra a OS para alterar o checklist.' using errcode = '23514';
  end if;
  return v_loja;
end;
$$;

create or replace function public.responder_item_checklist(p_item_id uuid, p_resposta jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item public.os_checklist_itens;
  v_os_id uuid;
  v_nome text;
  v_valor jsonb := coalesce(p_resposta->'valor', 'null'::jsonb);
  v_completo_antes boolean;
  v_completo_depois boolean;
  v_texto text;
  v_anexo uuid;
begin
  select i.* into v_item
  from public.os_checklist_itens i
  where i.id = p_item_id and i.loja_id = public.loja_operacional_id()
  for update;
  if not found then
    raise exception 'Item de checklist não encontrado.' using errcode = 'P0002';
  end if;
  select c.os_id, c.nome into v_os_id, v_nome from public.os_checklists c where c.id = v_item.checklist_id;
  perform public.exigir_checklist_respondivel(v_os_id);

  if not public.item_checklist_visivel(v_item) then
    raise exception 'Este item só aparece conforme a resposta do item anterior.' using errcode = '23514';
  end if;

  select bool_and(public.item_checklist_respondido(i) or not public.item_checklist_visivel(i)) into v_completo_antes
  from public.os_checklist_itens i where i.checklist_id = v_item.checklist_id;

  v_item.valor_booleano := null; v_item.valor_texto := null; v_item.valor_numero := null;
  v_item.valor_data := null; v_item.valor_hora := null; v_item.valor_opcao := null; v_item.anexo_id := null;

  if jsonb_typeof(v_valor) <> 'null' then
    case v_item.tipo
      when 'checkbox' then
        if jsonb_typeof(v_valor) <> 'boolean' then
          raise exception 'Resposta inválida para caixa de seleção.' using errcode = '22023';
        end if;
        v_item.valor_booleano := (v_valor #>> '{}')::boolean;
      when 'texto' then
        if jsonb_typeof(v_valor) <> 'string' then
          raise exception 'Resposta inválida para texto.' using errcode = '22023';
        end if;
        v_texto := nullif(btrim(v_valor #>> '{}'), '');
        if length(v_texto) > 2000 then
          raise exception 'O texto deve ter até 2.000 caracteres.' using errcode = '23514';
        end if;
        v_item.valor_texto := v_texto;
      when 'numero' then
        if jsonb_typeof(v_valor) <> 'number' then
          raise exception 'Informe um número válido.' using errcode = '22023';
        end if;
        v_item.valor_numero := (v_valor #>> '{}')::numeric;
      when 'medicao' then
        if jsonb_typeof(v_valor) <> 'number' then
          raise exception 'Informe a medição em número.' using errcode = '22023';
        end if;
        v_item.valor_numero := (v_valor #>> '{}')::numeric;
      when 'data' then
        begin
          v_item.valor_data := (v_valor #>> '{}')::date;
        exception when others then
          raise exception 'Informe uma data válida.' using errcode = '22023';
        end;
      when 'hora' then
        begin
          v_item.valor_hora := (v_valor #>> '{}')::time;
        exception when others then
          raise exception 'Informe uma hora válida.' using errcode = '22023';
        end;
      when 'selecao' then
        if jsonb_typeof(v_valor) <> 'string' or not ((v_valor #>> '{}') = any (v_item.opcoes)) then
          raise exception 'Escolha uma das opções do item.' using errcode = '22023';
        end if;
        v_item.valor_opcao := v_valor #>> '{}';
      when 'foto', 'assinatura' then
        begin
          v_anexo := (v_valor #>> '{}')::uuid;
        exception when others then
          raise exception 'Imagem inválida.' using errcode = '22023';
        end;
        if not exists (
          select 1 from public.os_anexos a
          where a.id = v_anexo and a.os_id = v_os_id and a.tipo = 'foto' and a.removido_em is null
        ) then
          raise exception 'A imagem precisa ser um anexo desta OS.' using errcode = '23514';
        end if;
        v_item.anexo_id := v_anexo;
    end case;
  end if;

  update public.os_checklist_itens
     set valor_booleano = v_item.valor_booleano,
         valor_texto = v_item.valor_texto,
         valor_numero = v_item.valor_numero,
         valor_data = v_item.valor_data,
         valor_hora = v_item.valor_hora,
         valor_opcao = v_item.valor_opcao,
         anexo_id = v_item.anexo_id,
         respondido_por = auth.uid(),
         respondido_em = now()
   where id = p_item_id;

  -- resposta de item que sumiu com a condição não fica pendurada
  loop
    update public.os_checklist_itens i
       set valor_booleano = null, valor_texto = null, valor_numero = null, valor_data = null,
           valor_hora = null, valor_opcao = null, anexo_id = null,
           respondido_por = null, respondido_em = null
     where i.checklist_id = v_item.checklist_id
       and i.depende_de_ordem is not null
       and i.respondido_em is not null
       and not public.item_checklist_visivel(i);
    exit when not found;
  end loop;

  select bool_and(public.item_checklist_respondido(i) or not public.item_checklist_visivel(i)) into v_completo_depois
  from public.os_checklist_itens i where i.checklist_id = v_item.checklist_id;

  if v_completo_depois and not v_completo_antes then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    select os.loja_id, auth.uid(), 'os_checklist_concluido',
           jsonb_build_object('os_id', os.id, 'cliente_id', os.cliente_id, 'checklist_id', v_item.checklist_id, 'checklist', v_nome)
    from public.ordens_servico os where os.id = v_os_id;
  end if;

  return jsonb_build_object('item_id', p_item_id, 'checklist_completo', v_completo_depois);
end;
$$;

create or replace function public.checklists_os(p_os_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ordens_servico where id = p_os_id and loja_id = v_loja) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'nome', c.nome, 'modelo_id', c.modelo_id, 'aplicado_em', c.aplicado_em, 'aplicado_por', ua.nome,
             'pendentes', (
               select count(*) from public.os_checklist_itens i
               where i.checklist_id = c.id and public.item_checklist_pendente(i)
             ),
             'itens', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id, 'ordem', i.ordem, 'rotulo', i.rotulo, 'tipo', i.tipo, 'obrigatorio', i.obrigatorio,
                        'opcoes', to_jsonb(i.opcoes), 'ajuda', i.ajuda,
                        'unidade', i.unidade, 'valor_min', i.valor_min, 'valor_max', i.valor_max,
                        'depende_de_ordem', i.depende_de_ordem, 'condicao_valor', i.condicao_valor,
                        'valor_booleano', i.valor_booleano, 'valor_texto', i.valor_texto, 'valor_numero', i.valor_numero,
                        'valor_data', i.valor_data, 'valor_hora', i.valor_hora, 'valor_opcao', i.valor_opcao,
                        'anexo', case when a.id is null then null else jsonb_build_object(
                          'id', a.id, 'nome_arquivo', a.nome_arquivo, 'caminho', a.caminho, 'removido', a.removido_em is not null) end,
                        'respondido', public.item_checklist_respondido(i),
                        'visivel', public.item_checklist_visivel(i),
                        'fora_faixa', public.item_checklist_fora_faixa(i),
                        'respondido_por', ur.nome, 'respondido_em', i.respondido_em)
                      order by i.ordem), '[]'::jsonb)
               from public.os_checklist_itens i
               left join public.os_anexos a on a.id = i.anexo_id and a.loja_id = v_loja
               left join public.usuarios ur on ur.id = i.respondido_por and ur.loja_id = v_loja
               where i.checklist_id = c.id
             ))
           order by c.aplicado_em, c.id), '[]'::jsonb)
    from public.os_checklists c
    left join public.usuarios ua on ua.id = c.aplicado_por and ua.loja_id = v_loja
    where c.os_id = p_os_id and c.loja_id = v_loja
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Finalizar: só o que está visível é exigido
-- ---------------------------------------------------------------------
create or replace function public.alterar_status_os(p_os_id uuid, p_status_id uuid, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_status_atual uuid;
  v_de record;
  v_para record;
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;

  select status_id into v_status_atual
  from public.ordens_servico
  where id = p_os_id and loja_id = v_loja
  for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  select id, nome, categoria, ativo into v_para
  from public.status_os where id = p_status_id and loja_id = v_loja;
  if not found then
    raise exception 'Status não encontrado.' using errcode = 'P0002';
  end if;

  if v_status_atual = v_para.id then
    return jsonb_build_object('os_id', p_os_id, 'status_id', v_para.id, 'categoria', v_para.categoria, 'alterado', false);
  end if;
  if not v_para.ativo then
    raise exception 'Este status está desativado.' using errcode = '23514';
  end if;

  select id, nome, categoria into v_de from public.status_os where id = v_status_atual;

  -- permissões pela categoria interna: o nome do status é personalizável
  if v_para.categoria = 'finalizado_sucesso' then
    if not public.tem_permissao('service_orders.finish') then
      raise exception 'Sem permissão para finalizar ordens de serviço.' using errcode = '42501';
    end if;
  elsif v_para.categoria = 'finalizado_cancelado' then
    if not public.tem_permissao('service_orders.cancel') then
      raise exception 'Sem permissão para cancelar ordens de serviço.' using errcode = '42501';
    end if;
  elsif not public.tem_permissao('service_orders.edit') then
    raise exception 'Sem permissão para alterar o status da OS.' using errcode = '42501';
  end if;

  -- reabrir exige a mesma permissão de quem finalizou/cancelou
  if v_de.categoria = 'finalizado_sucesso' and not public.tem_permissao('service_orders.finish') then
    raise exception 'Sem permissão para alterar uma OS finalizada.' using errcode = '42501';
  end if;
  if v_de.categoria = 'finalizado_cancelado' and not public.tem_permissao('service_orders.cancel') then
    raise exception 'Sem permissão para alterar uma OS cancelada.' using errcode = '42501';
  end if;

  if v_para.categoria = 'finalizado_cancelado' and v_observacao is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '23514';
  end if;
  if length(v_observacao) > 500 then
    raise exception 'A observação deve ter até 500 caracteres.' using errcode = '23514';
  end if;

  -- finalizar exige os itens obrigatórios visíveis respondidos
  if v_para.categoria = 'finalizado_sucesso' and exists (
       select 1
       from public.os_checklist_itens i
       join public.os_checklists c on c.id = i.checklist_id
       where c.os_id = p_os_id and public.item_checklist_pendente(i)
     ) then
    raise exception 'Responda os itens obrigatórios do checklist antes de finalizar a OS.' using errcode = '23514';
  end if;

  perform set_config('oxys.alterar_status_os', 'on', true);
  update public.ordens_servico
     set status_id = v_para.id,
         iniciado_em = case when v_para.categoria = 'em_andamento' then coalesce(iniciado_em, now()) else iniciado_em end,
         concluido_em = case
           when v_para.categoria in ('finalizado_sucesso', 'finalizado_cancelado') then now()
           else null
         end
   where id = p_os_id;
  perform set_config('oxys.alterar_status_os', 'off', true);

  insert into public.os_historico (os_id, usuario_id, status_anterior_id, status_novo_id, observacao)
  values (p_os_id, v_uid, v_de.id, v_para.id, v_observacao);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, v_uid, 'os_status_alterado',
          jsonb_build_object('os_id', p_os_id, 'de', v_de.id, 'para', v_para.id, 'observacao', v_observacao));

  return jsonb_build_object('os_id', p_os_id, 'status_id', v_para.id, 'categoria', v_para.categoria, 'alterado', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Execução
-- ---------------------------------------------------------------------
revoke execute on function public.item_checklist_visivel(public.os_checklist_itens) from public, anon;
revoke execute on function public.item_checklist_pendente(public.os_checklist_itens) from public, anon;
revoke execute on function public.item_checklist_fora_faixa(public.os_checklist_itens) from public, anon;
revoke execute on function public.exigir_checklist_respondivel(uuid) from public, anon, authenticated;
grant execute on function public.item_checklist_visivel(public.os_checklist_itens) to authenticated;
grant execute on function public.item_checklist_pendente(public.os_checklist_itens) to authenticated;
grant execute on function public.item_checklist_fora_faixa(public.os_checklist_itens) to authenticated;
