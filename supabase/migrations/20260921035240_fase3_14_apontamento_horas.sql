-- =====================================================================
-- Fase 3 · 14 — Apontamento de horas (etapa 10)
-- A estrutura de tempo nasceu na etapa 9 com o fluxo de campo. Aqui ela
-- vira um módulo: duração persistida, origem (relógio ou lançamento
-- manual), auditoria da correção, nada de tempo sobreposto para o mesmo
-- técnico e as funções de consulta e ajuste. O relógio continua sendo o
-- do banco: o navegador nunca informa duração (§26).
-- =====================================================================

create type public.origem_apontamento as enum ('automatico', 'manual');

alter table public.os_apontamentos
  add column origem public.origem_apontamento not null default 'automatico',
  add column atualizado_em timestamptz,
  add column atualizado_por uuid references public.usuarios(id) on delete set null,
  add column duracao_min integer generated always as (
    case when fim_em is null then null
         else greatest(0, round(extract(epoch from (fim_em - inicio_em)) / 60))::int end
  ) stored;

comment on column public.os_apontamentos.origem is
  'automatico = marcado pelo fluxo de campo; manual = lançado ou corrigido por alguém.';
comment on column public.os_apontamentos.duracao_min is
  'Duração fechada em minutos. Apontamento em aberto fica nulo (o tempo corrente é calculado na consulta).';

-- um técnico não pode ter dois trechos de tempo no mesmo instante
alter table public.os_apontamentos
  add constraint os_apontamentos_sem_sobreposicao exclude using gist (
    tecnico_id with =,
    tstzrange(inicio_em, coalesce(fim_em, 'infinity'::timestamptz), '[)') with &&
  );

-- ---------------------------------------------------------------------
-- Permissão de gestão das horas (o registro em campo já tem a sua)
-- ---------------------------------------------------------------------
insert into public.permissoes (chave, modulo, descricao, feature_key, ordem) values
  ('service_orders.manage_time', 'service_orders', 'Lançar e corrigir horas da OS', 'service_orders', 124)
on conflict (chave) do nothing;

create or replace function public.permissoes_padrao_cargo(p_chave text)
returns text[]
language sql immutable set search_path = '' as $$
  select case p_chave
    when 'manager' then array[
      'calendar.view', 'calendar.manage', 'dispatch.view', 'dispatch.assign',
      'checklists.fill', 'attachments.upload', 'service_orders.add_material', 'service_orders.sign',
      'service_orders.manage_time']
    when 'attendant' then array[
      'calendar.view', 'calendar.manage', 'dispatch.view', 'attachments.upload']
    when 'technician' then array[
      'calendar.view', 'technician.jobs.view', 'technician.jobs.start', 'technician.jobs.pause',
      'technician.jobs.complete', 'checklists.fill', 'attachments.upload',
      'service_orders.add_material', 'service_orders.sign']
    else '{}'::text[]
  end;
$$;

insert into public.cargo_permissoes (cargo_id, permissao_chave)
select c.id, p.chave
from public.cargos c
cross join lateral unnest(public.permissoes_padrao_cargo(c.chave)) as p(chave)
where c.sistema
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Quem pode mexer nas horas: o gestor da OS ou o próprio técnico
-- ---------------------------------------------------------------------
create or replace function public.exigir_edicao_horas(p_os_id uuid, p_tecnico_id uuid)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_categoria public.categoria_status;
begin
  if v_loja is null or not public.tem_feature('service_orders') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;

  if not (
    public.tem_permissao('service_orders.manage_time')
    or (
      p_tecnico_id is not null
      and p_tecnico_id = public.tecnico_do_usuario()
      and public.pode_portal_tecnico()
      and public.tem_permissao('technician.jobs.start')
    )
  ) then
    raise exception 'Sem permissão para lançar ou corrigir horas.' using errcode = '42501';
  end if;

  select s.categoria into v_categoria
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id
  where os.id = p_os_id and os.loja_id = v_loja;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
    raise exception 'OS encerrada: reabra a OS para ajustar as horas.' using errcode = '23514';
  end if;

  return v_loja;
end;
$$;

/* Regras de um trecho de tempo: sem futuro, sem inversão, até 24 horas,
   motivo só em pausa e nunca sobrepondo outro trecho do mesmo técnico. */
