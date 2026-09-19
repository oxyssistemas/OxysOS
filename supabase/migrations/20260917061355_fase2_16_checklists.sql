-- =====================================================================
-- Fase 2 · 16 — Checklists da OS
--
-- * checklist_modelos / checklist_modelo_itens: modelos configuráveis pela
--   empresa (tipos: caixa de seleção, texto, número, foto, seleção, data),
--   com tipo de serviço sugerido (preparação para vincular por tipo,
--   segmento ou equipamento no futuro).
-- * os_checklists / os_checklist_itens: cópia do modelo aplicada à OS; editar
--   o modelo depois não altera checklists já aplicados. Respostas guardam
--   quem respondeu e quando.
-- * Escrita só por funções (validação por tipo, permissões, OS encerrada).
-- * Finalizar a OS exige os itens obrigatórios respondidos.
-- =====================================================================

create type public.tipo_item_checklist as enum ('checkbox', 'texto', 'numero', 'foto', 'selecao', 'data');

-- ---------------------------------------------------------------------
-- 1. Modelos
-- ---------------------------------------------------------------------
create table public.checklist_modelos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  descricao text,
  tipo_servico_id uuid,
  ativo boolean not null default true,
  versao int not null default 1,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint checklist_modelos_loja_id_id_key unique (loja_id, id),
  constraint checklist_modelos_tipo_mesma_loja_fkey foreign key (loja_id, tipo_servico_id)
    references public.tipos_servico(loja_id, id),
  constraint checklist_modelos_nome_tamanho check (length(btrim(nome)) between 1 and 80),
  constraint checklist_modelos_descricao_tamanho check (descricao is null or length(descricao) <= 300)
);

create unique index checklist_modelos_loja_nome_key on public.checklist_modelos(loja_id, public.normalizar_busca(nome));
create index idx_checklist_modelos_tipo on public.checklist_modelos(loja_id, tipo_servico_id);
create index idx_checklist_modelos_criado_por on public.checklist_modelos(criado_por);

create table public.checklist_modelo_itens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null,
  modelo_id uuid not null,
  ordem int not null,
  rotulo text not null,
  tipo public.tipo_item_checklist not null,
  obrigatorio boolean not null default false,
  opcoes text[] not null default '{}',
  ajuda text,
  constraint checklist_modelo_itens_modelo_fkey foreign key (loja_id, modelo_id)
    references public.checklist_modelos(loja_id, id) on delete cascade,
  constraint checklist_modelo_itens_ordem_key unique (modelo_id, ordem),
  constraint checklist_modelo_itens_rotulo_tamanho check (length(btrim(rotulo)) between 1 and 150),
  constraint checklist_modelo_itens_ajuda_tamanho check (ajuda is null or length(ajuda) <= 300),
  constraint checklist_modelo_itens_opcoes check (
    (tipo = 'selecao' and cardinality(opcoes) between 2 and 30) or (tipo <> 'selecao' and cardinality(opcoes) = 0)
  )
);

create index idx_checklist_modelo_itens_loja_modelo on public.checklist_modelo_itens(loja_id, modelo_id);

-- ---------------------------------------------------------------------
-- 2. Checklists aplicados na OS
-- ---------------------------------------------------------------------
create table public.os_checklists (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null,
  os_id uuid not null,
  modelo_id uuid references public.checklist_modelos(id) on delete set null,
  nome text not null,
  aplicado_por uuid references public.usuarios(id) on delete set null,
  aplicado_em timestamptz not null default now(),
  constraint os_checklists_loja_id_id_key unique (loja_id, id),
  constraint os_checklists_os_mesma_loja_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint os_checklists_modelo_unico unique (os_id, modelo_id)
);

create index idx_os_checklists_loja_os on public.os_checklists(loja_id, os_id);
create index idx_os_checklists_modelo on public.os_checklists(modelo_id);
create index idx_os_checklists_aplicado_por on public.os_checklists(aplicado_por);

