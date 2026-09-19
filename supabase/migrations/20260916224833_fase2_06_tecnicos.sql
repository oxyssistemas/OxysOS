-- =====================================================================
-- Fase 2 · 06 · Módulo de Técnicos
--
-- 1. especialidades (configuráveis por empresa)
-- 2. tecnicos (ativar/desativar, nunca excluir; vínculo opcional com usuário
--    da equipe para o futuro Portal Técnico; versão para concorrência)
-- 3. tecnico_especialidades (N:N com FKs compostas de tenant)
-- 4. ordens_servico.tecnico_id (preparado para o módulo de OS; técnico
--    inativo não pode ser atribuído)
-- 5. RLS: technicians.view / technicians.manage
-- 6. RPCs: salvar_tecnico (transacional + versão), listar_tecnicos
-- 7. Dashboard: card de técnicos ativos e evento "técnico cadastrado"
--
-- Preparação futura (não implementada): foto, região de atendimento,
-- horário, comissão, localização e estoque próprio serão tabelas próprias
-- referenciando tecnicos(loja_id, id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Especialidades
-- ---------------------------------------------------------------------
create table public.especialidades (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint especialidades_loja_id_id_key unique (loja_id, id),
  constraint especialidades_nome_tamanho check (length(btrim(nome)) between 1 and 60)
);

create unique index especialidades_loja_nome_key on public.especialidades(loja_id, public.normalizar_busca(nome));

create or replace function public.trg_especialidades_regras()
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

create trigger especialidades_regras
  before insert or update on public.especialidades
  for each row execute function public.trg_especialidades_regras();

-- ---------------------------------------------------------------------
-- 2. Técnicos
-- ---------------------------------------------------------------------
create table public.tecnicos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  usuario_id uuid,
  nome text not null,
  sobrenome text,
  email text,
  telefone text,
  documento text,
  observacoes text,
  ativo boolean not null default true,
  desativado_em timestamptz,
  desativado_por uuid references public.usuarios(id) on delete set null,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null,
  versao integer not null default 1,
  constraint tecnicos_loja_id_id_key unique (loja_id, id),
  constraint tecnicos_usuario_mesma_loja_fkey
    foreign key (loja_id, usuario_id) references public.usuarios(loja_id, id) on delete set null (usuario_id),
  constraint tecnicos_nome_tamanho check (length(btrim(nome)) between 1 and 100),
  constraint tecnicos_sobrenome_tamanho check (sobrenome is null or length(sobrenome) <= 100),
  constraint tecnicos_email_valido check (
    email is null or (length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  constraint tecnicos_telefone_valido check (
    telefone is null or regexp_replace(telefone, '\D', '', 'g') ~ '^\d{10,11}$'),
  constraint tecnicos_documento_valido check (documento is null or public.cpf_valido(documento)),
  constraint tecnicos_observacoes_tamanho check (observacoes is null or length(observacoes) <= 5000)
);

alter table public.tecnicos
  add column busca text generated always as (
    public.normalizar_busca(
      nome || ' ' || coalesce(sobrenome, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(documento, '') || ' ' || regexp_replace(coalesce(telefone, ''), '\D', '', 'g')
    )
  ) stored;

create unique index tecnicos_loja_usuario_key on public.tecnicos(loja_id, usuario_id) where usuario_id is not null;
create unique index tecnicos_loja_email_key on public.tecnicos(loja_id, email) where email is not null;
create unique index tecnicos_loja_documento_key on public.tecnicos(loja_id, documento) where documento is not null;
create index idx_tecnicos_loja_nome on public.tecnicos(loja_id, nome);
create index idx_tecnicos_busca_trgm on public.tecnicos using gin (busca extensions.gin_trgm_ops);

create or replace function public.trg_tecnicos_normalizar()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  new.sobrenome := nullif(btrim(regexp_replace(coalesce(new.sobrenome, ''), '\s+', ' ', 'g')), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.telefone := nullif(btrim(coalesce(new.telefone, '')), '');
  new.documento := nullif(regexp_replace(coalesce(new.documento, ''), '\D', '', 'g'), '');
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');
  return new;
end;
$$;

create trigger tecnicos_a_normalizar
  before insert or update on public.tecnicos
  for each row execute function public.trg_tecnicos_normalizar();

create or replace function public.trg_tecnicos_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then new.criado_por := v_uid; end if;
    new.atualizado_por := new.criado_por;
    new.atualizado_em := now();
    new.ativo := true;
    new.desativado_em := null;
    new.desativado_por := null;
    new.versao := 1;
    return new;
  end if;

  if new.id <> old.id or new.loja_id <> old.loja_id or new.criado_em <> old.criado_em
     or new.criado_por is distinct from old.criado_por then
    raise exception 'Alteração não permitida.' using errcode = '42501';
  end if;

  if new.ativo <> old.ativo then
    new.desativado_em := case when new.ativo then null else now() end;
    new.desativado_por := case when new.ativo then null else v_uid end;
  else
    new.desativado_em := old.desativado_em;
    new.desativado_por := old.desativado_por;
  end if;

  new.versao := old.versao + 1;
  new.atualizado_em := now();
  new.atualizado_por := v_uid;
  return new;
end;
$$;

create trigger tecnicos_b_regras
  before insert or update on public.tecnicos
  for each row execute function public.trg_tecnicos_regras();

create or replace function public.trg_tecnicos_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'tecnico_cadastrado', jsonb_build_object('tecnico_id', new.id));
    return null;
  end if;

  if new.ativo <> old.ativo then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), case when new.ativo then 'tecnico_reativado' else 'tecnico_desativado' end,
            jsonb_build_object('tecnico_id', new.id));
  end if;

  if new.nome is distinct from old.nome then v_campos := v_campos || 'nome'::text; end if;
  if new.sobrenome is distinct from old.sobrenome then v_campos := v_campos || 'sobrenome'::text; end if;
  if new.email is distinct from old.email then v_campos := v_campos || 'email'::text; end if;
  if new.telefone is distinct from old.telefone then v_campos := v_campos || 'telefone'::text; end if;
  if new.documento is distinct from old.documento then v_campos := v_campos || 'documento'::text; end if;
  if new.observacoes is distinct from old.observacoes then v_campos := v_campos || 'observacoes'::text; end if;
  if new.usuario_id is distinct from old.usuario_id then v_campos := v_campos || 'usuario'::text; end if;

  if cardinality(v_campos) > 0 then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'tecnico_atualizado', jsonb_build_object('tecnico_id', new.id, 'campos', v_campos));
  end if;
  return null;
