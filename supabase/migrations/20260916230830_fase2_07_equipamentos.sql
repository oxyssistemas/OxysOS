-- =====================================================================
-- Fase 2 · 07 · Módulo de Equipamentos (ativos)
--
-- 1. categorias_equipamento (configuráveis por empresa)
-- 2. equipamentos: empresa → cliente → (endereço do cliente); situação,
--    garantia, arquivamento, versão e código público aleatório para QR Code
-- 3. ordens_servico.equipamento_id (preparado; o equipamento precisa ser do
--    cliente da OS; equipamento arquivado não recebe OS)
-- 4. RLS: assets.view / create / edit / archive
-- 5. Eventos + auditoria (equipamento alterado/arquivado)
-- 6. RPCs: listar_equipamentos, equipamento_historico,
--    equipamento_por_codigo (leitura de QR por usuário logado da empresa),
--    regenerar_codigo_equipamento
-- 7. Dashboard: card de equipamentos e evento "equipamento adicionado"
--
-- Futuro (não implementado): categorias sugeridas por segmento; consulta
-- pública do QR (Portal do Cliente) com dados limitados e abertura de chamado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Categorias
-- ---------------------------------------------------------------------
create table public.categorias_equipamento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint categorias_equipamento_loja_id_id_key unique (loja_id, id),
  constraint categorias_equipamento_nome_tamanho check (length(btrim(nome)) between 1 and 60)
);

create unique index categorias_equipamento_loja_nome_key
  on public.categorias_equipamento(loja_id, public.normalizar_busca(nome));

-- regras genéricas de catálogos simples (nome normalizado, empresa imutável)
create or replace function public.trg_catalogo_simples_regras()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.loja_id <> old.loja_id then
      raise exception 'Alteração não permitida.' using errcode = '42501';
    end if;
    new.criado_em := old.criado_em;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger categorias_equipamento_regras
  before insert or update on public.categorias_equipamento
  for each row execute function public.trg_catalogo_simples_regras();

-- ---------------------------------------------------------------------
-- 2. Equipamentos
-- ---------------------------------------------------------------------
create type public.status_equipamento as enum ('operacional', 'em_manutencao', 'fora_de_operacao');

-- 22 caracteres URL-safe a partir de 122 bits aleatórios (UUID v4); nunca sequencial
create or replace function public.gerar_codigo_publico()
returns text
language sql volatile set search_path = '' as $$
  select replace(translate(encode(uuid_send(gen_random_uuid()), 'base64'), '+/', '-_'), '=', '');
$$;

-- endereço precisa pertencer ao mesmo cliente do equipamento
alter table public.cliente_enderecos
  add constraint cliente_enderecos_cliente_id_id_key unique (cliente_id, id);

create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null,
  cliente_endereco_id uuid,
  categoria_id uuid,
  nome text not null,
  marca text,
  modelo text,
  numero_serie text,
  data_instalacao date,
  garantia_ate date,
  localizacao text,
  observacoes text,
  status public.status_equipamento not null default 'operacional',
  codigo_publico text not null default public.gerar_codigo_publico(),
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null,
  arquivado_em timestamptz,
  arquivado_por uuid references public.usuarios(id) on delete set null,
  versao integer not null default 1,
  constraint equipamentos_loja_id_id_key unique (loja_id, id),
  constraint equipamentos_cliente_id_id_key unique (cliente_id, id),
  constraint equipamentos_codigo_publico_key unique (codigo_publico),
  constraint equipamentos_cliente_mesma_loja_fkey
    foreign key (loja_id, cliente_id) references public.clientes(loja_id, id),
  constraint equipamentos_endereco_do_cliente_fkey
    foreign key (cliente_id, cliente_endereco_id) references public.cliente_enderecos(cliente_id, id),
  constraint equipamentos_categoria_mesma_loja_fkey
    foreign key (loja_id, categoria_id) references public.categorias_equipamento(loja_id, id),
  constraint equipamentos_nome_tamanho check (length(btrim(nome)) between 1 and 150),
  constraint equipamentos_textos_tamanho check (
    coalesce(length(marca), 0) <= 80 and coalesce(length(modelo), 0) <= 80
    and coalesce(length(numero_serie), 0) <= 100 and coalesce(length(localizacao), 0) <= 200
    and coalesce(length(observacoes), 0) <= 5000),
  constraint equipamentos_datas_validas check (
    (data_instalacao is null or data_instalacao >= date '1950-01-01')
    and (garantia_ate is null or garantia_ate >= date '1950-01-01')),
  constraint equipamentos_codigo_publico_formato check (codigo_publico ~ '^[A-Za-z0-9_-]{16,64}$')
);