create or replace function public.validar_apontamento(
  p_loja uuid,
  p_tecnico_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_tipo public.tipo_apontamento,
  p_motivo public.motivo_pausa,
  p_ignorar uuid default null
)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_agora timestamptz := now();
  v_folga interval := interval '2 minutes';
begin
  if p_inicio is null then
    raise exception 'Informe o início do apontamento.' using errcode = '22023';
  end if;
  if p_inicio > v_agora + v_folga then
    raise exception 'Não é possível apontar horas no futuro.' using errcode = '22023';
  end if;
  if p_inicio < v_agora - interval '180 days' then
    raise exception 'Só é possível apontar horas dos últimos 180 dias.' using errcode = '22023';
  end if;
  if p_fim is not null then
    if p_fim <= p_inicio then
      raise exception 'O fim precisa ser depois do início.' using errcode = '22023';
    end if;
    if p_fim > v_agora + v_folga then
      raise exception 'Não é possível apontar horas no futuro.' using errcode = '22023';
    end if;
    if p_fim - p_inicio > interval '24 hours' then
      raise exception 'Um apontamento não pode passar de 24 horas.' using errcode = '22023';
    end if;
  end if;
  if p_tipo = 'pausa' and p_motivo is null then
    raise exception 'Informe o motivo da pausa.' using errcode = '22023';
  end if;
  if p_tipo <> 'pausa' and p_motivo is not null then
    raise exception 'O motivo só vale para pausas.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.os_apontamentos ap
    where ap.loja_id = p_loja
      and ap.tecnico_id = p_tecnico_id
      and (p_ignorar is null or ap.id <> p_ignorar)
      and tstzrange(ap.inicio_em, coalesce(ap.fim_em, 'infinity'::timestamptz), '[)')
          && tstzrange(p_inicio, coalesce(p_fim, 'infinity'::timestamptz), '[)')
  ) then
    raise exception 'O técnico já tem tempo apontado nesse intervalo.' using errcode = '23P01';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Lançar, corrigir e remover
-- ---------------------------------------------------------------------
create or replace function public.lancar_apontamento(
  p_os_id uuid,
  p_tecnico_id uuid,
  p_tipo public.tipo_apontamento,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo public.motivo_pausa default null,
  p_observacao text default null,
  p_agendamento_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid;
  v_agendamento uuid := p_agendamento_id;
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_id uuid;
begin
  v_loja := public.exigir_edicao_horas(p_os_id, p_tecnico_id);

  if p_fim is null then
    raise exception 'Informe o fim do apontamento.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tecnicos t where t.id = p_tecnico_id and t.loja_id = v_loja
  ) then
    raise exception 'Técnico não encontrado.' using errcode = 'P0002';
  end if;

  perform public.validar_apontamento(v_loja, p_tecnico_id, p_inicio, p_fim, p_tipo, p_motivo, null);

  -- liga ao atendimento agendado mais próximo do período, quando houver
  if v_agendamento is null then
    select a.id into v_agendamento
    from public.agendamentos a
    where a.loja_id = v_loja and a.os_id = p_os_id and a.status <> 'cancelado'
      and (
        a.tecnico_id = p_tecnico_id
        or a.equipe_id in (select m.equipe_id from public.equipe_membros m
                           where m.tecnico_id = p_tecnico_id and m.loja_id = v_loja)
      )
    order by abs(extract(epoch from (a.inicio_em - p_inicio)))
    limit 1;
  end if;

  insert into public.os_apontamentos (loja_id, os_id, agendamento_id, tecnico_id, tipo, inicio_em, fim_em,
                                      motivo, observacao, origem, criado_por)
  values (v_loja, p_os_id, v_agendamento, p_tecnico_id, p_tipo, p_inicio, p_fim,
          p_motivo, v_observacao, 'manual', auth.uid())
  returning id into v_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'os_hora_lancada', jsonb_build_object(
    'os_id', p_os_id, 'apontamento_id', v_id, 'tecnico_id', p_tecnico_id,
    'tipo_apontamento', p_tipo, 'inicio', p_inicio, 'fim', p_fim,
    'duracao_min', greatest(0, round(extract(epoch from (p_fim - p_inicio)) / 60))::int,
    'motivo', p_motivo, 'observacao', v_observacao));

  return v_id;
end;
$$;

/* Corrige um trecho já registrado. Passar p_fim nulo só é aceito quando o
   apontamento ainda está correndo (o relógio segue aberto). */