end;
$$;

create trigger tecnicos_log
  after insert or update on public.tecnicos
  for each row execute function public.trg_tecnicos_log();

-- ---------------------------------------------------------------------
-- 3. Especialidades do técnico
-- ---------------------------------------------------------------------
create table public.tecnico_especialidades (
  loja_id uuid not null,
  tecnico_id uuid not null,
  especialidade_id uuid not null,
  criado_em timestamptz not null default now(),
  primary key (tecnico_id, especialidade_id),
  constraint tecnico_especialidades_tecnico_fkey
    foreign key (loja_id, tecnico_id) references public.tecnicos(loja_id, id) on delete cascade,
  constraint tecnico_especialidades_especialidade_fkey
    foreign key (loja_id, especialidade_id) references public.especialidades(loja_id, id) on delete restrict
);

create index idx_tecnico_especialidades_especialidade on public.tecnico_especialidades(loja_id, especialidade_id);

-- especialidade desativada continua nos técnicos que já a têm, mas não é atribuída a novos
create or replace function public.trg_tecnico_especialidades_ativa()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.especialidades where id = new.especialidade_id and ativo) then
    raise exception 'Especialidade inativa não pode ser atribuída.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tecnico_especialidades_ativa
  before insert on public.tecnico_especialidades
  for each row execute function public.trg_tecnico_especialidades_ativa();

-- ---------------------------------------------------------------------
-- 4. Técnico na OS (preparação para o módulo de Ordens de Serviço)
-- ---------------------------------------------------------------------
alter table public.ordens_servico add column tecnico_id uuid;
alter table public.ordens_servico
  add constraint ordens_servico_tecnico_mesma_loja_fkey
  foreign key (loja_id, tecnico_id) references public.tecnicos(loja_id, id) on delete set null (tecnico_id);
create index idx_os_loja_tecnico on public.ordens_servico(loja_id, tecnico_id);