alter table public.equipamentos
  add column busca text generated always as (
    public.normalizar_busca(
      nome || ' ' || coalesce(marca, '') || ' ' || coalesce(modelo, '') || ' ' ||
      coalesce(numero_serie, '') || ' ' || coalesce(localizacao, '')
    )
  ) stored;

create index idx_equipamentos_loja_cliente on public.equipamentos(loja_id, cliente_id);
create index idx_equipamentos_cliente_endereco on public.equipamentos(cliente_id, cliente_endereco_id);
create index idx_equipamentos_loja_categoria on public.equipamentos(loja_id, categoria_id);
create index idx_equipamentos_loja_nome on public.equipamentos(loja_id, nome);
create index idx_equipamentos_loja_ativos on public.equipamentos(loja_id, nome) where arquivado_em is null;
create index idx_equipamentos_busca_trgm on public.equipamentos using gin (busca extensions.gin_trgm_ops);

create or replace function public.trg_equipamentos_normalizar()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  new.marca := nullif(btrim(coalesce(new.marca, '')), '');
  new.modelo := nullif(btrim(coalesce(new.modelo, '')), '');
  new.numero_serie := nullif(btrim(coalesce(new.numero_serie, '')), '');
  new.localizacao := nullif(btrim(coalesce(new.localizacao, '')), '');
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');
  return new;
end;
$$;

create trigger equipamentos_a_normalizar
  before insert or update on public.equipamentos
  for each row execute function public.trg_equipamentos_normalizar();

create or replace function public.trg_equipamentos_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_dados_mudaram boolean;
  v_arquivamento_mudou boolean;
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.clientes where id = new.cliente_id and arquivado_em is not null) then
      raise exception 'Cliente arquivado não pode receber novos equipamentos.' using errcode = '23514';
    end if;
    if v_uid is not null then new.criado_por := v_uid; end if;
    -- o código público é sempre gerado pelo banco (nunca aceito do cliente)
    new.codigo_publico := public.gerar_codigo_publico();
    new.atualizado_por := new.criado_por;
    new.atualizado_em := now();
    new.arquivado_em := null;
    new.arquivado_por := null;
    new.versao := 1;
    return new;
  end if;

  if new.id <> old.id or new.loja_id <> old.loja_id or new.criado_em <> old.criado_em
     or new.criado_por is distinct from old.criado_por then
    raise exception 'Alteração não permitida.' using errcode = '42501';
  end if;

  if new.cliente_id <> old.cliente_id
     and exists (select 1 from public.clientes where id = new.cliente_id and arquivado_em is not null) then
    raise exception 'Cliente arquivado não pode receber novos equipamentos.' using errcode = '23514';
  end if;

  if new.codigo_publico <> old.codigo_publico
     and coalesce(current_setting('oxys.regenerar_codigo_equipamento', true), '') <> 'on' then
    raise exception 'O código do QR Code só pode ser regenerado pela opção própria.' using errcode = '42501';
  end if;

  v_dados_mudaram :=
    (new.cliente_id, new.cliente_endereco_id, new.categoria_id, new.nome, new.marca, new.modelo, new.numero_serie,
     new.data_instalacao, new.garantia_ate, new.localizacao, new.observacoes, new.status, new.codigo_publico)
    is distinct from
    (old.cliente_id, old.cliente_endereco_id, old.categoria_id, old.nome, old.marca, old.modelo, old.numero_serie,
     old.data_instalacao, old.garantia_ate, old.localizacao, old.observacoes, old.status, old.codigo_publico);
  v_arquivamento_mudou := (new.arquivado_em is null) <> (old.arquivado_em is null);

  if v_uid is not null then
    if v_dados_mudaram and not public.tem_permissao('assets.edit') then
      raise exception 'Sem permissão para editar equipamentos.' using errcode = '42501';
    end if;
    if v_arquivamento_mudou and not public.tem_permissao('assets.archive') then
      raise exception 'Sem permissão para arquivar equipamentos.' using errcode = '42501';
    end if;
  end if;

  if v_arquivamento_mudou then
    if new.arquivado_em is null then
      new.arquivado_por := null;
    else
      new.arquivado_em := now();
      new.arquivado_por := v_uid;
    end if;
  else
    new.arquivado_em := old.arquivado_em;
    new.arquivado_por := old.arquivado_por;
  end if;

  new.versao := old.versao + 1;
  new.atualizado_em := now();
  new.atualizado_por := v_uid;
  return new;
