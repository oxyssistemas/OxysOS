-- =====================================================================
-- Fase 3 · 11 — Estrutura do fluxo de campo (etapa 9)
-- Estado do atendimento em campo + apontamentos de tempo (deslocamento,
-- atendimento e pausa). As transições e a escrita ficam na fase3_12:
-- valores novos de enum não podem ser usados na mesma transação que os
-- cria, por isso a etapa vem em duas migrations.
-- =====================================================================

create type public.estado_campo_atendimento as enum
  ('nao_iniciado', 'em_deslocamento', 'no_local', 'em_atendimento', 'pausado', 'finalizado');

create type public.tipo_apontamento as enum ('deslocamento', 'atendimento', 'pausa');

create type public.motivo_pausa as enum
  ('almoco', 'aguardando_cliente', 'aguardando_peca', 'problema_tecnico', 'outro');

-- a central de despacho passa a distinguir deslocamento e pausa (§12)
alter type public.situacao_tecnico add value if not exists 'em_deslocamento' after 'ocupado';
alter type public.situacao_tecnico add value if not exists 'pausa' after 'em_atendimento';

alter table public.agendamentos
  add column estado_campo public.estado_campo_atendimento not null default 'nao_iniciado';

create index idx_agendamentos_estado_campo on public.agendamentos(loja_id, estado_campo)
  where estado_campo <> 'nao_iniciado';

-- ---------------------------------------------------------------------
-- Apontamentos de tempo (§26): o relógio é do servidor, não do aparelho
-- ---------------------------------------------------------------------
create table public.os_apontamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null,
  os_id uuid not null,
  agendamento_id uuid,
  tecnico_id uuid not null,
  tipo public.tipo_apontamento not null,
  inicio_em timestamptz not null default now(),
  fim_em timestamptz,
  motivo public.motivo_pausa,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  constraint os_apontamentos_loja_id_id_key unique (loja_id, id),
  constraint os_apontamentos_os_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint os_apontamentos_agendamento_fkey foreign key (loja_id, agendamento_id)
    references public.agendamentos(loja_id, id) on delete set null,
  constraint os_apontamentos_tecnico_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete restrict,
  constraint os_apontamentos_intervalo check (fim_em is null or fim_em > inicio_em),
  constraint os_apontamentos_motivo check (motivo is null or tipo = 'pausa'),
  constraint os_apontamentos_observacao check (observacao is null or length(observacao) <= 300)
);

create index idx_os_apontamentos_os on public.os_apontamentos(loja_id, os_id, inicio_em);
create index idx_os_apontamentos_tecnico on public.os_apontamentos(loja_id, tecnico_id, inicio_em);
create index idx_os_apontamentos_agendamento on public.os_apontamentos(agendamento_id, inicio_em)
  where agendamento_id is not null;

-- um técnico não pode ter dois relógios correndo ao mesmo tempo
create unique index os_apontamentos_um_aberto_por_tecnico on public.os_apontamentos(tecnico_id)
  where fim_em is null;

alter table public.os_apontamentos enable row level security;

-- a empresa lê as horas pelo módulo de OS; o portal do técnico usa funções
create policy os_apontamentos_select on public.os_apontamentos for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('service_orders'))
    and (select public.tem_permissao('service_orders.view'))
  );
