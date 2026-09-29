-- =====================================================================
-- Fase 3 · 02 — Equipes técnicas e disponibilidade (etapa 3)
-- * equipes + membros (uma OS pode ir para um técnico OU uma equipe);
-- * jornada semanal do técnico e períodos de indisponibilidade;
-- * tecnico_disponivel_em(): base para os conflitos do agendamento.
-- Escrita só pelas funções abaixo; leitura para quem vê técnicos.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. Equipes
-- ---------------------------------------------------------------------
create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  descricao text,
  cor text not null default '#1565FF',
  ativo boolean not null default true,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null,
  constraint equipes_loja_id_id_key unique (loja_id, id),
  constraint equipes_loja_nome_key unique (loja_id, nome),
  constraint equipes_nome_tamanho check (length(btrim(nome)) between 2 and 60),
  constraint equipes_descricao_tamanho check (descricao is null or length(descricao) <= 200),
  constraint equipes_cor_formato check (cor ~ '^#[0-9A-F]{6}$')
);

create table public.equipe_membros (
  loja_id uuid not null,
  equipe_id uuid not null,
  tecnico_id uuid not null,
  lider boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (equipe_id, tecnico_id),
  constraint equipe_membros_equipe_fkey foreign key (loja_id, equipe_id)
    references public.equipes(loja_id, id) on delete cascade,
  constraint equipe_membros_tecnico_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete cascade
);

create index idx_equipe_membros_tecnico on public.equipe_membros(loja_id, tecnico_id);

-- OS pode ser atribuída a uma equipe (além do técnico responsável)
alter table public.ordens_servico
  add column equipe_id uuid,
  add constraint ordens_servico_equipe_fkey foreign key (loja_id, equipe_id)
    references public.equipes(loja_id, id) on delete restrict;

create index idx_os_loja_equipe on public.ordens_servico(loja_id, equipe_id) where equipe_id is not null;

-- ---------------------------------------------------------------------
-- 2. Disponibilidade
-- ---------------------------------------------------------------------
-- jornada semanal (0 = domingo)
create table public.tecnico_jornada (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null,
  tecnico_id uuid not null,
  dia_semana smallint not null,
  inicio time not null,
  fim time not null,
  criado_em timestamptz not null default now(),
  constraint tecnico_jornada_tecnico_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete cascade,
  constraint tecnico_jornada_dia_valido check (dia_semana between 0 and 6),
  constraint tecnico_jornada_intervalo check (fim > inicio),
  constraint tecnico_jornada_sem_repeticao unique (tecnico_id, dia_semana, inicio)
);

create index idx_tecnico_jornada_tecnico on public.tecnico_jornada(loja_id, tecnico_id, dia_semana);

create type public.motivo_indisponibilidade as enum ('folga', 'ferias', 'atestado', 'treinamento', 'bloqueio', 'outro');

create table public.tecnico_indisponibilidade (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null,
  tecnico_id uuid not null,
  motivo public.motivo_indisponibilidade not null default 'bloqueio',
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  constraint tecnico_indisponibilidade_tecnico_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete cascade,
  constraint tecnico_indisponibilidade_intervalo check (fim_em > inicio_em),
  constraint tecnico_indisponibilidade_observacao check (observacao is null or length(observacao) <= 300),
  -- o banco recusa dois períodos sobrepostos para o mesmo técnico
  constraint tecnico_indisponibilidade_sem_sobreposicao
    exclude using gist (tecnico_id with =, tstzrange(inicio_em, fim_em) with &&)
);

create index idx_tecnico_indisp_periodo on public.tecnico_indisponibilidade(loja_id, tecnico_id, inicio_em, fim_em);

-- jornada do mesmo dia não pode se sobrepor (dois turnos são permitidos)
create or replace function public.trg_tecnico_jornada_sem_sobreposicao()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.tecnico_jornada j
    where j.tecnico_id = new.tecnico_id
      and j.dia_semana = new.dia_semana
      and j.id is distinct from new.id
      and (new.inicio, new.fim) overlaps (j.inicio, j.fim)
  ) then
    raise exception 'Este horário se sobrepõe a outro turno do mesmo dia.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tecnico_jornada_sem_sobreposicao
  before insert or update on public.tecnico_jornada
  for each row execute function public.trg_tecnico_jornada_sem_sobreposicao();

-- ---------------------------------------------------------------------
-- 3. RLS: leitura pela empresa (quem vê técnicos), escrita só por função
-- ---------------------------------------------------------------------
alter table public.equipes enable row level security;
alter table public.equipe_membros enable row level security;
alter table public.tecnico_jornada enable row level security;
alter table public.tecnico_indisponibilidade enable row level security;

create policy equipes_select on public.equipes for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy equipe_membros_select on public.equipe_membros for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy tecnico_jornada_select on public.tecnico_jornada for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));
create policy tecnico_indisponibilidade_select on public.tecnico_indisponibilidade for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));

-- ---------------------------------------------------------------------
-- 4. Exclusão da empresa: equipes saem antes dos técnicos
-- ---------------------------------------------------------------------
create or replace function public.trg_lojas_excluir_dependencias()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- itens, histórico, anexos, checklists e observações saem em cascata com a OS
  delete from public.ordens_servico where loja_id = old.id;
  delete from public.equipes where loja_id = old.id;
  delete from public.equipamentos where loja_id = old.id;
  delete from public.tecnico_especialidades where loja_id = old.id;
  delete from public.checklist_modelos where loja_id = old.id;
  return old;
end;
$$;