end;
$$;

create trigger equipamentos_b_regras
  before insert or update on public.equipamentos
  for each row execute function public.trg_equipamentos_regras();

create or replace function public.trg_equipamentos_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_campos text[] := '{}';
  v_acao text;
begin
  if tg_op = 'INSERT' then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'equipamento_cadastrado',
            jsonb_build_object('equipamento_id', new.id, 'cliente_id', new.cliente_id));
    return null;
  end if;

  if (new.arquivado_em is null) <> (old.arquivado_em is null) then
    v_acao := case when new.arquivado_em is null then 'equipamento_reativado' else 'equipamento_arquivado' end;
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), v_acao, jsonb_build_object('equipamento_id', new.id, 'cliente_id', new.cliente_id));
    insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
    values (auth.uid(), new.loja_id, v_acao, 'equipamento', new.id, jsonb_build_object('nome', new.nome));
  end if;

  if new.codigo_publico <> old.codigo_publico then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'equipamento_codigo_regenerado', jsonb_build_object('equipamento_id', new.id));
    insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
    values (auth.uid(), new.loja_id, 'equipamento_codigo_regenerado', 'equipamento', new.id, jsonb_build_object('nome', new.nome));
  end if;

  if new.cliente_id is distinct from old.cliente_id then v_campos := v_campos || 'cliente'::text; end if;
  if new.cliente_endereco_id is distinct from old.cliente_endereco_id then v_campos := v_campos || 'endereco'::text; end if;
  if new.categoria_id is distinct from old.categoria_id then v_campos := v_campos || 'categoria'::text; end if;
  if new.nome is distinct from old.nome then v_campos := v_campos || 'nome'::text; end if;
  if new.marca is distinct from old.marca then v_campos := v_campos || 'marca'::text; end if;
  if new.modelo is distinct from old.modelo then v_campos := v_campos || 'modelo'::text; end if;
  if new.numero_serie is distinct from old.numero_serie then v_campos := v_campos || 'numero_serie'::text; end if;
  if new.data_instalacao is distinct from old.data_instalacao then v_campos := v_campos || 'data_instalacao'::text; end if;
  if new.garantia_ate is distinct from old.garantia_ate then v_campos := v_campos || 'garantia'::text; end if;
  if new.localizacao is distinct from old.localizacao then v_campos := v_campos || 'localizacao'::text; end if;
  if new.observacoes is distinct from old.observacoes then v_campos := v_campos || 'observacoes'::text; end if;
  if new.status is distinct from old.status then v_campos := v_campos || 'status'::text; end if;

  if cardinality(v_campos) > 0 then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'equipamento_atualizado',
            jsonb_build_object('equipamento_id', new.id, 'cliente_id', new.cliente_id, 'campos', v_campos));
    insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
    values (auth.uid(), new.loja_id, 'equipamento_alterado', 'equipamento', new.id,
            jsonb_build_object('nome', new.nome, 'campos', v_campos));
  end if;
  return null;
