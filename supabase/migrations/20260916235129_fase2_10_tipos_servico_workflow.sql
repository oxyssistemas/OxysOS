-- =====================================================================
-- Fase 2 · 10 — Tipos de serviço + workflow de OS
--
-- * status_os (existente) vira o workflow configurável: chave estável,
--   ativo, status inicial, cor obrigatória. Os nomes são livres; as regras
--   do sistema usam só a categoria interna (aberto, agendado, em_andamento,
--   pausado, finalizado_sucesso, finalizado_cancelado).
-- * prioridades_os: configuráveis, com nível interno (baixa..urgente) e
--   uma prioridade padrão.
-- * tipos_servico: cadastro livre da empresa (instalação, manutenção...).
-- * ordens_servico ganha prioridade_id (obrigatória) e tipo_servico_id.
-- * Status da OS só muda por alterar_status_os(): permissão conforme a
--   categoria (finalizar/cancelar), histórico e evento gravados pelo banco.
-- * Empresas novas recebem o workflow e as prioridades padrão.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Utilitário: chave estável a partir de um nome
-- ---------------------------------------------------------------------
create or replace function public.gerar_chave_config(p_texto text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select left(case when t.s ~ '^[a-z]' then t.s else 'x_' || t.s end, 40)
  from (
    select nullif(btrim(regexp_replace(public.normalizar_busca(p_texto), '[^a-z0-9]+', '_', 'g'), '_'), '') as s
  ) t;
$$;

-- ---------------------------------------------------------------------
-- 2. Status (workflow)
-- ---------------------------------------------------------------------
alter table public.status_os
  add column chave text,
  add column ativo boolean not null default true,
  add column inicial boolean not null default false,
  add column atualizado_em timestamptz not null default now();

update public.status_os set cor = '#378ADD' where cor is null or cor !~ '^#[0-9A-Fa-f]{6}$';
update public.status_os set cor = upper(cor);

-- status existentes assumem a chave padrão da sua categoria (mantendo o nome
-- que a empresa escolheu); os demais recebem uma chave derivada do nome
do $$
declare
  r record;
  v_base text;
  v_chave text;
  v_n int;
begin
  for r in select * from public.status_os order by loja_id, ordem, criado_em loop
    v_chave := case r.categoria
      when 'aberto' then 'nova'
      when 'agendado' then 'agendada'
      when 'em_andamento' then 'em_atendimento'
      when 'pausado' then 'pausada'
      when 'finalizado_sucesso' then 'finalizada'
      when 'finalizado_cancelado' then 'cancelada'
    end;
    if exists (select 1 from public.status_os where loja_id = r.loja_id and chave = v_chave) then
      v_base := coalesce(public.gerar_chave_config(r.nome), 'status');
      v_chave := v_base;
      v_n := 1;
      while exists (select 1 from public.status_os where loja_id = r.loja_id and chave = v_chave) loop
        v_n := v_n + 1;
        v_chave := left(v_base, 36) || '_' || v_n;
      end loop;
    end if;
    update public.status_os set chave = v_chave where id = r.id;
  end loop;
end $$;

alter table public.status_os
  alter column chave set not null,
  alter column cor set not null,
  alter column cor set default '#378ADD',
  add constraint status_os_loja_chave_key unique (loja_id, chave),
  add constraint status_os_chave_formato check (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  add constraint status_os_nome_tamanho check (length(btrim(nome)) between 1 and 40),
  add constraint status_os_cor_formato check (cor ~ '^#[0-9A-F]{6}$'),
  add constraint status_os_inicial_regras check (not inicial or (ativo and categoria = 'aberto'));

create unique index status_os_loja_nome_key on public.status_os(loja_id, public.normalizar_busca(nome));
create unique index status_os_um_inicial on public.status_os(loja_id) where inicial;

create or replace function public.trg_status_os_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_n int := 1;
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  new.cor := upper(btrim(coalesce(new.cor, '#378ADD')));

  if tg_op = 'INSERT' then
    new.chave := nullif(btrim(coalesce(new.chave, '')), '');
    if new.chave is null then
      v_base := coalesce(public.gerar_chave_config(new.nome), 'status');
      new.chave := v_base;
      while exists (select 1 from public.status_os where loja_id = new.loja_id and chave = new.chave) loop
        v_n := v_n + 1;
        new.chave := left(v_base, 36) || '_' || v_n;
      end loop;
    end if;
    if coalesce(new.ordem, 0) <= 0 then
      select coalesce(max(ordem), 0) + 1 into new.ordem from public.status_os where loja_id = new.loja_id;
    end if;
    new.criado_em := now();
    new.atualizado_em := now();
    return new;
  end if;

  if new.id <> old.id or new.loja_id <> old.loja_id or new.chave <> old.chave then
    raise exception 'A chave do status não pode ser alterada.' using errcode = '42501';
  end if;
  new.criado_em := old.criado_em;

  if new.categoria <> old.categoria and (
       exists (select 1 from public.ordens_servico where status_id = old.id)
       or exists (select 1 from public.os_historico where status_novo_id = old.id or status_anterior_id = old.id)
     ) then
    raise exception 'Este status já foi usado em ordens de serviço: a categoria não pode mudar. Crie um novo status.'
      using errcode = '23514';
  end if;

  if old.inicial and not new.inicial
     and coalesce(current_setting('oxys.trocar_status_inicial', true), '') <> 'on' then
    raise exception 'Defina outro status como inicial antes de alterar este.' using errcode = '23514';
  end if;

  -- as ações do sistema (iniciar, finalizar, cancelar) precisam dessas categorias
  if ((old.ativo and not new.ativo) or new.categoria <> old.categoria)
     and old.categoria in ('aberto', 'em_andamento', 'finalizado_sucesso', 'finalizado_cancelado')
     and not exists (
       select 1 from public.status_os
       where loja_id = old.loja_id and id <> old.id and ativo and categoria = old.categoria
     ) then
    raise exception 'A empresa precisa de ao menos um status ativo nesta categoria.' using errcode = '23514';
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

create trigger status_os_regras
  before insert or update on public.status_os
  for each row execute function public.trg_status_os_regras();

create or replace function public.trg_status_os_exclusao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- exclusão da empresa inteira (Super Admin): nada a proteger
  if not exists (select 1 from public.lojas where id = old.loja_id) then
    return old;
  end if;
  if old.inicial then
    raise exception 'O status inicial não pode ser excluído.' using errcode = '23514';
  end if;
  if old.ativo
     and old.categoria in ('aberto', 'em_andamento', 'finalizado_sucesso', 'finalizado_cancelado')
     and not exists (
       select 1 from public.status_os
       where loja_id = old.loja_id and id <> old.id and ativo and categoria = old.categoria
     ) then
    raise exception 'A empresa precisa de ao menos um status ativo nesta categoria.' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger status_os_exclusao
  before delete on public.status_os
  for each row execute function public.trg_status_os_exclusao();

-- ---------------------------------------------------------------------
-- 3. Prioridades
-- ---------------------------------------------------------------------
create type public.nivel_prioridade as enum ('baixa', 'normal', 'alta', 'urgente');

create table public.prioridades_os (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  chave text not null,
  nome text not null,
  nivel public.nivel_prioridade not null,
  cor text not null default '#378ADD',
  ordem int not null default 0,
  padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint prioridades_os_loja_id_id_key unique (loja_id, id),
  constraint prioridades_os_loja_chave_key unique (loja_id, chave),
  constraint prioridades_os_chave_formato check (chave ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint prioridades_os_nome_tamanho check (length(btrim(nome)) between 1 and 30),
  constraint prioridades_os_cor_formato check (cor ~ '^#[0-9A-F]{6}$'),
  constraint prioridades_os_padrao_ativa check (not padrao or ativo)
);

create unique index prioridades_os_loja_nome_key on public.prioridades_os(loja_id, public.normalizar_busca(nome));
create unique index prioridades_os_uma_padrao on public.prioridades_os(loja_id) where padrao;

create or replace function public.trg_prioridades_os_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_n int := 1;
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  new.cor := upper(btrim(coalesce(new.cor, '#378ADD')));

  if tg_op = 'INSERT' then
    new.chave := nullif(btrim(coalesce(new.chave, '')), '');
    if new.chave is null then
      v_base := coalesce(public.gerar_chave_config(new.nome), 'prioridade');
      new.chave := v_base;
      while exists (select 1 from public.prioridades_os where loja_id = new.loja_id and chave = new.chave) loop
        v_n := v_n + 1;
        new.chave := left(v_base, 36) || '_' || v_n;
      end loop;
    end if;
    if coalesce(new.ordem, 0) <= 0 then
      select coalesce(max(ordem), 0) + 1 into new.ordem from public.prioridades_os where loja_id = new.loja_id;
    end if;
    new.criado_em := now();
    new.atualizado_em := now();
    return new;
  end if;

  if new.id <> old.id or new.loja_id <> old.loja_id or new.chave <> old.chave then
    raise exception 'A chave da prioridade não pode ser alterada.' using errcode = '42501';
  end if;
  new.criado_em := old.criado_em;

  if new.nivel <> old.nivel and exists (select 1 from public.ordens_servico where prioridade_id = old.id) then
    raise exception 'Esta prioridade já foi usada em ordens de serviço: o nível não pode mudar. Crie uma nova prioridade.'
      using errcode = '23514';
  end if;

  if old.padrao and not new.padrao
     and coalesce(current_setting('oxys.trocar_prioridade_padrao', true), '') <> 'on' then
    raise exception 'Defina outra prioridade como padrão antes de alterar esta.' using errcode = '23514';
  end if;

  new.atualizado_em := now();
  return new;
end;
$$;

create trigger prioridades_os_regras
  before insert or update on public.prioridades_os
  for each row execute function public.trg_prioridades_os_regras();

create or replace function public.trg_prioridades_os_exclusao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.lojas where id = old.loja_id) then
    return old;
  end if;
  if old.padrao then
    raise exception 'A prioridade padrão não pode ser excluída.' using errcode = '23514';
  end if;
  return old;
end;
$$;

create trigger prioridades_os_exclusao
  before delete on public.prioridades_os
  for each row execute function public.trg_prioridades_os_exclusao();

-- ---------------------------------------------------------------------
-- 4. Tipos de serviço
-- ---------------------------------------------------------------------
create table public.tipos_servico (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  descricao text,
  -- sugestão ao abrir a OS (ex.: Instalação → externo); a OS pode mudar
  local_atendimento_padrao public.local_atendimento_os,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint tipos_servico_loja_id_id_key unique (loja_id, id),
  constraint tipos_servico_nome_tamanho check (length(btrim(nome)) between 1 and 60),
  constraint tipos_servico_descricao_tamanho check (descricao is null or length(descricao) <= 300)
);

create unique index tipos_servico_loja_nome_key on public.tipos_servico(loja_id, public.normalizar_busca(nome));

create or replace function public.trg_tipos_servico_regras()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.loja_id <> old.loja_id then
      raise exception 'Alteração não permitida.' using errcode = '42501';
    end if;
    new.criado_em := old.criado_em;
  else
    new.criado_em := now();
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger tipos_servico_regras
  before insert or update on public.tipos_servico
  for each row execute function public.trg_tipos_servico_regras();

-- ---------------------------------------------------------------------
-- 5. Auditoria das configurações
-- ---------------------------------------------------------------------
create or replace function public.trg_config_os_auditoria()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid;
  v_id uuid;
  v_nome text;
  v_tipo text;
  v_campos text[];
begin
  if coalesce(current_setting('oxys.config_os_semente', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_loja := old.loja_id; v_id := old.id; v_nome := old.nome;
  else
    v_loja := new.loja_id; v_id := new.id; v_nome := new.nome;
  end if;
  if not exists (select 1 from public.lojas where id = v_loja) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    -- reordenação é auditada uma única vez pela função própria
    select array_agg(n.key order by n.key) into v_campos
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('atualizado_em', 'ordem');
    if v_campos is null then
      return null;
    end if;
  end if;

  v_tipo := case tg_table_name
    when 'status_os' then 'status_os'
    when 'prioridades_os' then 'prioridade_os'
    else 'tipo_servico'
  end;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (
    auth.uid(), v_loja,
    v_tipo || case tg_op when 'INSERT' then '_criado' when 'UPDATE' then '_alterado' else '_excluido' end,
    v_tipo, v_id,
    jsonb_build_object('nome', v_nome)
      || case when v_campos is null then '{}'::jsonb else jsonb_build_object('campos', v_campos) end
  );
  return null;
end;
$$;

create trigger status_os_auditoria
  after insert or update or delete on public.status_os
  for each row execute function public.trg_config_os_auditoria();
create trigger prioridades_os_auditoria
  after insert or update or delete on public.prioridades_os
  for each row execute function public.trg_config_os_auditoria();
create trigger tipos_servico_auditoria
  after insert or update or delete on public.tipos_servico
  for each row execute function public.trg_config_os_auditoria();

-- ---------------------------------------------------------------------
-- 6. Configuração padrão (empresas existentes e novas)
-- ---------------------------------------------------------------------
create or replace function public.criar_workflow_os_padrao(p_loja_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('oxys.config_os_semente', 'on', true);

  insert into public.status_os (loja_id, chave, nome, categoria, cor, ordem)
  select p_loja_id, d.chave, d.nome, d.categoria::public.categoria_status, d.cor, d.ordem
  from (values
    ('nova',                 'Nova',                 'aberto',               '#378ADD', 1),
    ('triagem',              'Triagem',              'aberto',               '#7F77DD', 2),
    ('aguardando_orcamento', 'Aguardando orçamento', 'aberto',               '#D4537E', 3),
    ('aguardando_aprovacao', 'Aguardando aprovação', 'aberto',               '#BA7517', 4),
    ('agendada',             'Agendada',             'agendado',             '#1D9E75', 5),
    ('em_deslocamento',      'Em deslocamento',      'em_andamento',         '#5DCAA5', 6),
    ('em_atendimento',       'Em atendimento',       'em_andamento',         '#EF9F27', 7),
    ('pausada',              'Pausada',              'pausado',              '#888780', 8),
    ('aguardando_peca',      'Aguardando peça',      'pausado',              '#B4B2A9', 9),
    ('finalizada',           'Finalizada',           'finalizado_sucesso',   '#639922', 10),
    ('cancelada',            'Cancelada',            'finalizado_cancelado', '#E24B4A', 11)
  ) as d(chave, nome, categoria, cor, ordem)
  where not exists (
    select 1 from public.status_os s
    where s.loja_id = p_loja_id
      and (s.chave = d.chave or public.normalizar_busca(s.nome) = public.normalizar_busca(d.nome))
  );

  if not exists (select 1 from public.status_os where loja_id = p_loja_id and inicial) then
    update public.status_os set inicial = true
    where id = (
      select id from public.status_os
      where loja_id = p_loja_id and ativo and categoria = 'aberto'
      order by (chave = 'nova') desc, ordem, criado_em
      limit 1
    );
  end if;

  insert into public.prioridades_os (loja_id, chave, nome, nivel, cor, ordem, padrao)
  select p_loja_id, d.chave, d.nome, d.nivel::public.nivel_prioridade, d.cor, d.ordem, d.padrao
  from (values
    ('baixa',   'Baixa',   'baixa',   '#888780', 1, false),
    ('normal',  'Normal',  'normal',  '#378ADD', 2, true),
    ('alta',    'Alta',    'alta',    '#EF9F27', 3, false),
    ('urgente', 'Urgente', 'urgente', '#E24B4A', 4, false)
  ) as d(chave, nome, nivel, cor, ordem, padrao)
  where not exists (select 1 from public.prioridades_os p where p.loja_id = p_loja_id)
    -- idempotente: só cria o conjunto padrão se a empresa ainda não tem prioridades
  ;

  perform set_config('oxys.config_os_semente', 'off', true);
end;
$$;

create or replace function public.trg_lojas_criar_workflow_os_padrao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.criar_workflow_os_padrao(new.id);
  return new;
end;
$$;

create trigger lojas_criar_workflow_os_padrao
  after insert on public.lojas
  for each row execute function public.trg_lojas_criar_workflow_os_padrao();

do $$
declare
  r record;
begin
  for r in select id from public.lojas loop
    perform public.criar_workflow_os_padrao(r.id);
  end loop;
end $$;

-- empresas existentes: padrões na ordem sugerida, status próprios depois
with padrao(chave, pos) as (
  values ('nova', 1), ('triagem', 2), ('aguardando_orcamento', 3), ('aguardando_aprovacao', 4), ('agendada', 5),
         ('em_deslocamento', 6), ('em_atendimento', 7), ('pausada', 8), ('aguardando_peca', 9),
         ('finalizada', 10), ('cancelada', 11)
),
numerado as (
  select s.id, row_number() over (partition by s.loja_id order by coalesce(p.pos, 100), s.ordem, s.criado_em) as pos
  from public.status_os s
  left join padrao p on p.chave = s.chave
)
update public.status_os s set ordem = n.pos
from numerado n
where n.id = s.id and s.ordem <> n.pos;

-- ---------------------------------------------------------------------
-- 7. Classificação da OS
-- ---------------------------------------------------------------------
alter table public.ordens_servico
  add column prioridade_id uuid,
  add column tipo_servico_id uuid;

update public.ordens_servico os
   set prioridade_id = p.id
  from public.prioridades_os p
 where p.loja_id = os.loja_id and p.padrao and os.prioridade_id is null;

alter table public.ordens_servico
  alter column prioridade_id set not null,
  add constraint ordens_servico_prioridade_mesma_loja_fkey
    foreign key (loja_id, prioridade_id) references public.prioridades_os(loja_id, id),
  add constraint ordens_servico_tipo_servico_mesma_loja_fkey
    foreign key (loja_id, tipo_servico_id) references public.tipos_servico(loja_id, id);

create index idx_os_loja_prioridade on public.ordens_servico(loja_id, prioridade_id);
create index idx_os_loja_tipo_servico on public.ordens_servico(loja_id, tipo_servico_id);

create or replace function public.trg_ordens_servico_workflow()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_categoria public.categoria_status;
  v_ativo boolean;
begin
  if tg_op = 'INSERT' then
    if new.status_id is null then
      select id into new.status_id from public.status_os where loja_id = new.loja_id and inicial;
    end if;
    if new.prioridade_id is null then
      select id into new.prioridade_id from public.prioridades_os where loja_id = new.loja_id and padrao;
    end if;
  end if;

  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    if tg_op = 'UPDATE' and auth.uid() is not null
       and coalesce(current_setting('oxys.alterar_status_os', true), '') <> 'on' then
      raise exception 'Use a ação "Alterar status" para mudar o status da OS.' using errcode = '42501';
    end if;
    select categoria, ativo into v_categoria, v_ativo
    from public.status_os where id = new.status_id and loja_id = new.loja_id;
    if found and not v_ativo then
      raise exception 'Este status está desativado.' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
      raise exception 'Uma OS nova não pode começar finalizada ou cancelada.' using errcode = '23514';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.prioridade_id is distinct from old.prioridade_id)
     and exists (select 1 from public.prioridades_os where id = new.prioridade_id and not ativo) then
    raise exception 'Esta prioridade está desativada.' using errcode = '23514';
  end if;

  if new.tipo_servico_id is not null
     and (tg_op = 'INSERT' or new.tipo_servico_id is distinct from old.tipo_servico_id)
     and exists (select 1 from public.tipos_servico where id = new.tipo_servico_id and not ativo) then
    raise exception 'Este tipo de serviço está desativado.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ordens_servico_workflow
  before insert or update on public.ordens_servico
  for each row execute function public.trg_ordens_servico_workflow();

create or replace function public.trg_ordens_servico_log_classificacao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.prioridade_id is distinct from old.prioridade_id then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'os_prioridade_alterada',
            jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id,
                               'de', old.prioridade_id, 'para', new.prioridade_id));
  end if;
  if new.tipo_servico_id is distinct from old.tipo_servico_id then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'os_tipo_servico_alterado',
            jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id,
                               'de', old.tipo_servico_id, 'para', new.tipo_servico_id));
  end if;
  return null;
