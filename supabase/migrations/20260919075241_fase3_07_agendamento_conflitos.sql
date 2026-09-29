-- =====================================================================
-- Fase 3 · 07 — Agendamento, reagendamento e conflitos (etapa 5)
-- Escrita da agenda só por estas funções: conferem empresa, feature,
-- permissão, OS, técnico/equipe e conflitos. O conflito é recalculado
-- dentro da transação (com trava por recurso), nunca só no navegador.
-- Passar por cima de um conflito exige a permissão calendar.override.
-- =====================================================================

insert into public.permissoes (chave, modulo, descricao, feature_key, ordem) values
  ('calendar.override', 'calendar', 'Agendar mesmo havendo conflito', 'calendar', 92)
on conflict (chave) do nothing;

-- gerente também pode passar por cima do conflito (o proprietário tem tudo)
create or replace function public.permissoes_padrao_cargo(p_chave text)
returns text[]
language sql immutable set search_path = '' as $$
  select case p_chave
    when 'manager' then array[
      'calendar.view', 'calendar.manage', 'calendar.override', 'dispatch.view', 'dispatch.assign',
      'checklists.fill', 'attachments.upload', 'service_orders.add_material', 'service_orders.sign']
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
-- Conflitos: técnico ocupado, equipe ocupada, ausência e fora da jornada
-- ---------------------------------------------------------------------
create or replace function public.conflitos_agendamento(
  p_tecnico uuid,
  p_equipe uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_ignorar uuid default null,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_conflitos jsonb := '[]'::jsonb;
  v_nome text;
begin
  if v_loja is null or not public.tem_feature('calendar') or not public.tem_permissao('calendar.view') then
    raise exception 'Sem acesso à agenda.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Informe um período válido.' using errcode = '22023';
  end if;

  if p_tecnico is not null then
    select nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), '') into v_nome
    from public.tecnicos t where t.id = p_tecnico and t.loja_id = v_loja;

    select v_conflitos || coalesce(jsonb_agg(jsonb_build_object(
             'tipo', 'tecnico_ocupado',
             'agendamento_id', a.id,
             'os_id', a.os_id,
             'numero', os.numero,
             'mensagem', format('%s já tem atendimento em %s, das %s às %s.',
               coalesce(v_nome, 'O técnico'),
               to_char(a.inicio_em at time zone p_fuso, 'DD/MM'),
               to_char(a.inicio_em at time zone p_fuso, 'HH24:MI'),
               to_char(a.fim_em at time zone p_fuso, 'HH24:MI')))
           order by a.inicio_em), '[]'::jsonb)
      into v_conflitos
    from public.agendamentos a
    join public.ordens_servico os on os.id = a.os_id
    where a.loja_id = v_loja
      and a.tecnico_id = p_tecnico
      and a.status <> 'cancelado'
      and (p_ignorar is null or a.id <> p_ignorar)
      and a.inicio_em < p_fim and a.fim_em > p_inicio;

    -- ausência registrada ou fora da jornada semanal
    if exists (
      select 1 from public.tecnico_indisponibilidade i
      where i.tecnico_id = p_tecnico and i.loja_id = v_loja
        and tstzrange(i.inicio_em, i.fim_em) && tstzrange(p_inicio, p_fim)
    ) then
      select v_conflitos || jsonb_build_array(jsonb_build_object(
               'tipo', 'tecnico_ausente',
               'mensagem', format('%s está de %s neste período.', coalesce(v_nome, 'O técnico'),
                 (select case i.motivo
                    when 'folga' then 'folga' when 'ferias' then 'férias' when 'atestado' then 'atestado'
                    when 'treinamento' then 'treinamento' when 'bloqueio' then 'agenda bloqueada' else 'ausência' end
                  from public.tecnico_indisponibilidade i
                  where i.tecnico_id = p_tecnico and i.loja_id = v_loja
                    and tstzrange(i.inicio_em, i.fim_em) && tstzrange(p_inicio, p_fim)
                  order by i.inicio_em limit 1))))
        into v_conflitos;
    elsif not public.tecnico_disponivel_em(p_tecnico, p_inicio, p_fim, p_fuso) then
      select v_conflitos || jsonb_build_array(jsonb_build_object(
               'tipo', 'fora_jornada',
               'mensagem', format('O horário está fora da jornada de %s.', coalesce(v_nome, 'trabalho do técnico'))))
        into v_conflitos;
    end if;
  end if;

  if p_equipe is not null then
    select e.nome into v_nome from public.equipes e where e.id = p_equipe and e.loja_id = v_loja;

    select v_conflitos || coalesce(jsonb_agg(jsonb_build_object(
             'tipo', 'equipe_ocupada',
             'agendamento_id', a.id,
             'os_id', a.os_id,
             'numero', os.numero,
             'mensagem', format('A equipe %s já tem atendimento em %s, das %s às %s.',
               coalesce(v_nome, ''),
               to_char(a.inicio_em at time zone p_fuso, 'DD/MM'),
               to_char(a.inicio_em at time zone p_fuso, 'HH24:MI'),
               to_char(a.fim_em at time zone p_fuso, 'HH24:MI')))
           order by a.inicio_em), '[]'::jsonb)
      into v_conflitos
    from public.agendamentos a
    join public.ordens_servico os on os.id = a.os_id
    where a.loja_id = v_loja
      and a.equipe_id = p_equipe
      and a.status <> 'cancelado'
      and (p_ignorar is null or a.id <> p_ignorar)
      and a.inicio_em < p_fim and a.fim_em > p_inicio;
  end if;

  return v_conflitos;