end;
$$;

create trigger equipamentos_log
  after insert or update on public.equipamentos
  for each row execute function public.trg_equipamentos_log();

create index idx_log_eventos_loja_equipamento on public.log_eventos(loja_id, (detalhes->>'equipamento_id'));

-- ---------------------------------------------------------------------
-- 3. Equipamento na OS (preparação para o módulo de Ordens de Serviço)
-- ---------------------------------------------------------------------
alter table public.ordens_servico add column equipamento_id uuid;
alter table public.ordens_servico
  add constraint ordens_servico_equipamento_do_cliente_fkey
  foreign key (cliente_id, equipamento_id) references public.equipamentos(cliente_id, id);
create index idx_os_loja_equipamento on public.ordens_servico(loja_id, equipamento_id);
create index idx_os_cliente_equipamento on public.ordens_servico(cliente_id, equipamento_id);

create or replace function public.trg_ordens_servico_equipamento_ativo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.equipamento_id is null
     or (tg_op = 'UPDATE' and new.equipamento_id is not distinct from old.equipamento_id) then
    return new;
  end if;
  if exists (select 1 from public.equipamentos where id = new.equipamento_id and arquivado_em is not null) then
    raise exception 'Equipamento arquivado não pode receber ordens de serviço.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ordens_servico_equipamento_ativo
  before insert or update of equipamento_id on public.ordens_servico
  for each row execute function public.trg_ordens_servico_equipamento_ativo();

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------
alter table public.categorias_equipamento enable row level security;
alter table public.equipamentos enable row level security;

create policy categorias_equipamento_select on public.categorias_equipamento for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and ((select public.tem_permissao('assets.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy categorias_equipamento_insert on public.categorias_equipamento for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and (select public.tem_permissao('assets.edit'))
  );
create policy categorias_equipamento_update on public.categorias_equipamento for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and (select public.tem_permissao('assets.edit'))
  )
  with check (loja_id = (select public.loja_operacional_id()));
create policy categorias_equipamento_delete on public.categorias_equipamento for delete to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and (select public.tem_permissao('assets.edit'))
  );

-- Leitura também para quem vê OS (a OS exibe o equipamento)
create policy equipamentos_select on public.equipamentos for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and ((select public.tem_permissao('assets.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy equipamentos_insert on public.equipamentos for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and (select public.tem_permissao('assets.create'))
  );
create policy equipamentos_update on public.equipamentos for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('assets'))
    and ((select public.tem_permissao('assets.edit')) or (select public.tem_permissao('assets.archive')))
  )
  with check (loja_id = (select public.loja_operacional_id()));
-- sem DELETE: equipamentos são arquivados

-- ---------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------
create or replace function public.listar_equipamentos(
  p_busca text default null,
  p_arquivo text default 'ativos',
  p_status public.status_equipamento default null,
  p_categoria uuid default null,
  p_cliente uuid default null,
  p_garantia text default null,
  p_pagina integer default 1,
  p_por_pagina integer default 20
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_por_pagina, 20), 1), 100);
  v_offset int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 100);
  v_termo text := nullif(public.normalizar_busca(coalesce(p_busca, '')), '');
  v_padrao text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total bigint;
  v_itens jsonb;
