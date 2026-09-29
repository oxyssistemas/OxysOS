-- =====================================================================
-- Fase 3 · 06 — Agenda operacional (etapa 4)
-- Tabela própria de agendamentos (decisão do usuário): uma OS pode ter
-- mais de uma visita e o horário de campo passa a ser independente dos
-- campos data_agendada/hora_agendada da OS, que continuam como a data
-- combinada com o cliente e são mantidos em sincronia na etapa 5.
-- Aqui só a leitura da agenda; criar/reagendar vem na etapa 5.
-- =====================================================================

create type public.status_agendamento as enum
  ('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado');

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  os_id uuid not null,
  tecnico_id uuid,
  equipe_id uuid,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  status public.status_agendamento not null default 'agendado',
  observacao text,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null,
  constraint agendamentos_loja_id_id_key unique (loja_id, id),
  constraint agendamentos_os_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint agendamentos_tecnico_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete restrict,
  constraint agendamentos_equipe_fkey foreign key (loja_id, equipe_id)
    references public.equipes(loja_id, id) on delete restrict,
  constraint agendamentos_intervalo check (fim_em > inicio_em),
  constraint agendamentos_duracao check (fim_em - inicio_em <= interval '24 hours'),
  constraint agendamentos_observacao check (observacao is null or length(observacao) <= 500)
);

-- a agenda cresce sem parar: sempre lida por intervalo (ver agenda_periodo)
create index idx_agendamentos_periodo on public.agendamentos(loja_id, inicio_em, fim_em);
create index idx_agendamentos_tecnico on public.agendamentos(loja_id, tecnico_id, inicio_em) where tecnico_id is not null;
create index idx_agendamentos_equipe on public.agendamentos(loja_id, equipe_id, inicio_em) where equipe_id is not null;
create index idx_agendamentos_os on public.agendamentos(loja_id, os_id);
create index idx_agendamentos_status on public.agendamentos(loja_id, status, inicio_em);

alter table public.agendamentos enable row level security;

create policy agendamentos_select on public.agendamentos for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('calendar'))
    and (select public.tem_permissao('calendar.view'))
  );

-- ---------------------------------------------------------------------
-- OS que já tinham data combinada entram na agenda (dado real, não semente)
-- ---------------------------------------------------------------------
insert into public.agendamentos (loja_id, os_id, tecnico_id, equipe_id, inicio_em, fim_em, status)
select
  os.loja_id, os.id, os.tecnico_id, os.equipe_id,
  ((os.data_agendada + coalesce(os.hora_agendada, time '08:00')) at time zone 'America/Sao_Paulo'),
  ((os.data_agendada + coalesce(os.hora_agendada, time '08:00')) at time zone 'America/Sao_Paulo') + interval '1 hour',
  case s.categoria
    when 'finalizado_sucesso' then 'concluido'
    when 'finalizado_cancelado' then 'cancelado'
    when 'em_andamento' then 'em_andamento'
    else 'agendado'
  end::public.status_agendamento
from public.ordens_servico os
join public.status_os s on s.id = os.status_id
where os.data_agendada is not null;

-- ---------------------------------------------------------------------
-- Leitura da agenda por intervalo
-- ---------------------------------------------------------------------
create or replace function public.agenda_periodo(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_tecnico uuid default null,
  p_equipe uuid default null,
  p_incluir_cancelados boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_ver_clientes boolean;
begin
  if v_loja is null or not public.tem_feature('calendar') or not public.tem_permissao('calendar.view') then
    raise exception 'Sem acesso à agenda.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Informe um período válido.' using errcode = '22023';
  end if;
  -- a agenda pode ter milhares de registros: nunca carregar tudo
  if p_fim - p_inicio > interval '62 days' then
    raise exception 'Consulte no máximo dois meses de agenda por vez.' using errcode = '22023';
  end if;

  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');

  return jsonb_build_object(
    'eventos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id,
               'os_id', a.os_id,
               'numero', os.numero,
               'titulo', os.titulo,
               'descricao', os.descricao,
               'cliente', case when v_ver_clientes then c.nome end,
               'tipo_servico', ts.nome,
               'local_atendimento', os.local_atendimento,
               'inicio_em', a.inicio_em,
               'fim_em', a.fim_em,
               'status', a.status,
               'observacao', a.observacao,
               'versao', a.versao,
               'tecnico', case when t.id is not null then
                 jsonb_build_object('id', t.id, 'nome', nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), '')) end,
               'equipe', case when eq.id is not null then
                 jsonb_build_object('id', eq.id, 'nome', eq.nome, 'cor', eq.cor) end,
               'status_os', jsonb_build_object('id', s.id, 'nome', s.nome, 'cor', s.cor, 'categoria', s.categoria),
               'prioridade', jsonb_build_object('id', pr.id, 'nome', pr.nome, 'cor', pr.cor, 'nivel', pr.nivel))
             order by a.inicio_em, pr.ordem), '[]'::jsonb)
      from public.agendamentos a
      join public.ordens_servico os on os.id = a.os_id and os.loja_id = v_loja
      join public.clientes c on c.id = os.cliente_id
      join public.status_os s on s.id = os.status_id
      join public.prioridades_os pr on pr.id = os.prioridade_id
      left join public.tipos_servico ts on ts.id = os.tipo_servico_id
      left join public.tecnicos t on t.id = a.tecnico_id
      left join public.equipes eq on eq.id = a.equipe_id
      where a.loja_id = v_loja
        and a.inicio_em < p_fim
        and a.fim_em > p_inicio
        and (p_tecnico is null or a.tecnico_id = p_tecnico)
        and (p_equipe is null or a.equipe_id = p_equipe)
        and (p_incluir_cancelados or a.status <> 'cancelado')
    ),
    -- colunas das visões "Técnicos" e "Equipes" (inclusive quem está sem atendimento)
    'tecnicos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id,
               'nome', nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), ''))
             order by t.nome), '[]'::jsonb)
      from public.tecnicos t where t.loja_id = v_loja and t.ativo
    ),
    'equipes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor)
             order by e.nome), '[]'::jsonb)
      from public.equipes e where e.loja_id = v_loja and e.ativo
    )
  );
end;
$$;

revoke execute on function public.agenda_periodo(timestamptz, timestamptz, uuid, uuid, boolean) from public, anon;
grant execute on function public.agenda_periodo(timestamptz, timestamptz, uuid, uuid, boolean) to authenticated;