create or replace function public.ajustar_apontamento(
  p_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz default null,
  p_motivo public.motivo_pausa default null,
  p_observacao text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid;
  v_ap public.os_apontamentos;
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_duracao int;
begin
  select * into v_ap
  from public.os_apontamentos ap
  where ap.id = p_id and ap.loja_id = (select public.loja_operacional_id())
  for update;
  if not found then
    raise exception 'Apontamento não encontrado.' using errcode = 'P0002';
  end if;

  v_loja := public.exigir_edicao_horas(v_ap.os_id, v_ap.tecnico_id);

  if p_fim is null and v_ap.fim_em is not null then
    raise exception 'Informe o fim do apontamento.' using errcode = '22023';
  end if;

  perform public.validar_apontamento(v_loja, v_ap.tecnico_id, p_inicio, p_fim, v_ap.tipo, p_motivo, p_id);

  update public.os_apontamentos
     set inicio_em = p_inicio,
         fim_em = p_fim,
         motivo = p_motivo,
         observacao = v_observacao,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id = p_id and loja_id = v_loja;

  v_duracao := case when p_fim is null then null
                    else greatest(0, round(extract(epoch from (p_fim - p_inicio)) / 60))::int end;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'os_hora_ajustada', jsonb_build_object(
    'os_id', v_ap.os_id, 'apontamento_id', p_id, 'tecnico_id', v_ap.tecnico_id,
    'tipo_apontamento', v_ap.tipo, 'inicio', p_inicio, 'fim', p_fim,
    'de_inicio', v_ap.inicio_em, 'duracao_min', v_duracao,
    'motivo', p_motivo, 'observacao', v_observacao));

  return jsonb_build_object('id', p_id, 'duracao_min', v_duracao);
end;
$$;

create or replace function public.excluir_apontamento(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid;
  v_ap public.os_apontamentos;
begin
  select * into v_ap
  from public.os_apontamentos ap
  where ap.id = p_id and ap.loja_id = (select public.loja_operacional_id())
  for update;
  if not found then
    raise exception 'Apontamento não encontrado.' using errcode = 'P0002';
  end if;

  v_loja := public.exigir_edicao_horas(v_ap.os_id, v_ap.tecnico_id);

  delete from public.os_apontamentos where id = p_id and loja_id = v_loja;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'os_hora_removida', jsonb_build_object(
    'os_id', v_ap.os_id, 'apontamento_id', p_id, 'tecnico_id', v_ap.tecnico_id,
    'tipo_apontamento', v_ap.tipo, 'inicio', v_ap.inicio_em, 'fim', v_ap.fim_em,
    'duracao_min', v_ap.duracao_min));
end;
$$;

-- ---------------------------------------------------------------------
-- Consultas
-- ---------------------------------------------------------------------
/* Minutos de um conjunto de apontamentos: o que está aberto conta até agora. */
create or replace function public.minutos_apontados(p_os_id uuid, p_agendamento_id uuid default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'deslocamento_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                  filter (where ap.tipo = 'deslocamento') / 60), 0)::int,
    'atendimento_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                 filter (where ap.tipo = 'atendimento') / 60), 0)::int,
    'pausa_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                           filter (where ap.tipo = 'pausa') / 60), 0)::int,
    'trabalhado_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                filter (where ap.tipo <> 'pausa') / 60), 0)::int)
  from public.os_apontamentos ap
  where ap.os_id = p_os_id
    and (p_agendamento_id is null or ap.agendamento_id = p_agendamento_id);
$$;

/* Horas da OS para o portal da empresa: totais, rateio por técnico e a
   lista de trechos com o que foi corrigido à mão. */
create or replace function public.horas_os(p_os_id uuid)
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

  return jsonb_build_object(
    'totais', public.minutos_apontados(p_os_id),
    'pode_gerenciar', public.tem_permissao('service_orders.manage_time'),
    'por_tecnico', (
      select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'tecnico_id', ap.tecnico_id,
          'nome', btrim(t.nome || ' ' || coalesce(t.sobrenome, '')),
          'deslocamento_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                        filter (where ap.tipo = 'deslocamento') / 60), 0)::int,
          'atendimento_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                       filter (where ap.tipo = 'atendimento') / 60), 0)::int,
          'pausa_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                 filter (where ap.tipo = 'pausa') / 60), 0)::int,
          'trabalhado_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                      filter (where ap.tipo <> 'pausa') / 60), 0)::int) as x
        from public.os_apontamentos ap
        join public.tecnicos t on t.id = ap.tecnico_id and t.loja_id = ap.loja_id
        where ap.os_id = p_os_id and ap.loja_id = v_loja
        group by ap.tecnico_id, t.nome, t.sobrenome
      ) tecnicos
    ),
    'apontamentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ap.id,
               'tipo', ap.tipo,
               'tecnico_id', ap.tecnico_id,
               'tecnico', btrim(t.nome || ' ' || coalesce(t.sobrenome, '')),
               'inicio_em', ap.inicio_em,
               'fim_em', ap.fim_em,
               'duracao_min', coalesce(ap.duracao_min,
                 greatest(0, round(extract(epoch from (now() - ap.inicio_em)) / 60))::int),
               'aberto', ap.fim_em is null,
               'motivo', ap.motivo,
               'observacao', ap.observacao,
               'origem', ap.origem,
               'ajustado', ap.atualizado_em is not null,
               'agendamento_id', ap.agendamento_id)
             order by ap.inicio_em desc), '[]'::jsonb)
      from public.os_apontamentos ap
      join public.tecnicos t on t.id = ap.tecnico_id and t.loja_id = ap.loja_id
      where ap.os_id = p_os_id and ap.loja_id = v_loja
    ));