begin
  if v_loja is null or not public.tem_feature('assets')
     or not (public.tem_permissao('assets.view') or public.tem_permissao('service_orders.view')) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if v_termo is not null then
    v_padrao := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(x.item order by x.nome, x.id), '[]'::jsonb), coalesce(max(x.total), 0)
    into v_itens, v_total
  from (
    select
      e.id,
      e.nome,
      count(*) over () as total,
      jsonb_build_object(
        'id', e.id,
        'nome', e.nome,
        'marca', e.marca,
        'modelo', e.modelo,
        'numero_serie', e.numero_serie,
        'status', e.status,
        'garantia_ate', e.garantia_ate,
        'data_instalacao', e.data_instalacao,
        'localizacao', e.localizacao,
        'arquivado_em', e.arquivado_em,
        'versao', e.versao,
        'cliente', jsonb_build_object('id', c.id, 'nome', c.nome, 'arquivado', c.arquivado_em is not null),
        'categoria', case when cat.id is null then null
                          else jsonb_build_object('id', cat.id, 'nome', cat.nome, 'ativo', cat.ativo) end,
        'endereco', case when en.id is null then null
                         else jsonb_build_object('id', en.id, 'rotulo', en.rotulo, 'cidade', en.cidade, 'estado', en.estado) end,
        'total_os', (select count(*) from public.ordens_servico os
                      where os.loja_id = v_loja and os.equipamento_id = e.id)
      ) as item
    from public.equipamentos e
    join public.clientes c on c.id = e.cliente_id and c.loja_id = v_loja
    left join public.categorias_equipamento cat on cat.id = e.categoria_id and cat.loja_id = v_loja
    left join public.cliente_enderecos en on en.id = e.cliente_endereco_id and en.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        coalesce(p_arquivo, 'ativos') = 'todos'
        or (coalesce(p_arquivo, 'ativos') = 'ativos' and e.arquivado_em is null)
        or (p_arquivo = 'arquivados' and e.arquivado_em is not null)
      )
      and (p_status is null or e.status = p_status)
      and (p_categoria is null or e.categoria_id = p_categoria)
      and (p_cliente is null or e.cliente_id = p_cliente)
      and (
        p_garantia is null
        or (p_garantia = 'vigente' and e.garantia_ate >= v_hoje)
        or (p_garantia = 'vencendo' and e.garantia_ate between v_hoje and v_hoje + 30)
        or (p_garantia = 'vencida' and e.garantia_ate < v_hoje)
        or (p_garantia = 'sem' and e.garantia_ate is null)
      )
      and (v_padrao is null or e.busca like v_padrao or c.busca like v_padrao)
    order by e.nome, e.id
    limit v_limite offset v_offset
  ) x;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end;
$$;

-- Histórico: eventos do equipamento e das OS dele
create or replace function public.equipamento_historico(p_equipamento_id uuid, p_limite int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_limite, 100), 1), 200);
  v_ver_os boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_feature('assets') or not public.tem_permissao('assets.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.equipamentos where id = p_equipamento_id and loja_id = v_loja) then
    raise exception 'Equipamento não encontrado.' using errcode = 'P0002';
  end if;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'acao', t.acao, 'criado_em', t.criado_em, 'usuario', t.usuario,
           'campos', t.campos, 'status_novo', t.status_novo)
         order by t.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select e.id, e.acao, e.criado_em, u.nome as usuario, e.detalhes->'campos' as campos, st.nome as status_novo
    from public.log_eventos e
    left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
    left join public.ordens_servico os on os.id::text = e.detalhes->>'os_id' and os.loja_id = v_loja
    left join public.status_os st on st.id::text = e.detalhes->>'para' and st.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        e.detalhes->>'equipamento_id' = p_equipamento_id::text
        or (v_ver_os and e.acao like 'os\_%' and os.equipamento_id = p_equipamento_id)
      )
    order by e.criado_em desc
    limit v_limite
  ) t;

  return v_resultado;
end;
$$;

-- Leitura do QR Code por usuário logado: só resolve equipamentos da própria empresa
create or replace function public.equipamento_por_codigo(p_codigo text)
returns uuid
language sql stable security definer set search_path = public as $$
  select e.id
  from public.equipamentos e
  where e.codigo_publico = p_codigo
    and e.loja_id = public.loja_operacional_id()
    and public.tem_feature('assets')
    and (public.tem_permissao('assets.view') or public.tem_permissao('service_orders.view'));
$$;