create table public.os_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null,
  checklist_id uuid not null,
  ordem int not null,
  rotulo text not null,
  tipo public.tipo_item_checklist not null,
  obrigatorio boolean not null,
  opcoes text[] not null default '{}',
  ajuda text,
  valor_booleano boolean,
  valor_texto text,
  valor_numero numeric,
  valor_data date,
  valor_opcao text,
  anexo_id uuid,
  respondido_por uuid references public.usuarios(id) on delete set null,
  respondido_em timestamptz,
  constraint os_checklist_itens_checklist_fkey foreign key (loja_id, checklist_id)
    references public.os_checklists(loja_id, id) on delete cascade,
  constraint os_checklist_itens_anexo_fkey foreign key (loja_id, anexo_id)
    references public.os_anexos(loja_id, id) on delete set null (anexo_id),
  constraint os_checklist_itens_texto_tamanho check (valor_texto is null or length(valor_texto) <= 2000)
);

create index idx_os_checklist_itens_loja_checklist on public.os_checklist_itens(loja_id, checklist_id, ordem);
create index idx_os_checklist_itens_loja_anexo on public.os_checklist_itens(loja_id, anexo_id);
create index idx_os_checklist_itens_respondido_por on public.os_checklist_itens(respondido_por);

-- item respondido: caixa marcada ou valor preenchido conforme o tipo
create or replace function public.item_checklist_respondido(p_item public.os_checklist_itens)
returns boolean
language sql immutable set search_path = '' as $$
  select case p_item.tipo
    when 'checkbox' then coalesce(p_item.valor_booleano, false)
    when 'texto' then p_item.valor_texto is not null
    when 'numero' then p_item.valor_numero is not null
    when 'data' then p_item.valor_data is not null
    when 'selecao' then p_item.valor_opcao is not null
    when 'foto' then p_item.anexo_id is not null
  end;
$$;

-- leitura pela empresa; escrita só pelas funções abaixo
alter table public.checklist_modelos enable row level security;
alter table public.checklist_modelo_itens enable row level security;
alter table public.os_checklists enable row level security;
alter table public.os_checklist_itens enable row level security;

create policy checklist_modelos_select on public.checklist_modelos for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy checklist_modelo_itens_select on public.checklist_modelo_itens for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy os_checklists_select on public.os_checklists for select to authenticated
  using (loja_id = (select public.loja_operacional_id())
         and exists (select 1 from public.ordens_servico os where os.id = os_checklists.os_id));
create policy os_checklist_itens_select on public.os_checklist_itens for select to authenticated
  using (loja_id = (select public.loja_operacional_id())
         and exists (select 1 from public.os_checklists c where c.id = os_checklist_itens.checklist_id));

-- ---------------------------------------------------------------------
-- 3. Funções de modelos (Configurações)
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
  v_id uuid;
  v_item jsonb;
  v_ordem int := 0;
  v_tipo public.tipo_item_checklist;
  v_opcoes text[];
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
    insert into public.checklist_modelo_itens (loja_id, modelo_id, ordem, rotulo, tipo, obrigatorio, opcoes, ajuda)
    values (
      v_loja, v_id, v_ordem,
      btrim(regexp_replace(coalesce(v_item->>'rotulo', ''), '\s+', ' ', 'g')),
      v_tipo,
      coalesce((v_item->>'obrigatorio')::boolean, false),
      case when v_tipo = 'selecao' then v_opcoes else '{}' end,
      nullif(btrim(coalesce(v_item->>'ajuda', '')), '')
    );
  end loop;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (v_uid, v_loja, case when p_id is null then 'checklist_modelo_criado' else 'checklist_modelo_alterado' end,
          'checklist_modelo', v_id, jsonb_build_object('nome', v_nome, 'itens', v_ordem));
  return v_id;
end;
$$;