end;
$$;

/* Horas de um atendimento para o portal do técnico. */
create or replace function public.horas_atendimento(p_agendamento_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_os uuid;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;
  v_tecnico := public.tecnico_do_usuario();
  select a.os_id into v_os from public.agendamentos a where a.id = p_agendamento_id;

  return jsonb_build_object(
    'totais', public.minutos_apontados(v_os, p_agendamento_id),
    'pode_ajustar', public.tem_permissao('technician.jobs.start'),
    'apontamentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', ap.id,
               'tipo', ap.tipo,
               'tecnico', btrim(t.nome || ' ' || coalesce(t.sobrenome, '')),
               'meu', ap.tecnico_id = v_tecnico,
               'inicio_em', ap.inicio_em,
               'fim_em', ap.fim_em,
               'duracao_min', coalesce(ap.duracao_min,
                 greatest(0, round(extract(epoch from (now() - ap.inicio_em)) / 60))::int),
               'aberto', ap.fim_em is null,
               'motivo', ap.motivo,
               'observacao', ap.observacao,
               'origem', ap.origem,
               'ajustado', ap.atualizado_em is not null)
             order by ap.inicio_em desc), '[]'::jsonb)
      from public.os_apontamentos ap
      join public.tecnicos t on t.id = ap.tecnico_id and t.loja_id = ap.loja_id
      where ap.agendamento_id = p_agendamento_id and ap.loja_id = v_loja
    ));
end;
$$;