-- Novo código (ex.: etiqueta extraviada); o anterior deixa de funcionar
create or replace function public.regenerar_codigo_equipamento(p_equipamento_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_codigo text;
begin
  if v_loja is null or not public.tem_feature('assets') or not public.tem_permissao('assets.edit') then
    raise exception 'Sem permissão para editar equipamentos.' using errcode = '42501';
  end if;

  perform set_config('oxys.regenerar_codigo_equipamento', 'on', true);
  update public.equipamentos
     set codigo_publico = public.gerar_codigo_publico()
   where id = p_equipamento_id and loja_id = v_loja
  returning codigo_publico into v_codigo;
  perform set_config('oxys.regenerar_codigo_equipamento', 'off', true);

  if v_codigo is null then
    raise exception 'Equipamento não encontrado.' using errcode = 'P0002';
  end if;
  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Dashboard: equipamentos e "equipamento adicionado"
-- ---------------------------------------------------------------------
create or replace function public.dashboard_resumo(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_ver_os boolean;
  v_ver_clientes boolean;
  v_ver_tecnicos boolean;
  v_ver_equipamentos boolean;
  v_campo_data text;
  v_passo interval;
  v_cards jsonb;
  v_por_status jsonb;
  v_por_periodo jsonb;
  v_por_responsavel jsonb;
begin
  if v_loja is null or not public.tem_permissao('dashboard.view') then
    raise exception 'Acesso negado ao dashboard.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_fim - p_inicio > interval '367 days' then
    raise exception 'O período máximo é de 1 ano.' using errcode = '22023';
  end if;

  begin
    perform now() at time zone p_fuso;
  exception when others then
    p_fuso := 'America/Sao_Paulo';
  end;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');
  v_ver_tecnicos := public.tem_feature('technicians') and public.tem_permissao('technicians.view');
  v_ver_equipamentos := public.tem_feature('assets') and public.tem_permissao('assets.view');

  if p_fim - p_inicio <= interval '62 days' then
    v_campo_data := 'day';
    v_passo := interval '1 day';
  else
    v_campo_data := 'month';
    v_passo := interval '1 month';
  end if;

  v_cards := jsonb_build_object(
    'os_abertas', null, 'os_em_andamento', null, 'os_pausadas', null,
    'os_criadas_periodo', null, 'os_finalizadas_periodo', null,
    'clientes_total', null, 'clientes_novos_periodo', null,
    'tecnicos_ativos', null, 'equipamentos', null,
    'os_atrasadas', null, 'faturamento_periodo', null
  );

  if v_ver_os then
    select v_cards || jsonb_build_object(
      'os_abertas', count(*) filter (where s.categoria = 'aberto'),
      'os_em_andamento', count(*) filter (where s.categoria = 'em_andamento'),
      'os_pausadas', count(*) filter (where s.categoria = 'pausado'),
      'os_criadas_periodo', count(*) filter (where os.criado_em >= p_inicio and os.criado_em < p_fim)
    )
    into v_cards
    from public.ordens_servico os
    join public.status_os s on s.id = os.status_id
    where os.loja_id = v_loja;

    select v_cards || jsonb_build_object('os_finalizadas_periodo', count(distinct h.os_id))
    into v_cards
    from public.os_historico h
    join public.ordens_servico os on os.id = h.os_id and os.loja_id = v_loja
    join public.status_os s on s.id = h.status_novo_id and s.loja_id = v_loja
    where s.categoria = 'finalizado_sucesso'
      and h.criado_em >= p_inicio and h.criado_em < p_fim;
  end if;

  if v_ver_clientes then
    select v_cards || jsonb_build_object(
      'clientes_total', count(*) filter (where c.arquivado_em is null),
      'clientes_novos_periodo', count(*) filter (where c.criado_em >= p_inicio and c.criado_em < p_fim)
    )
    into v_cards
    from public.clientes c
    where c.loja_id = v_loja;
  end if;

  if v_ver_tecnicos then
    select v_cards || jsonb_build_object('tecnicos_ativos', count(*))
    into v_cards
    from public.tecnicos t
    where t.loja_id = v_loja and t.ativo;
  end if;

  if v_ver_equipamentos then
    select v_cards || jsonb_build_object('equipamentos', count(*))
    into v_cards
    from public.equipamentos e
    where e.loja_id = v_loja and e.arquivado_em is null;
  end if;

  if not v_ver_os then
    return jsonb_build_object(
      'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                    'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
      'cards', v_cards,
      'os_por_status', null, 'os_por_periodo', null, 'os_por_responsavel', null, 'os_por_prioridade', null
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nome', t.nome, 'cor', t.cor, 'categoria', t.categoria, 'total', t.total)
         order by t.ordem, t.nome), '[]'::jsonb)
  into v_por_status
  from (
    select s.id, s.nome, s.cor, s.categoria, s.ordem, count(os.id) as total
    from public.status_os s
    left join public.ordens_servico os
      on os.status_id = s.id and os.loja_id = v_loja
     and os.criado_em >= p_inicio and os.criado_em < p_fim
    where s.loja_id = v_loja
    group by s.id
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'inicio', to_char(b.bucket, 'YYYY-MM-DD'),
           'criadas', coalesce(c.total, 0),
           'finalizadas', coalesce(f.total, 0))
         order by b.bucket), '[]'::jsonb)
  into v_por_periodo
  from generate_series(
         date_trunc(v_campo_data, p_inicio at time zone p_fuso),
         date_trunc(v_campo_data, (p_fim - interval '1 microsecond') at time zone p_fuso),
         v_passo
       ) as b(bucket)
  left join (
    select date_trunc(v_campo_data, os.criado_em at time zone p_fuso) as bucket, count(*) as total
    from public.ordens_servico os
    where os.loja_id = v_loja and os.criado_em >= p_inicio and os.criado_em < p_fim
    group by 1
  ) c on c.bucket = b.bucket
  left join (
    select date_trunc(v_campo_data, h.criado_em at time zone p_fuso) as bucket, count(distinct h.os_id) as total
    from public.os_historico h
    join public.ordens_servico os on os.id = h.os_id and os.loja_id = v_loja
    join public.status_os s on s.id = h.status_novo_id and s.loja_id = v_loja
    where s.categoria = 'finalizado_sucesso' and h.criado_em >= p_inicio and h.criado_em < p_fim
    group by 1
  ) f on f.bucket = b.bucket;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.responsavel_id, 'nome', t.nome, 'total', t.total)
         order by t.total desc, t.nome), '[]'::jsonb)
  into v_por_responsavel
  from (
    select os.responsavel_id, coalesce(u.nome, 'Sem responsável') as nome, count(*) as total
    from public.ordens_servico os
    left join public.usuarios u on u.id = os.responsavel_id and u.loja_id = v_loja
    where os.loja_id = v_loja and os.criado_em >= p_inicio and os.criado_em < p_fim
    group by os.responsavel_id, u.nome
    order by count(*) desc
    limit 50
  ) t;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                  'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
    'cards', v_cards,
    'os_por_status', v_por_status,
    'os_por_periodo', v_por_periodo,
    'os_por_responsavel', v_por_responsavel,
    'os_por_prioridade', null
  );