create or replace function public.definir_checklist_modelo_ativo(p_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  update public.checklist_modelos set ativo = p_ativo, versao = versao + 1, atualizado_em = now()
   where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Modelo de checklist não encontrado.' using errcode = 'P0002';
  end if;
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_ativo then 'checklist_modelo_reativado' else 'checklist_modelo_desativado' end,
          'checklist_modelo', p_id, '{}'::jsonb);
end;
$$;

create or replace function public.excluir_checklist_modelo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_nome text;
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  select nome into v_nome from public.checklist_modelos where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Modelo de checklist não encontrado.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.os_checklists where modelo_id = p_id) then
    raise exception 'Este modelo já foi usado em ordens de serviço. Desative-o em vez de excluir.' using errcode = '23503';
  end if;
  delete from public.checklist_modelos where id = p_id;
  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'checklist_modelo_excluido', 'checklist_modelo', p_id, jsonb_build_object('nome', v_nome));
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
                        'obrigatorio', i.obrigatorio, 'opcoes', to_jsonb(i.opcoes), 'ajuda', i.ajuda)
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
-- 4. Funções da OS
-- ---------------------------------------------------------------------
-- OS da empresa, editável (permissão) e não encerrada
create or replace function public.exigir_os_editavel(p_os_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_categoria public.categoria_status;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.edit') then
    raise exception 'Sem permissão para editar ordens de serviço.' using errcode = '42501';
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

  insert into public.os_checklist_itens (loja_id, checklist_id, ordem, rotulo, tipo, obrigatorio, opcoes, ajuda)
  select v_loja, v_id, i.ordem, i.rotulo, i.tipo, i.obrigatorio, i.opcoes, i.ajuda
  from public.checklist_modelo_itens i where i.modelo_id = p_modelo_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  select v_loja, auth.uid(), 'os_checklist_aplicado',
         jsonb_build_object('os_id', p_os_id, 'cliente_id', os.cliente_id, 'checklist_id', v_id, 'checklist', v_modelo.nome)
  from public.ordens_servico os where os.id = p_os_id;
  return v_id;
end;
$$;

create or replace function public.remover_checklist_os(p_checklist_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_checklist record;
begin
  select c.id, c.os_id, c.nome into v_checklist
  from public.os_checklists c where c.id = p_checklist_id and c.loja_id = public.loja_operacional_id();
  if not found then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;
  perform public.exigir_os_editavel(v_checklist.os_id);
  if exists (select 1 from public.os_checklist_itens where checklist_id = p_checklist_id and respondido_em is not null) then
    raise exception 'Este checklist já tem respostas e não pode ser removido.' using errcode = '23514';
  end if;
  delete from public.os_checklists where id = p_checklist_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  select os.loja_id, auth.uid(), 'os_checklist_removido',
         jsonb_build_object('os_id', os.id, 'cliente_id', os.cliente_id, 'checklist', v_checklist.nome)
  from public.ordens_servico os where os.id = v_checklist.os_id;
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
  perform public.exigir_os_editavel(v_os_id);

  select bool_and(public.item_checklist_respondido(i)) into v_completo_antes
  from public.os_checklist_itens i where i.checklist_id = v_item.checklist_id;

  v_item.valor_booleano := null; v_item.valor_texto := null; v_item.valor_numero := null;
  v_item.valor_data := null; v_item.valor_opcao := null; v_item.anexo_id := null;

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
      when 'data' then
        begin
          v_item.valor_data := (v_valor #>> '{}')::date;
        exception when others then
          raise exception 'Informe uma data válida.' using errcode = '22023';
        end;
      when 'selecao' then
        if jsonb_typeof(v_valor) <> 'string' or not ((v_valor #>> '{}') = any (v_item.opcoes)) then
          raise exception 'Escolha uma das opções do item.' using errcode = '22023';
        end if;
        v_item.valor_opcao := v_valor #>> '{}';
      when 'foto' then
        begin
          v_anexo := (v_valor #>> '{}')::uuid;
        exception when others then
          raise exception 'Foto inválida.' using errcode = '22023';
        end;
        if not exists (
          select 1 from public.os_anexos a
          where a.id = v_anexo and a.os_id = v_os_id and a.tipo = 'foto' and a.removido_em is null
        ) then
          raise exception 'A foto precisa ser um anexo desta OS.' using errcode = '23514';
        end if;
        v_item.anexo_id := v_anexo;
    end case;
  end if;

  update public.os_checklist_itens
     set valor_booleano = v_item.valor_booleano,
         valor_texto = v_item.valor_texto,
         valor_numero = v_item.valor_numero,
         valor_data = v_item.valor_data,
         valor_opcao = v_item.valor_opcao,
         anexo_id = v_item.anexo_id,
         respondido_por = auth.uid(),
         respondido_em = now()
   where id = p_item_id;

  select bool_and(public.item_checklist_respondido(i)) into v_completo_depois
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
             'itens', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', i.id, 'ordem', i.ordem, 'rotulo', i.rotulo, 'tipo', i.tipo, 'obrigatorio', i.obrigatorio,
                        'opcoes', to_jsonb(i.opcoes), 'ajuda', i.ajuda,
                        'valor_booleano', i.valor_booleano, 'valor_texto', i.valor_texto, 'valor_numero', i.valor_numero,
                        'valor_data', i.valor_data, 'valor_opcao', i.valor_opcao,
                        'anexo', case when a.id is null then null else jsonb_build_object(
                          'id', a.id, 'nome_arquivo', a.nome_arquivo, 'caminho', a.caminho, 'removido', a.removido_em is not null) end,
                        'respondido', public.item_checklist_respondido(i),
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
-- 5. Exclusão de empresa: modelos antes dos tipos de serviço
-- ---------------------------------------------------------------------
create or replace function public.trg_lojas_excluir_dependencias()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- itens, histórico, anexos, checklists e observações saem em cascata com a OS
  delete from public.ordens_servico where loja_id = old.id;
  delete from public.equipamentos where loja_id = old.id;
  delete from public.tecnico_especialidades where loja_id = old.id;
  delete from public.checklist_modelos where loja_id = old.id;
  return old;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Troca de status: checklist obrigatório ao finalizar
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

  -- finalizar exige os itens obrigatórios dos checklists respondidos
  if v_para.categoria = 'finalizado_sucesso' and exists (
       select 1
       from public.os_checklist_itens i
       join public.os_checklists c on c.id = i.checklist_id
       where c.os_id = p_os_id and i.obrigatorio and not public.item_checklist_respondido(i)
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
-- 7. Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.item_checklist_respondido(public.os_checklist_itens) from public, anon;
revoke execute on function public.exigir_os_editavel(uuid) from public, anon, authenticated;
revoke execute on function public.salvar_checklist_modelo(uuid, integer, jsonb, jsonb) from public, anon;
revoke execute on function public.definir_checklist_modelo_ativo(uuid, boolean) from public, anon;
revoke execute on function public.excluir_checklist_modelo(uuid) from public, anon;
revoke execute on function public.listar_checklist_modelos() from public, anon;
revoke execute on function public.aplicar_checklist_os(uuid, uuid) from public, anon;
revoke execute on function public.remover_checklist_os(uuid) from public, anon;
revoke execute on function public.responder_item_checklist(uuid, jsonb) from public, anon;
revoke execute on function public.checklists_os(uuid) from public, anon;
grant execute on function public.item_checklist_respondido(public.os_checklist_itens) to authenticated;
grant execute on function public.salvar_checklist_modelo(uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.definir_checklist_modelo_ativo(uuid, boolean) to authenticated;
grant execute on function public.excluir_checklist_modelo(uuid) to authenticated;
grant execute on function public.listar_checklist_modelos() to authenticated;
grant execute on function public.aplicar_checklist_os(uuid, uuid) to authenticated;
grant execute on function public.remover_checklist_os(uuid) to authenticated;
grant execute on function public.responder_item_checklist(uuid, jsonb) to authenticated;
grant execute on function public.checklists_os(uuid) to authenticated;