/* Lançamento manual feito pelo próprio técnico no atendimento dele. */
create or replace function public.lancar_apontamento_tecnico(
  p_agendamento_id uuid,
  p_tipo public.tipo_apontamento,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo public.motivo_pausa default null,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_os uuid;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;
  select a.os_id into v_os from public.agendamentos a where a.id = p_agendamento_id;

  return public.lancar_apontamento(
    v_os, public.tecnico_do_usuario(), p_tipo, p_inicio, p_fim, p_motivo, p_observacao, p_agendamento_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Linha do tempo: passa a mostrar motivo, tipo e duração das horas
-- ---------------------------------------------------------------------
create or replace function public.timeline_os(p_os_id uuid, p_limite integer default 300)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_limite, 300), 1), 1000);
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ordens_servico where id = p_os_id and loja_id = v_loja) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'acao', t.acao, 'criado_em', t.criado_em, 'usuario', t.usuario, 'dados', t.dados)
           order by t.criado_em desc, t.acao = 'os_criada', t.id), '[]'::jsonb)
    from (
      select *
      from (
        select
          e.id, e.acao, e.criado_em, u.nome as usuario,
          jsonb_strip_nulls(jsonb_build_object(
            'campos', e.detalhes->'campos',
            'status_de', sd.nome,
            'status_para', sp.nome,
            'status_cor', sp.cor,
            'observacao', e.detalhes->>'observacao',
            'prioridade_de', pd.nome,
            'prioridade_para', pp.nome,
            'tipo_de', td.nome,
            'tipo_para', tp.nome,
            'local_de', case when e.acao = 'os_local_alterado' then e.detalhes->>'de' end,
            'local_para', e.detalhes->>'para_local',
            'tecnico', nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), ''),
            'equipe', eq.nome,
            'inicio', e.detalhes->>'inicio',
            'fim', e.detalhes->>'fim',
            'de_inicio', e.detalhes->>'de_inicio',
            'forcado', e.detalhes->'forcado',
            'motivo', e.detalhes->>'motivo',
            'tipo_apontamento', e.detalhes->>'tipo_apontamento',
            'duracao_min', e.detalhes->'duracao_min',
            'item', e.detalhes->>'item',
            'quantidade', e.detalhes->'quantidade',
            'subtotal', e.detalhes->'subtotal',
            'arquivo', case when e.acao like 'os\_anexo\_%' then e.detalhes->>'nome' end,
            'tipo_anexo', case when e.acao like 'os\_anexo\_%' then e.detalhes->>'tipo' end,
            'checklist', e.detalhes->>'checklist'
          )) as dados
        from public.log_eventos e
        left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
        left join public.status_os sd
          on e.acao = 'os_status_alterado' and sd.id::text = e.detalhes->>'de' and sd.loja_id = v_loja
        left join public.status_os sp
          on e.acao = 'os_status_alterado' and sp.id::text = e.detalhes->>'para' and sp.loja_id = v_loja
        left join public.prioridades_os pd
          on e.acao = 'os_prioridade_alterada' and pd.id::text = e.detalhes->>'de' and pd.loja_id = v_loja
        left join public.prioridades_os pp
          on e.acao = 'os_prioridade_alterada' and pp.id::text = e.detalhes->>'para' and pp.loja_id = v_loja
        left join public.tipos_servico td
          on e.acao = 'os_tipo_servico_alterado' and td.id::text = e.detalhes->>'de' and td.loja_id = v_loja
        left join public.tipos_servico tp
          on e.acao = 'os_tipo_servico_alterado' and tp.id::text = e.detalhes->>'para' and tp.loja_id = v_loja
        left join public.tecnicos tec
          on tec.id::text = e.detalhes->>'tecnico_id' and tec.loja_id = v_loja
        left join public.equipes eq
          on eq.id::text = e.detalhes->>'equipe_id' and eq.loja_id = v_loja
        where e.loja_id = v_loja and e.detalhes->>'os_id' = p_os_id::text

        union all

        select o.id, 'os_comentario', o.criado_em, u.nome, jsonb_build_object('texto', o.texto)
        from public.os_observacoes o
        left join public.usuarios u on u.id = o.usuario_id and u.loja_id = v_loja
        where o.os_id = p_os_id
      ) todos
      order by criado_em desc
      limit v_limite
    ) t
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Execução
-- ---------------------------------------------------------------------
revoke execute on function public.exigir_edicao_horas(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.validar_apontamento(uuid, uuid, timestamptz, timestamptz, public.tipo_apontamento, public.motivo_pausa, uuid) from public, anon, authenticated;
revoke execute on function public.minutos_apontados(uuid, uuid) from public, anon, authenticated;

revoke execute on function public.lancar_apontamento(uuid, uuid, public.tipo_apontamento, timestamptz, timestamptz, public.motivo_pausa, text, uuid) from public, anon;
revoke execute on function public.lancar_apontamento_tecnico(uuid, public.tipo_apontamento, timestamptz, timestamptz, public.motivo_pausa, text) from public, anon;
revoke execute on function public.ajustar_apontamento(uuid, timestamptz, timestamptz, public.motivo_pausa, text) from public, anon;
revoke execute on function public.excluir_apontamento(uuid) from public, anon;
revoke execute on function public.horas_os(uuid) from public, anon;
revoke execute on function public.horas_atendimento(uuid) from public, anon;

grant execute on function public.lancar_apontamento(uuid, uuid, public.tipo_apontamento, timestamptz, timestamptz, public.motivo_pausa, text, uuid) to authenticated;
grant execute on function public.lancar_apontamento_tecnico(uuid, public.tipo_apontamento, timestamptz, timestamptz, public.motivo_pausa, text) to authenticated;
grant execute on function public.ajustar_apontamento(uuid, timestamptz, timestamptz, public.motivo_pausa, text) to authenticated;
grant execute on function public.excluir_apontamento(uuid) to authenticated;
grant execute on function public.horas_os(uuid) to authenticated;
grant execute on function public.horas_atendimento(uuid) to authenticated;