end;
$$;

create or replace function public.dashboard_atividade(p_limite int default 15)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_limite, 15), 1), 50);
  v_ver_os boolean;
  v_ver_clientes boolean;
  v_ver_tecnicos boolean;
  v_ver_equipamentos boolean;
  v_ver_equipe boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_permissao('dashboard.view') then
    raise exception 'Acesso negado ao dashboard.' using errcode = '42501';
  end if;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');
  v_ver_tecnicos := public.tem_feature('technicians') and public.tem_permissao('technicians.view');
  v_ver_equipamentos := public.tem_feature('assets') and public.tem_permissao('assets.view');
  v_ver_equipe := public.tem_permissao('team.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'acao', t.acao,
           'criado_em', t.criado_em,
           'usuario', t.usuario_nome,
           'os', case when t.os_id is null then null
                      else jsonb_build_object('id', t.os_id, 'cliente', t.os_cliente) end,
           'status_novo', t.status_novo,
           'cliente', t.cliente_nome,
           'cliente_id', t.cliente_id,
           'tecnico', t.tecnico_nome,
           'equipamento', t.equipamento_nome,
           'equipamento_id', t.equipamento_id,
           'funcionario', t.funcionario_nome)
         order by t.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      e.id, e.acao, e.criado_em,
      u.nome as usuario_nome,
      os.id as os_id,
      cos.nome as os_cliente,
      st.nome as status_novo,
      cli.id as cliente_id,
      cli.nome as cliente_nome,
      nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), '') as tecnico_nome,
      eq.id as equipamento_id,
      eq.nome as equipamento_nome,
      fu.nome as funcionario_nome
    from public.log_eventos e
    left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
    left join public.ordens_servico os on os.id::text = e.detalhes->>'os_id' and os.loja_id = v_loja
    left join public.clientes cos on cos.id = os.cliente_id and cos.loja_id = v_loja
    left join public.status_os st on st.id::text = e.detalhes->>'para' and st.loja_id = v_loja
    left join public.clientes cli on cli.id::text = e.detalhes->>'cliente_id' and cli.loja_id = v_loja
    left join public.tecnicos tec on tec.id::text = e.detalhes->>'tecnico_id' and tec.loja_id = v_loja
    left join public.equipamentos eq on eq.id::text = e.detalhes->>'equipamento_id' and eq.loja_id = v_loja
    left join public.usuarios fu on fu.id::text = e.detalhes->>'funcionario_id' and fu.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        (e.acao like 'os\_%' and v_ver_os)
        or (e.acao = 'cliente_cadastrado' and v_ver_clientes)
        or (e.acao = 'tecnico_cadastrado' and v_ver_tecnicos)
        or (e.acao = 'equipamento_cadastrado' and v_ver_equipamentos)
        or (e.acao like 'funcionario\_%' and v_ver_equipe)
      )
      and not (
        e.acao = 'os_status_alterado'
        and exists (
          select 1 from public.log_eventos e2
          where e2.loja_id = v_loja
            and e2.acao in ('os_reparo_iniciado', 'os_concluida')
            and e2.detalhes->>'os_id' = e.detalhes->>'os_id'
            and e2.usuario_id is not distinct from e.usuario_id
            and e2.criado_em between e.criado_em and e.criado_em + interval '10 seconds'
        )
      )
    order by e.criado_em desc
    limit v_limite
  ) t;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.trg_catalogo_simples_regras() from public, anon, authenticated;
revoke execute on function public.trg_equipamentos_normalizar() from public, anon, authenticated;
revoke execute on function public.trg_equipamentos_regras() from public, anon, authenticated;
revoke execute on function public.trg_equipamentos_log() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_equipamento_ativo() from public, anon, authenticated;
-- o DEFAULT da coluna é avaliado com o papel de quem insere; a função só gera texto aleatório
revoke execute on function public.gerar_codigo_publico() from public, anon;
grant execute on function public.gerar_codigo_publico() to authenticated;

revoke execute on function public.listar_equipamentos(text, text, public.status_equipamento, uuid, uuid, text, integer, integer) from public, anon;
revoke execute on function public.equipamento_historico(uuid, int) from public, anon;
revoke execute on function public.equipamento_por_codigo(text) from public, anon;
revoke execute on function public.regenerar_codigo_equipamento(uuid) from public, anon;
grant execute on function public.listar_equipamentos(text, text, public.status_equipamento, uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.equipamento_historico(uuid, int) to authenticated;
grant execute on function public.equipamento_por_codigo(text) to authenticated;
grant execute on function public.regenerar_codigo_equipamento(uuid) to authenticated;