create or replace function public.trg_ordens_servico_tecnico_ativo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tecnico_id is null or (tg_op = 'UPDATE' and new.tecnico_id is not distinct from old.tecnico_id) then
    return new;
  end if;
  if exists (select 1 from public.tecnicos where id = new.tecnico_id and not ativo) then
    raise exception 'Técnico inativo não pode ser atribuído a ordens de serviço.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ordens_servico_tecnico_ativo
  before insert or update of tecnico_id on public.ordens_servico
  for each row execute function public.trg_ordens_servico_tecnico_ativo();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
alter table public.especialidades enable row level security;
alter table public.tecnicos enable row level security;
alter table public.tecnico_especialidades enable row level security;

-- Leitura também para quem vê OS (a OS exibe o técnico)
create policy especialidades_select on public.especialidades for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and ((select public.tem_permissao('technicians.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy especialidades_insert on public.especialidades for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  );
create policy especialidades_update on public.especialidades for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  )
  with check (loja_id = (select public.loja_operacional_id()));
create policy especialidades_delete on public.especialidades for delete to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  );

create policy tecnicos_select on public.tecnicos for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and ((select public.tem_permissao('technicians.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy tecnicos_insert on public.tecnicos for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  );
create policy tecnicos_update on public.tecnicos for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  )
  with check (loja_id = (select public.loja_operacional_id()));
-- sem DELETE: técnicos são desativados

create policy tecnico_especialidades_select on public.tecnico_especialidades for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and ((select public.tem_permissao('technicians.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy tecnico_especialidades_insert on public.tecnico_especialidades for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  );
create policy tecnico_especialidades_delete on public.tecnico_especialidades for delete to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('technicians'))
    and (select public.tem_permissao('technicians.manage'))
  );

-- ---------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------
-- Cria ou atualiza técnico + especialidades na mesma transação (SECURITY INVOKER)
create or replace function public.salvar_tecnico(
  p_id uuid,
  p_versao integer,
  p_dados jsonb,
  p_especialidades uuid[]
)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_id uuid;
  v_antes uuid[];
  v_depois uuid[];
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.manage') then
    raise exception 'Sem permissão para gerenciar técnicos.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.tecnicos (loja_id, usuario_id, nome, sobrenome, email, telefone, documento, observacoes)
    values (
      v_loja,
      nullif(p_dados->>'usuario_id', '')::uuid,
      coalesce(p_dados->>'nome', ''),
      p_dados->>'sobrenome',
      p_dados->>'email',
      p_dados->>'telefone',
      p_dados->>'documento',
      p_dados->>'observacoes'
    )
    returning id into v_id;
  else
    update public.tecnicos
       set usuario_id = nullif(p_dados->>'usuario_id', '')::uuid,
           nome = coalesce(p_dados->>'nome', ''),
           sobrenome = p_dados->>'sobrenome',
           email = p_dados->>'email',
           telefone = p_dados->>'telefone',
           documento = p_dados->>'documento',
           observacoes = p_dados->>'observacoes'
     where id = p_id and versao = p_versao
    returning id into v_id;

    if v_id is null then
      if exists (select 1 from public.tecnicos where id = p_id) then
        raise exception 'Este técnico foi alterado por outra pessoa. Recarregue os dados antes de salvar novamente.'
          using errcode = '40001';
      end if;
      raise exception 'Técnico não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  if p_especialidades is not null then
    select coalesce(array_agg(especialidade_id order by especialidade_id), '{}')
      into v_antes from public.tecnico_especialidades where tecnico_id = v_id;

    delete from public.tecnico_especialidades
     where tecnico_id = v_id and not (especialidade_id = any (p_especialidades));

    insert into public.tecnico_especialidades (loja_id, tecnico_id, especialidade_id)
    select v_loja, v_id, e from unnest(p_especialidades) as e
    on conflict do nothing;

    select coalesce(array_agg(especialidade_id order by especialidade_id), '{}')
      into v_depois from public.tecnico_especialidades where tecnico_id = v_id;

    if p_id is not null and v_antes is distinct from v_depois then
      insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
      values (v_loja, auth.uid(), 'tecnico_atualizado',
              jsonb_build_object('tecnico_id', v_id, 'campos', array['especialidades']));
    end if;
  end if;

  return v_id;
end;
$$;

-- Lista paginada com especialidades e contagem de OS (a contagem não depende de o
-- usuário ter acesso às OS: é um indicador do próprio cadastro de técnicos)
create or replace function public.listar_tecnicos(
  p_busca text default null,
  p_status text default 'ativos',
  p_especialidade uuid default null,
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
  v_total bigint;
  v_itens jsonb;
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if v_termo is not null then
    v_padrao := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(x.item order by x.nome, x.id), '[]'::jsonb), coalesce(max(x.total), 0)
    into v_itens, v_total
  from (
    select
      t.id,
      t.nome,
      count(*) over () as total,
      jsonb_build_object(
        'id', t.id,
        'nome', t.nome,
        'sobrenome', t.sobrenome,
        'email', t.email,
        'telefone', t.telefone,
        'ativo', t.ativo,
        'usuario_id', t.usuario_id,
        'versao', t.versao,
        'especialidades', coalesce((
          select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'ativo', e.ativo) order by e.nome)
          from public.tecnico_especialidades te
          join public.especialidades e on e.id = te.especialidade_id and e.loja_id = v_loja
          where te.tecnico_id = t.id), '[]'::jsonb),
        'os_em_andamento', (
          select count(*) from public.ordens_servico os
          join public.status_os s on s.id = os.status_id
          where os.loja_id = v_loja and os.tecnico_id = t.id and s.categoria in ('em_andamento', 'pausado')),
        'os_concluidas', (
          select count(*) from public.ordens_servico os
          join public.status_os s on s.id = os.status_id
          where os.loja_id = v_loja and os.tecnico_id = t.id and s.categoria = 'finalizado_sucesso')
      ) as item
    from public.tecnicos t
    where t.loja_id = v_loja
      and (
        coalesce(p_status, 'ativos') = 'todos'
        or (coalesce(p_status, 'ativos') = 'ativos' and t.ativo)
        or (p_status = 'inativos' and not t.ativo)
      )
      and (v_padrao is null or t.busca like v_padrao)
      and (p_especialidade is null or exists (
        select 1 from public.tecnico_especialidades te
        where te.tecnico_id = t.id and te.especialidade_id = p_especialidade))
    order by t.nome, t.id
    limit v_limite offset v_offset
  ) x;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Dashboard: técnicos ativos e "técnico cadastrado"
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
    'tecnicos_ativos', null,
    'os_atrasadas', null, 'equipamentos', null, 'faturamento_periodo', null
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
  v_ver_equipe boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_permissao('dashboard.view') then
    raise exception 'Acesso negado ao dashboard.' using errcode = '42501';
  end if;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');
  v_ver_tecnicos := public.tem_feature('technicians') and public.tem_permissao('technicians.view');
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
      fu.nome as funcionario_nome
    from public.log_eventos e
    left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
    left join public.ordens_servico os on os.id::text = e.detalhes->>'os_id' and os.loja_id = v_loja
    left join public.clientes cos on cos.id = os.cliente_id and cos.loja_id = v_loja
    left join public.status_os st on st.id::text = e.detalhes->>'para' and st.loja_id = v_loja
    left join public.clientes cli on cli.id::text = e.detalhes->>'cliente_id' and cli.loja_id = v_loja
    left join public.tecnicos tec on tec.id::text = e.detalhes->>'tecnico_id' and tec.loja_id = v_loja
    left join public.usuarios fu on fu.id::text = e.detalhes->>'funcionario_id' and fu.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        (e.acao like 'os\_%' and v_ver_os)
        or (e.acao = 'cliente_cadastrado' and v_ver_clientes)
        or (e.acao = 'tecnico_cadastrado' and v_ver_tecnicos)
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

create index idx_log_eventos_loja_tecnico on public.log_eventos(loja_id, (detalhes->>'tecnico_id'));

-- ---------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.trg_especialidades_regras() from public, anon, authenticated;
revoke execute on function public.trg_tecnicos_normalizar() from public, anon, authenticated;
revoke execute on function public.trg_tecnicos_regras() from public, anon, authenticated;
revoke execute on function public.trg_tecnicos_log() from public, anon, authenticated;
revoke execute on function public.trg_tecnico_especialidades_ativa() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_tecnico_ativo() from public, anon, authenticated;

revoke execute on function public.salvar_tecnico(uuid, integer, jsonb, uuid[]) from public, anon;
revoke execute on function public.listar_tecnicos(text, text, uuid, integer, integer) from public, anon;
grant execute on function public.salvar_tecnico(uuid, integer, jsonb, uuid[]) to authenticated;
grant execute on function public.listar_tecnicos(text, text, uuid, integer, integer) to authenticated;
