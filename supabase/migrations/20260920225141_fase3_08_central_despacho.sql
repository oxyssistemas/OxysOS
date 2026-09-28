-- =====================================================================
-- Fase 3 · 08 — Central de Despacho (etapa 6)
-- * OS não atribuídas com SLA e tempo de espera;
-- * situação de cada técnico derivada de dados reais (agenda, ausência,
--   jornada e vínculo de login) — nada inventado no frontend;
-- * sugestão determinística de técnico (disponibilidade, especialidade,
--   jornada e carga do dia);
-- * atribuição pela central, exigindo a feature dispatch.
-- Deslocamento e pausa só existem a partir do fluxo de campo (etapa 9).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Especialidade exigida por tipo de serviço (base da sugestão)
-- ---------------------------------------------------------------------
create table public.tipo_servico_especialidades (
  loja_id uuid not null,
  tipo_servico_id uuid not null,
  especialidade_id uuid not null,
  criado_em timestamptz not null default now(),
  primary key (tipo_servico_id, especialidade_id),
  constraint tipo_servico_especialidades_tipo_fkey foreign key (loja_id, tipo_servico_id)
    references public.tipos_servico(loja_id, id) on delete cascade,
  constraint tipo_servico_especialidades_especialidade_fkey foreign key (loja_id, especialidade_id)
    references public.especialidades(loja_id, id) on delete cascade
);

create index idx_tipo_servico_especialidades_esp on public.tipo_servico_especialidades(loja_id, especialidade_id);

alter table public.tipo_servico_especialidades enable row level security;

create policy tipo_servico_especialidades_select on public.tipo_servico_especialidades for select to authenticated
  using (loja_id = (select public.loja_operacional_id()));

create policy tipo_servico_especialidades_insert on public.tipo_servico_especialidades for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('service_orders'))
    and (select public.tem_permissao('settings.manage'))
  );

create policy tipo_servico_especialidades_delete on public.tipo_servico_especialidades for delete to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('service_orders'))
    and (select public.tem_permissao('settings.manage'))
  );

-- ---------------------------------------------------------------------
-- Situação do técnico no instante consultado
-- ---------------------------------------------------------------------
create type public.situacao_tecnico as enum
  ('disponivel', 'ocupado', 'em_atendimento', 'ausente', 'fora_jornada', 'offline');

create or replace function public.situacao_tecnico_em(p_tecnico_id uuid, p_momento timestamptz, p_fuso text)
returns public.situacao_tecnico
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_usuario uuid;
  v_ativo boolean;
  v_local timestamp;
begin
  select t.usuario_id, t.ativo into v_usuario, v_ativo
  from public.tecnicos t where t.id = p_tecnico_id and t.loja_id = v_loja;
  if not found or not v_ativo then
    return 'offline';
  end if;

  -- atendimento em campo em curso (status vem do fluxo do técnico)
  if exists (
    select 1 from public.agendamentos a
    where a.tecnico_id = p_tecnico_id and a.loja_id = v_loja and a.status = 'em_andamento'
  ) then
    return 'em_atendimento';
  end if;

  if exists (
    select 1 from public.tecnico_indisponibilidade i
    where i.tecnico_id = p_tecnico_id and i.loja_id = v_loja
      and p_momento >= i.inicio_em and p_momento < i.fim_em
  ) then
    return 'ausente';
  end if;

  if exists (
    select 1 from public.agendamentos a
    where a.tecnico_id = p_tecnico_id and a.loja_id = v_loja
      and a.status in ('agendado', 'confirmado')
      and p_momento >= a.inicio_em and p_momento < a.fim_em
  ) then
    return 'ocupado';
  end if;

  -- sem login vinculado ninguém acompanha o atendimento pelo portal do técnico
  if v_usuario is null then
    return 'offline';
  end if;

  if exists (select 1 from public.tecnico_jornada j where j.tecnico_id = p_tecnico_id and j.loja_id = v_loja) then
    v_local := p_momento at time zone p_fuso;
    if not exists (
      select 1 from public.tecnico_jornada j
      where j.tecnico_id = p_tecnico_id and j.loja_id = v_loja
        and j.dia_semana = extract(dow from v_local)::smallint
        and j.inicio <= v_local::time and j.fim > v_local::time
    ) then
      return 'fora_jornada';
    end if;
  end if;

  return 'disponivel';
end;
$$;