end;
$$;

create trigger ordens_servico_log_classificacao
  after update of prioridade_id, tipo_servico_id on public.ordens_servico
  for each row execute function public.trg_ordens_servico_log_classificacao();

-- ---------------------------------------------------------------------
-- 8. Alterar status da OS (única via)
-- ---------------------------------------------------------------------
create or replace function public.alterar_status_os(p_os_id uuid, p_status_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_status_atual uuid;
  v_de record;
  v_para record;
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

  perform set_config('oxys.alterar_status_os', 'on', true);
  update public.ordens_servico
     set status_id = v_para.id,
         atualizado_em = now(),
         iniciado_em = case when v_para.categoria = 'em_andamento' then coalesce(iniciado_em, now()) else iniciado_em end
   where id = p_os_id;
  perform set_config('oxys.alterar_status_os', 'off', true);

  insert into public.os_historico (os_id, usuario_id, status_anterior_id, status_novo_id)
  values (p_os_id, v_uid, v_de.id, v_para.id);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, v_uid, 'os_status_alterado', jsonb_build_object('os_id', p_os_id, 'de', v_de.id, 'para', v_para.id));

  return jsonb_build_object('os_id', p_os_id, 'status_id', v_para.id, 'categoria', v_para.categoria, 'alterado', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Funções de configuração
-- ---------------------------------------------------------------------
create or replace function public.reordenar_status_os(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_total int;
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  select count(*) into v_total from public.status_os where loja_id = v_loja;
  if p_ids is null
     or cardinality(p_ids) <> v_total
     or (select count(distinct x) from unnest(p_ids) x) <> v_total
     or exists (select 1 from unnest(p_ids) x where not exists (
          select 1 from public.status_os s where s.id = x and s.loja_id = v_loja)) then
    raise exception 'A lista de status mudou. Recarregue a página.' using errcode = '40001';
  end if;

  update public.status_os s
     set ordem = t.pos
    from unnest(p_ids) with ordinality as t(id, pos)
   where s.id = t.id and s.loja_id = v_loja and s.ordem <> t.pos;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'status_os_reordenados', 'status_os', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;

create or replace function public.reordenar_prioridades_os(p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_total int;
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  select count(*) into v_total from public.prioridades_os where loja_id = v_loja;
  if p_ids is null
     or cardinality(p_ids) <> v_total
     or (select count(distinct x) from unnest(p_ids) x) <> v_total
     or exists (select 1 from unnest(p_ids) x where not exists (
          select 1 from public.prioridades_os p where p.id = x and p.loja_id = v_loja)) then
    raise exception 'A lista de prioridades mudou. Recarregue a página.' using errcode = '40001';
  end if;

  update public.prioridades_os p
     set ordem = t.pos
    from unnest(p_ids) with ordinality as t(id, pos)
   where p.id = t.id and p.loja_id = v_loja and p.ordem <> t.pos;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'prioridades_os_reordenadas', 'prioridade_os', null, jsonb_build_object('ordem', to_jsonb(p_ids)));
end;
$$;

create or replace function public.definir_status_inicial(p_status_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  perform 1 from public.status_os
  where id = p_status_id and loja_id = v_loja and ativo and categoria = 'aberto'
  for update;
  if not found then
    raise exception 'O status inicial precisa ser um status ativo da categoria Aberta.' using errcode = '23514';
  end if;

  perform set_config('oxys.trocar_status_inicial', 'on', true);
  update public.status_os set inicial = false where loja_id = v_loja and inicial and id <> p_status_id;
  update public.status_os set inicial = true where id = p_status_id and not inicial;
  perform set_config('oxys.trocar_status_inicial', 'off', true);
end;
$$;

create or replace function public.definir_prioridade_padrao(p_prioridade_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para alterar as configurações.' using errcode = '42501';
  end if;
  perform 1 from public.prioridades_os
  where id = p_prioridade_id and loja_id = v_loja and ativo
  for update;
  if not found then
    raise exception 'A prioridade padrão precisa estar ativa.' using errcode = '23514';
  end if;

  perform set_config('oxys.trocar_prioridade_padrao', 'on', true);
  update public.prioridades_os set padrao = false where loja_id = v_loja and padrao and id <> p_prioridade_id;
  update public.prioridades_os set padrao = true where id = p_prioridade_id and not padrao;
  perform set_config('oxys.trocar_prioridade_padrao', 'off', true);
end;
$$;

-- Quantas OS usam cada status/prioridade/tipo (decide entre excluir e desativar)
create or replace function public.uso_configuracao_os()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_permissao('settings.manage') then
    raise exception 'Sem permissão para acessar as configurações.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'status', (
      select coalesce(jsonb_object_agg(t.id, t.total), '{}'::jsonb)
      from (
        select s.id,
               (select count(*) from public.ordens_servico os where os.status_id = s.id)
               + (select count(*) from public.os_historico h
                  where h.status_novo_id = s.id or h.status_anterior_id = s.id) as total
        from public.status_os s where s.loja_id = v_loja
      ) t
    ),
    'status_os_atuais', (
      select coalesce(jsonb_object_agg(t.status_id, t.total), '{}'::jsonb)
      from (select status_id, count(*) as total from public.ordens_servico where loja_id = v_loja group by status_id) t
    ),
    'prioridades', (
      select coalesce(jsonb_object_agg(t.prioridade_id, t.total), '{}'::jsonb)
      from (select prioridade_id, count(*) as total from public.ordens_servico where loja_id = v_loja group by prioridade_id) t
    ),
    'tipos', (
      select coalesce(jsonb_object_agg(t.tipo_servico_id, t.total), '{}'::jsonb)
      from (
        select tipo_servico_id, count(*) as total from public.ordens_servico
        where loja_id = v_loja and tipo_servico_id is not null group by tipo_servico_id
      ) t
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
drop policy status_os_insert on public.status_os;
drop policy status_os_update on public.status_os;
drop policy status_os_delete on public.status_os;

create policy status_os_insert on public.status_os for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')));
create policy status_os_update on public.status_os for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')))
  with check (loja_id = (select public.loja_operacional_id()));
create policy status_os_delete on public.status_os for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')));

alter table public.prioridades_os enable row level security;
create policy prioridades_os_select on public.prioridades_os for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy prioridades_os_insert on public.prioridades_os for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')));
create policy prioridades_os_update on public.prioridades_os for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')))
  with check (loja_id = (select public.loja_operacional_id()));
create policy prioridades_os_delete on public.prioridades_os for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')));

alter table public.tipos_servico enable row level security;
create policy tipos_servico_select on public.tipos_servico for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy tipos_servico_insert on public.tipos_servico for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')));
create policy tipos_servico_update on public.tipos_servico for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')))
  with check (loja_id = (select public.loja_operacional_id()));
create policy tipos_servico_delete on public.tipos_servico for delete to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('settings.manage')));

-- ---------------------------------------------------------------------
-- 11. Dashboard: OS agendadas e OS por prioridade
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
  v_por_prioridade jsonb;
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
    'os_abertas', null, 'os_agendadas', null, 'os_em_andamento', null, 'os_pausadas', null,
    'os_criadas_periodo', null, 'os_finalizadas_periodo', null,
    'clientes_total', null, 'clientes_novos_periodo', null,
    'tecnicos_ativos', null, 'equipamentos', null,
    'os_atrasadas', null, 'faturamento_periodo', null
  );

  if v_ver_os then
    select v_cards || jsonb_build_object(
      'os_abertas', count(*) filter (where s.categoria = 'aberto'),
      'os_agendadas', count(*) filter (where s.categoria = 'agendado'),
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
    having s.ativo or count(os.id) > 0
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nome', t.nome, 'cor', t.cor, 'nivel', t.nivel, 'total', t.total)
         order by t.ordem, t.nome), '[]'::jsonb)
  into v_por_prioridade
  from (
    select p.id, p.nome, p.cor, p.nivel, p.ordem, count(os.id) as total
    from public.prioridades_os p
    left join public.ordens_servico os
      on os.prioridade_id = p.id and os.loja_id = v_loja
     and os.criado_em >= p_inicio and os.criado_em < p_fim
    where p.loja_id = v_loja
    group by p.id
    having p.ativo or count(os.id) > 0
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
    'os_por_prioridade', v_por_prioridade
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.trg_status_os_regras() from public, anon, authenticated;
revoke execute on function public.trg_status_os_exclusao() from public, anon, authenticated;
revoke execute on function public.trg_prioridades_os_regras() from public, anon, authenticated;
revoke execute on function public.trg_prioridades_os_exclusao() from public, anon, authenticated;
revoke execute on function public.trg_tipos_servico_regras() from public, anon, authenticated;
revoke execute on function public.trg_config_os_auditoria() from public, anon, authenticated;
revoke execute on function public.trg_lojas_criar_workflow_os_padrao() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_workflow() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_log_classificacao() from public, anon, authenticated;
revoke execute on function public.criar_workflow_os_padrao(uuid) from public, anon, authenticated;

revoke execute on function public.alterar_status_os(uuid, uuid) from public, anon;
revoke execute on function public.reordenar_status_os(uuid[]) from public, anon;
revoke execute on function public.reordenar_prioridades_os(uuid[]) from public, anon;
revoke execute on function public.definir_status_inicial(uuid) from public, anon;
revoke execute on function public.definir_prioridade_padrao(uuid) from public, anon;
revoke execute on function public.uso_configuracao_os() from public, anon;
grant execute on function public.alterar_status_os(uuid, uuid) to authenticated;
grant execute on function public.reordenar_status_os(uuid[]) to authenticated;
grant execute on function public.reordenar_prioridades_os(uuid[]) to authenticated;
grant execute on function public.definir_status_inicial(uuid) to authenticated;
grant execute on function public.definir_prioridade_padrao(uuid) to authenticated;
grant execute on function public.uso_configuracao_os() to authenticated;