end;
$$;

-- ---------------------------------------------------------------------
-- Apoio interno (não exposto): valida a OS e sincroniza a data da OS
-- ---------------------------------------------------------------------
create or replace function public.exigir_gestao_agenda()
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('calendar') or not public.tem_permissao('calendar.manage') then
    raise exception 'Sem permissão para agendar atendimentos.' using errcode = '42501';
  end if;
  return v_loja;
end;
$$;

/* A OS continua guardando a data combinada com o cliente: ela passa a ser o
   próximo agendamento ativo (ou nada, quando todos foram cancelados). */
create or replace function public.sincronizar_agendamento_os(p_os_id uuid, p_fuso text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inicio timestamptz;
begin
  select min(a.inicio_em) into v_inicio
  from public.agendamentos a
  where a.os_id = p_os_id and a.status <> 'cancelado';

  update public.ordens_servico
     set data_agendada = case when v_inicio is null then null else (v_inicio at time zone p_fuso)::date end,
         hora_agendada = case when v_inicio is null then null else (v_inicio at time zone p_fuso)::time end
   where id = p_os_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Agendar
-- ---------------------------------------------------------------------
create or replace function public.agendar_os(
  p_os_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_tecnico uuid default null,
  p_equipe uuid default null,
  p_observacao text default null,
  p_forcar boolean default false,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_agenda();
  v_id uuid;
  v_chave text;
  v_conflitos jsonb;
  v_sem_responsavel boolean;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Informe um período válido.' using errcode = '22023';
  end if;
  if p_fim - p_inicio > interval '24 hours' then
    raise exception 'Um atendimento pode durar no máximo 24 horas.' using errcode = '23514';
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

  -- duas pessoas podem agendar o mesmo técnico ao mesmo tempo: serializa por recurso
  for v_chave in select k from unnest(array[p_tecnico::text, p_equipe::text]) k where k is not null order by k loop
    perform pg_advisory_xact_lock(hashtextextended(v_chave, 0));
  end loop;

  v_conflitos := public.conflitos_agendamento(p_tecnico, p_equipe, p_inicio, p_fim, null, p_fuso);
  if jsonb_array_length(v_conflitos) > 0 then
    if not p_forcar then
      raise exception 'Há conflito de agenda neste horário.' using errcode = '23514';
    end if;
    if not public.tem_permissao('calendar.override') then
      raise exception 'Você não pode agendar sobre um conflito.' using errcode = '42501';
    end if;
  end if;

  insert into public.agendamentos (loja_id, os_id, tecnico_id, equipe_id, inicio_em, fim_em, observacao, criado_por, atualizado_por)
  values (v_loja, p_os_id, p_tecnico, p_equipe, p_inicio, p_fim,
          nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid(), auth.uid())
  returning id into v_id;

  -- OS sem responsável recebe o mesmo do agendamento (quem pode atribuir)
  select os.tecnico_id is null and os.equipe_id is null into v_sem_responsavel
  from public.ordens_servico os where os.id = p_os_id;
  if v_sem_responsavel and (p_tecnico is not null or p_equipe is not null)
     and public.tem_permissao('service_orders.assign') then
    update public.ordens_servico
       set tecnico_id = coalesce(p_tecnico, tecnico_id), equipe_id = coalesce(p_equipe, equipe_id)
     where id = p_os_id;
  end if;

  perform public.sincronizar_agendamento_os(p_os_id, p_fuso);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'os_agendada', jsonb_build_object(
    'os_id', p_os_id, 'agendamento_id', v_id, 'inicio', p_inicio, 'fim', p_fim,
    'tecnico_id', p_tecnico, 'equipe_id', p_equipe,
    'forcado', jsonb_array_length(v_conflitos) > 0));

  return jsonb_build_object('id', v_id, 'conflitos', v_conflitos);
end;
$$;

-- ---------------------------------------------------------------------
-- Reagendar (arrastar na agenda ou editar o painel)
-- ---------------------------------------------------------------------
create or replace function public.reagendar_agendamento(
  p_id uuid,
  p_versao integer,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_tecnico uuid default null,
  p_equipe uuid default null,
  p_observacao text default null,
  p_forcar boolean default false,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_agenda();
  v_os uuid;
  v_status public.status_agendamento;
  v_inicio_antes timestamptz;
  v_fim_antes timestamptz;
  v_chave text;
  v_conflitos jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Informe um período válido.' using errcode = '22023';
  end if;
  if p_fim - p_inicio > interval '24 hours' then
    raise exception 'Um atendimento pode durar no máximo 24 horas.' using errcode = '23514';
  end if;

  select a.os_id, a.status, a.inicio_em, a.fim_em into v_os, v_status, v_inicio_antes, v_fim_antes
  from public.agendamentos a where a.id = p_id and a.loja_id = v_loja;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_status in ('concluido', 'cancelado') then
    raise exception 'Este atendimento já foi encerrado e não pode ser reagendado.' using errcode = '23514';
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

  for v_chave in select k from unnest(array[p_tecnico::text, p_equipe::text]) k where k is not null order by k loop
    perform pg_advisory_xact_lock(hashtextextended(v_chave, 0));
  end loop;

  v_conflitos := public.conflitos_agendamento(p_tecnico, p_equipe, p_inicio, p_fim, p_id, p_fuso);
  if jsonb_array_length(v_conflitos) > 0 then
    if not p_forcar then
      raise exception 'Há conflito de agenda neste horário.' using errcode = '23514';
    end if;
    if not public.tem_permissao('calendar.override') then
      raise exception 'Você não pode agendar sobre um conflito.' using errcode = '42501';
    end if;
  end if;

  update public.agendamentos
     set inicio_em = p_inicio,
         fim_em = p_fim,
         tecnico_id = p_tecnico,
         equipe_id = p_equipe,
         observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
         versao = versao + 1,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id = p_id and loja_id = v_loja and versao = p_versao;
  if not found then
    raise exception 'Este atendimento foi alterado por outra pessoa. Recarregue a agenda.' using errcode = '40001';
  end if;

  perform public.sincronizar_agendamento_os(v_os, p_fuso);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'os_reagendada', jsonb_build_object(
    'os_id', v_os, 'agendamento_id', p_id,
    'de_inicio', v_inicio_antes, 'de_fim', v_fim_antes,
    'inicio', p_inicio, 'fim', p_fim,
    'tecnico_id', p_tecnico, 'equipe_id', p_equipe,
    'forcado', jsonb_array_length(v_conflitos) > 0));

  return jsonb_build_object('id', p_id, 'conflitos', v_conflitos);
end;
$$;

-- ---------------------------------------------------------------------
-- Confirmar, reabrir e cancelar
-- ---------------------------------------------------------------------
create or replace function public.definir_status_agendamento(
  p_id uuid,
  p_versao integer,
  p_status public.status_agendamento,
  p_motivo text default null,
  p_fuso text default 'America/Sao_Paulo'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_agenda();
  v_os uuid;
  v_atual public.status_agendamento;
begin
  if p_status not in ('agendado', 'confirmado', 'cancelado') then
    raise exception 'Este status é definido pelo atendimento em campo.' using errcode = '23514';
  end if;

  select a.os_id, a.status into v_os, v_atual
  from public.agendamentos a where a.id = p_id and a.loja_id = v_loja;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  if v_atual in ('em_andamento', 'concluido') then
    raise exception 'Este atendimento já começou e não pode voltar para a agenda.' using errcode = '23514';
  end if;

  update public.agendamentos
     set status = p_status,
         observacao = case
           when p_status = 'cancelado' and nullif(btrim(coalesce(p_motivo, '')), '') is not null
             then nullif(btrim(p_motivo), '')
           else observacao end,
         versao = versao + 1,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id = p_id and loja_id = v_loja and versao = p_versao;
  if not found then
    raise exception 'Este atendimento foi alterado por outra pessoa. Recarregue a agenda.' using errcode = '40001';
  end if;

  perform public.sincronizar_agendamento_os(v_os, p_fuso);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(),
    case p_status
      when 'confirmado' then 'os_agendamento_confirmado'
      when 'cancelado' then 'os_agendamento_cancelado'
      else 'os_agendamento_reaberto' end,
    jsonb_build_object('os_id', v_os, 'agendamento_id', p_id, 'observacao', nullif(btrim(coalesce(p_motivo, '')), '')));
end;
$$;

-- ---------------------------------------------------------------------
-- Timeline: eventos de equipe e de agenda ganham dados próprios
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

revoke execute on function public.exigir_gestao_agenda() from public, anon, authenticated;
revoke execute on function public.sincronizar_agendamento_os(uuid, text) from public, anon, authenticated;
revoke execute on function public.conflitos_agendamento(uuid, uuid, timestamptz, timestamptz, uuid, text) from public, anon;
revoke execute on function public.agendar_os(uuid, timestamptz, timestamptz, uuid, uuid, text, boolean, text) from public, anon;
revoke execute on function public.reagendar_agendamento(uuid, integer, timestamptz, timestamptz, uuid, uuid, text, boolean, text) from public, anon;
revoke execute on function public.definir_status_agendamento(uuid, integer, public.status_agendamento, text, text) from public, anon;

grant execute on function public.conflitos_agendamento(uuid, uuid, timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function public.agendar_os(uuid, timestamptz, timestamptz, uuid, uuid, text, boolean, text) to authenticated;
grant execute on function public.reagendar_agendamento(uuid, integer, timestamptz, timestamptz, uuid, uuid, text, boolean, text) to authenticated;
grant execute on function public.definir_status_agendamento(uuid, integer, public.status_agendamento, text, text) to authenticated;