-- ---------------------------------------------------------------------
-- Painel da central
-- ---------------------------------------------------------------------
create or replace function public.painel_despacho(
  p_dia date default null,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_dia date;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_agora timestamptz := now();
  v_ver_clientes boolean;
begin
  if v_loja is null or not public.tem_feature('dispatch') or not public.tem_permissao('dispatch.view') then
    raise exception 'Sem acesso à central de despacho.' using errcode = '42501';
  end if;

  v_dia := coalesce(p_dia, (v_agora at time zone p_fuso)::date);
  v_inicio := (v_dia::timestamp) at time zone p_fuso;
  v_fim := ((v_dia + 1)::timestamp) at time zone p_fuso;
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');

  return jsonb_build_object(
    'dia', v_dia,
    -- OS em aberto sem técnico e sem equipe
    'nao_atribuidas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'os_id', os.id,
               'numero', os.numero,
               'titulo', os.titulo,
               'descricao', os.descricao,
               'cliente', case when v_ver_clientes then c.nome end,
               'local_atendimento', os.local_atendimento,
               'tipo_servico', case when ts.id is not null then jsonb_build_object('id', ts.id, 'nome', ts.nome) end,
               'prioridade', jsonb_build_object('id', pr.id, 'nome', pr.nome, 'cor', pr.cor, 'nivel', pr.nivel),
               'status', jsonb_build_object('id', s.id, 'nome', s.nome, 'cor', s.cor, 'categoria', s.categoria),
               'sla', public.situacao_sla_os(os.prazo_em, os.criado_em, os.concluido_em, s.categoria),
               'prazo_em', os.prazo_em,
               'criado_em', os.criado_em,
               'agendado_em', (select min(a.inicio_em) from public.agendamentos a
                               where a.os_id = os.id and a.status <> 'cancelado'),
               'aguardando_minutos', round(extract(epoch from (v_agora - os.criado_em)) / 60)::int)
             order by pr.ordem, os.criado_em), '[]'::jsonb)
      from public.ordens_servico os
      join public.status_os s on s.id = os.status_id
      join public.clientes c on c.id = os.cliente_id
      join public.prioridades_os pr on pr.id = os.prioridade_id
      left join public.tipos_servico ts on ts.id = os.tipo_servico_id
      where os.loja_id = v_loja
        and os.tecnico_id is null and os.equipe_id is null
        and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado')
    ),
    'tecnicos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nome', nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), ''),
               'tem_login', t.usuario_id is not null,
               'situacao', public.situacao_tecnico_em(t.id, v_agora, p_fuso),
               'especialidades', (
                 select coalesce(jsonb_agg(e.nome order by e.nome), '[]'::jsonb)
                 from public.tecnico_especialidades te
                 join public.especialidades e on e.id = te.especialidade_id and e.ativo
                 where te.tecnico_id = t.id and te.loja_id = v_loja
               ),
               'atendimentos_dia', (
                 select count(*) from public.agendamentos a
                 where a.tecnico_id = t.id and a.loja_id = v_loja and a.status <> 'cancelado'
                   and a.inicio_em < v_fim and a.fim_em > v_inicio
               ),
               'minutos_dia', (
                 select coalesce(round(sum(extract(epoch from (a.fim_em - a.inicio_em))) / 60), 0)::int
                 from public.agendamentos a
                 where a.tecnico_id = t.id and a.loja_id = v_loja and a.status <> 'cancelado'
                   and a.inicio_em < v_fim and a.fim_em > v_inicio
               ),
               'os_abertas', (
                 select count(*) from public.ordens_servico os
                 join public.status_os s on s.id = os.status_id
                 where os.tecnico_id = t.id and os.loja_id = v_loja
                   and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado')
               ),
               'agenda', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', a.id, 'os_id', a.os_id, 'numero', os2.numero,
                          'titulo', coalesce(nullif(os2.titulo, ''), ts2.nome, os2.descricao),
                          'inicio_em', a.inicio_em, 'fim_em', a.fim_em, 'status', a.status,
                          'prioridade_cor', pr2.cor)
                        order by a.inicio_em), '[]'::jsonb)
                 from public.agendamentos a
                 join public.ordens_servico os2 on os2.id = a.os_id
                 join public.prioridades_os pr2 on pr2.id = os2.prioridade_id
                 left join public.tipos_servico ts2 on ts2.id = os2.tipo_servico_id
                 where a.tecnico_id = t.id and a.loja_id = v_loja and a.status <> 'cancelado'
                   and a.inicio_em < v_fim and a.fim_em > v_inicio
               ))
             order by t.nome), '[]'::jsonb)
      from public.tecnicos t
      where t.loja_id = v_loja and t.ativo
    ),
    'equipes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'nome', e.nome, 'cor', e.cor,
               'atendimentos_dia', (
                 select count(*) from public.agendamentos a
                 where a.equipe_id = e.id and a.loja_id = v_loja and a.status <> 'cancelado'
                   and a.inicio_em < v_fim and a.fim_em > v_inicio
               ))
             order by e.nome), '[]'::jsonb)
      from public.equipes e where e.loja_id = v_loja and e.ativo
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Sugestão de técnico: regras determinísticas, sem IA
-- ---------------------------------------------------------------------
create or replace function public.sugerir_tecnicos(
  p_os_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tipo uuid;
  v_exige_especialidade boolean;
begin
  if v_loja is null or not public.tem_feature('dispatch') or not public.tem_permissao('dispatch.view') then
    raise exception 'Sem acesso à central de despacho.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Informe um período válido.' using errcode = '22023';
  end if;

  select os.tipo_servico_id into v_tipo
  from public.ordens_servico os where os.id = p_os_id and os.loja_id = v_loja;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  v_exige_especialidade := v_tipo is not null and exists (
    select 1 from public.tipo_servico_especialidades tse
    where tse.tipo_servico_id = v_tipo and tse.loja_id = v_loja
  );

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'tecnico_id', x.id,
             'nome', x.nome,
             'pontuacao', x.pontuacao,
             'livre', x.livre,
             'especialidade_ok', x.especialidade_ok,
             'minutos_no_dia', x.minutos_no_dia,
             'motivos', x.motivos)
           order by x.pontuacao desc, x.minutos_no_dia, x.nome), '[]'::jsonb)
    from (
      select
        t.id,
        nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), '') as nome,
        d.livre,
        d.especialidade_ok,
        d.minutos_no_dia,
        -- disponibilidade pesa mais que especialidade, que pesa mais que carga
        (case when d.livre then 60 else 0 end)
        + (case when d.especialidade_ok then 30 else 0 end)
        + greatest(0, 10 - (d.minutos_no_dia / 60)) as pontuacao,
        (select coalesce(jsonb_agg(m), '[]'::jsonb) from unnest(array[
           case when d.livre then 'Sem conflito no horário' else 'Agenda ocupada ou fora da jornada' end,
           case when not v_exige_especialidade then null
                when d.especialidade_ok then 'Tem a especialidade do serviço'
                else 'Sem a especialidade do serviço' end,
           case when d.minutos_no_dia = 0 then 'Dia livre'
                else format('%s min já agendados no dia', d.minutos_no_dia) end
         ]) m where m is not null) as motivos
      from public.tecnicos t
      cross join lateral (
        select
          jsonb_array_length(public.conflitos_agendamento(t.id, null, p_inicio, p_fim, null, p_fuso)) = 0 as livre,
          (not v_exige_especialidade) or exists (
            select 1 from public.tecnico_especialidades te
            join public.tipo_servico_especialidades tse
              on tse.especialidade_id = te.especialidade_id and tse.tipo_servico_id = v_tipo
            where te.tecnico_id = t.id and te.loja_id = v_loja
          ) as especialidade_ok,
          coalesce((
            select round(sum(extract(epoch from (a.fim_em - a.inicio_em))) / 60)
            from public.agendamentos a
            where a.tecnico_id = t.id and a.loja_id = v_loja and a.status <> 'cancelado'
              and (a.inicio_em at time zone p_fuso)::date = (p_inicio at time zone p_fuso)::date
          ), 0)::int as minutos_no_dia
      ) d
      where t.loja_id = v_loja and t.ativo
    ) x
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Atribuir pela central (sem agendar)
-- ---------------------------------------------------------------------
create or replace function public.atribuir_os(
  p_os_id uuid,
  p_tecnico uuid default null,
  p_equipe uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('dispatch') or not public.tem_permissao('dispatch.assign') then
    raise exception 'Sem permissão para distribuir ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.ordens_servico os
    join public.status_os s on s.id = os.status_id
    where os.id = p_os_id and os.loja_id = v_loja
      and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado')
  ) then
    raise exception 'Ordem de serviço não encontrada ou já finalizada.' using errcode = 'P0002';
  end if;
  if p_tecnico is not null and not exists (
    select 1 from public.tecnicos where id = p_tecnico and loja_id = v_loja and ativo
  ) then
    raise exception 'Técnico inativo ou de outra empresa.' using errcode = '23514';
  end if;
  if p_equipe is not null and not exists (
    select 1 from public.equipes where id = p_equipe and loja_id = v_loja and ativo
  ) then
    raise exception 'Equipe inativa ou de outra empresa.' using errcode = '23514';
  end if;

  -- os eventos da timeline saem do gatilho da própria OS
  update public.ordens_servico
     set tecnico_id = p_tecnico, equipe_id = p_equipe
   where id = p_os_id and loja_id = v_loja;
end;
$$;

revoke execute on function public.situacao_tecnico_em(uuid, timestamptz, text) from public, anon;
revoke execute on function public.painel_despacho(date, text) from public, anon;
revoke execute on function public.sugerir_tecnicos(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.atribuir_os(uuid, uuid, uuid) from public, anon;

grant execute on function public.situacao_tecnico_em(uuid, timestamptz, text) to authenticated;
grant execute on function public.painel_despacho(date, text) to authenticated;
grant execute on function public.sugerir_tecnicos(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.atribuir_os(uuid, uuid, uuid) to authenticated;
