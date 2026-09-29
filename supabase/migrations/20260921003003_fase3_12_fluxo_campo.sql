-- =====================================================================
-- Fase 3 · 12 — Máquina de estados do atendimento em campo (etapa 9)
-- Deslocamento → chegada → atendimento → pausa → retomada, tudo
-- validado no servidor: permissão do cargo, dono do atendimento e
-- transição permitida. Cada passo fecha o apontamento anterior, abre o
-- novo e grava a linha do tempo da OS. O relógio é o do banco.
-- =====================================================================

-- o atendimento é do técnico logado (ou de uma equipe dele)?
create or replace function public.atendimento_do_tecnico(p_agendamento_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select a.id
  from public.agendamentos a
  where a.id = p_agendamento_id
    and a.loja_id = (select public.loja_operacional_id())
    and (
      a.tecnico_id = (select public.tecnico_do_usuario())
      or a.equipe_id in (select m.equipe_id from public.equipe_membros m
                         where m.tecnico_id = (select public.tecnico_do_usuario())
                           and m.loja_id = a.loja_id)
    );
$$;

/* Passo do fluxo: confere permissão, dono e transição; fecha o relógio
   anterior, abre o próximo e registra o evento na OS. */
create or replace function public.registrar_passo_campo(
  p_agendamento_id uuid,
  p_passo text,
  p_motivo public.motivo_pausa default null,
  p_observacao text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid := public.tecnico_do_usuario();
  v_estado public.estado_campo_atendimento;
  v_novo public.estado_campo_atendimento;
  v_os uuid;
  v_permissao text;
  v_tipo public.tipo_apontamento;
  v_acao text;
  v_agora timestamptz := now();
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if p_passo not in ('deslocamento', 'chegada', 'atendimento', 'pausa', 'retomada') then
    raise exception 'Passo inválido.' using errcode = '22023';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;

  -- permissão por passo (o cargo pode iniciar sem poder pausar, por exemplo)
  v_permissao := case p_passo
    when 'pausa' then 'technician.jobs.pause'
    when 'retomada' then 'technician.jobs.pause'
    else 'technician.jobs.start' end;
  if not public.tem_permissao(v_permissao) then
    raise exception 'Seu cargo não permite esta ação no atendimento.' using errcode = '42501';
  end if;

  select a.estado_campo, a.os_id into v_estado, v_os
  from public.agendamentos a where a.id = p_agendamento_id for update;

  -- transições permitidas (§20)
  v_novo := case
    when p_passo = 'deslocamento' and v_estado = 'nao_iniciado' then 'em_deslocamento'
    when p_passo = 'chegada' and v_estado in ('nao_iniciado', 'em_deslocamento') then 'no_local'
    when p_passo = 'atendimento' and v_estado in ('nao_iniciado', 'em_deslocamento', 'no_local') then 'em_atendimento'
    when p_passo = 'pausa' and v_estado = 'em_atendimento' then 'pausado'
    when p_passo = 'retomada' and v_estado = 'pausado' then 'em_atendimento'
  end;
  if v_novo is null then
    raise exception 'Esta ação não é possível no estado atual do atendimento.' using errcode = '23514';
  end if;
  if p_passo = 'pausa' and p_motivo is null then
    raise exception 'Informe o motivo da pausa.' using errcode = '22023';
  end if;

  -- fecha o relógio que estava correndo para este técnico
  update public.os_apontamentos
     set fim_em = v_agora
   where tecnico_id = v_tecnico and loja_id = v_loja and fim_em is null;

  v_tipo := case p_passo
    when 'deslocamento' then 'deslocamento'
    when 'pausa' then 'pausa'
    when 'chegada' then null
    else 'atendimento' end;

  if v_tipo is not null then
    insert into public.os_apontamentos (loja_id, os_id, agendamento_id, tecnico_id, tipo, inicio_em,
                                        motivo, observacao, criado_por)
    values (v_loja, v_os, p_agendamento_id, v_tecnico, v_tipo, v_agora,
            case when v_tipo = 'pausa' then p_motivo end,
            nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid());
  end if;

  update public.agendamentos
     set estado_campo = v_novo,
         status = case when status in ('agendado', 'confirmado') then 'em_andamento'::public.status_agendamento
                       else status end,
         versao = versao + 1,
         atualizado_em = v_agora,
         atualizado_por = auth.uid()
   where id = p_agendamento_id and loja_id = v_loja;

  v_acao := case p_passo
    when 'deslocamento' then 'os_deslocamento_iniciado'
    when 'chegada' then 'os_tecnico_chegou'
    when 'atendimento' then 'os_atendimento_iniciado'
    when 'pausa' then 'os_atendimento_pausado'
    else 'os_atendimento_retomado' end;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), v_acao, jsonb_build_object(
    'os_id', v_os, 'agendamento_id', p_agendamento_id, 'tecnico_id', v_tecnico,
    'motivo', p_motivo, 'observacao', nullif(btrim(coalesce(p_observacao, '')), '')));

  return jsonb_build_object('estado_campo', v_novo, 'em', v_agora);
end;
$$;

-- atalhos com nome de negócio (a regra fica em um lugar só)
create or replace function public.iniciar_deslocamento(p_agendamento_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.registrar_passo_campo(p_agendamento_id, 'deslocamento');
$$;

create or replace function public.registrar_chegada(p_agendamento_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.registrar_passo_campo(p_agendamento_id, 'chegada');
$$;

create or replace function public.iniciar_atendimento_campo(p_agendamento_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.registrar_passo_campo(p_agendamento_id, 'atendimento');
$$;

create or replace function public.pausar_atendimento(
  p_agendamento_id uuid,
  p_motivo public.motivo_pausa,
  p_observacao text default null
)
returns jsonb language sql security definer set search_path = public as $$
  select public.registrar_passo_campo(p_agendamento_id, 'pausa', p_motivo, p_observacao);
$$;

create or replace function public.retomar_atendimento(p_agendamento_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select public.registrar_passo_campo(p_agendamento_id, 'retomada');
$$;

-- ---------------------------------------------------------------------
-- Situação do técnico: agora distingue deslocamento e pausa (§12)
-- ---------------------------------------------------------------------
create or replace function public.situacao_tecnico_em(p_tecnico_id uuid, p_momento timestamptz, p_fuso text)
returns public.situacao_tecnico
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_usuario uuid;
  v_ativo boolean;
  v_estado public.estado_campo_atendimento;
  v_local timestamp;
begin
  select t.usuario_id, t.ativo into v_usuario, v_ativo
  from public.tecnicos t where t.id = p_tecnico_id and t.loja_id = v_loja;
  if not found or not v_ativo then
    return 'offline';
  end if;

  -- o que o próprio técnico registrou em campo vem primeiro
  select a.estado_campo into v_estado
  from public.agendamentos a
  where a.loja_id = v_loja and a.tecnico_id = p_tecnico_id
    and a.estado_campo in ('em_deslocamento', 'no_local', 'em_atendimento', 'pausado')
  order by a.atualizado_em desc
  limit 1;
  if v_estado = 'em_deslocamento' then return 'em_deslocamento'; end if;
  if v_estado = 'pausado' then return 'pausa'; end if;
  if v_estado in ('no_local', 'em_atendimento') then return 'em_atendimento'; end if;

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
-- Detalhe do atendimento: estado do campo e relógio
-- ---------------------------------------------------------------------
create or replace function public.atendimento_tecnico(p_agendamento_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_contato boolean;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  v_tecnico := public.tecnico_do_usuario();
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;

  v_contato := public.tem_feature('customers') and public.tem_permissao('customers.view');

  return (
    select jsonb_build_object(
      'agendamento', jsonb_build_object(
        'id', a.id, 'inicio_em', a.inicio_em, 'fim_em', a.fim_em,
        'status', a.status, 'observacao', a.observacao,
        'estado_campo', a.estado_campo,
        'equipe', case when eq.id is not null then jsonb_build_object('nome', eq.nome, 'cor', eq.cor) end),
      'os', jsonb_build_object(
        'id', os.id, 'numero', os.numero, 'titulo', os.titulo,
        'problema', os.descricao,
        'objeto', os.objeto_atendimento,
        'local_atendimento', os.local_atendimento,
        'tipo_servico', ts.nome,
        'prazo_em', os.prazo_em,
        'status', jsonb_build_object('nome', s.nome, 'cor', s.cor, 'categoria', s.categoria),
        'prioridade', jsonb_build_object('nome', p.nome, 'cor', p.cor, 'nivel', p.nivel)),
      'cliente', jsonb_build_object(
        'id', c.id, 'nome', c.nome,
        'telefone', case when v_contato then c.telefone end,
        'email', case when v_contato then c.email end),
      'endereco', public.endereco_atendimento(os.id),
      'equipamento', case when e.id is not null then jsonb_build_object(
        'id', e.id, 'nome', e.nome, 'marca', e.marca, 'modelo', e.modelo,
        'numero_serie', e.numero_serie, 'localizacao', e.localizacao,
        'codigo', e.codigo_publico) end,
      -- relógio: o que está correndo agora e o que já foi somado
      'apontamento_aberto', (
        select jsonb_build_object('id', ap.id, 'tipo', ap.tipo, 'inicio_em', ap.inicio_em, 'motivo', ap.motivo)
        from public.os_apontamentos ap
        where ap.agendamento_id = a.id and ap.tecnico_id = v_tecnico and ap.fim_em is null
        limit 1
      ),
      'tempos', (
        select jsonb_build_object(
          'deslocamento_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                        filter (where ap.tipo = 'deslocamento') / 60), 0)::int,
          'atendimento_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                       filter (where ap.tipo = 'atendimento') / 60), 0)::int,
          'pausa_min', coalesce(round(sum(extract(epoch from (coalesce(ap.fim_em, now()) - ap.inicio_em)))
                                 filter (where ap.tipo = 'pausa') / 60), 0)::int)
        from public.os_apontamentos ap
        where ap.agendamento_id = a.id
      )
    )
    from public.agendamentos a
    join public.ordens_servico os on os.id = a.os_id
    join public.clientes c on c.id = os.cliente_id
    join public.status_os s on s.id = os.status_id
    join public.prioridades_os p on p.id = os.prioridade_id
    left join public.tipos_servico ts on ts.id = os.tipo_servico_id
    left join public.equipamentos e on e.id = os.equipamento_id
    left join public.equipes eq on eq.id = a.equipe_id
    where a.id = p_agendamento_id
  );
end;
$$;

-- a agenda do técnico mostra o estado de campo em cada cartão
create or replace function public.agenda_tecnico(
  p_grupo text default 'hoje',
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_agora timestamptz := now();
  v_inicio_dia timestamptz;
  v_fim_dia timestamptz;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if p_grupo not in ('hoje', 'proximos', 'concluidos') then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
  v_tecnico := public.tecnico_do_usuario();
  v_inicio_dia := ((v_agora at time zone p_fuso)::date::timestamp) at time zone p_fuso;
  v_fim_dia := v_inicio_dia + interval '1 day';

  return (
    with meus as (
      select a.id, a.os_id, a.inicio_em, a.fim_em, a.status, a.observacao, a.equipe_id, a.estado_campo,
             os.numero, os.titulo, os.descricao, os.local_atendimento,
             os.cliente_id, os.tipo_servico_id, os.prioridade_id, os.status_id
      from public.agendamentos a
      join public.ordens_servico os on os.id = a.os_id and os.loja_id = v_loja
      where a.loja_id = v_loja
        and a.status <> 'cancelado'
        and (
          a.tecnico_id = v_tecnico
          or a.equipe_id in (select m.equipe_id from public.equipe_membros m
                             where m.tecnico_id = v_tecnico and m.loja_id = v_loja)
        )
    ),
    filtrados as (
      select * from meus
      where case p_grupo
        when 'hoje' then inicio_em < v_fim_dia and fim_em > v_inicio_dia and status <> 'concluido'
        when 'proximos' then inicio_em >= v_fim_dia and status in ('agendado', 'confirmado')
        else status = 'concluido' and fim_em >= v_agora - interval '30 days'
      end
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'agendamento_id', f.id,
             'os_id', f.os_id,
             'numero', f.numero,
             'titulo', coalesce(nullif(f.titulo, ''), ts.nome, f.descricao),
             'cliente', c.nome,
             'endereco', public.endereco_atendimento(f.os_id),
             'local_atendimento', f.local_atendimento,
             'tipo_servico', ts.nome,
             'inicio_em', f.inicio_em,
             'fim_em', f.fim_em,
             'status', f.status,
             'estado_campo', f.estado_campo,
             'da_equipe', f.equipe_id is not null,
             'status_os', jsonb_build_object('nome', s.nome, 'cor', s.cor, 'categoria', s.categoria),
             'prioridade', jsonb_build_object('nome', p.nome, 'cor', p.cor, 'nivel', p.nivel))
           order by case when p_grupo = 'concluidos' then f.inicio_em end desc, f.inicio_em), '[]'::jsonb)
    from filtrados f
    join public.clientes c on c.id = f.cliente_id
    join public.status_os s on s.id = f.status_id
    join public.prioridades_os p on p.id = f.prioridade_id
    left join public.tipos_servico ts on ts.id = f.tipo_servico_id
  );
end;
$$;

revoke execute on function public.atendimento_do_tecnico(uuid) from public, anon, authenticated;
revoke execute on function public.registrar_passo_campo(uuid, text, public.motivo_pausa, text) from public, anon, authenticated;
revoke execute on function public.iniciar_deslocamento(uuid) from public, anon;
revoke execute on function public.registrar_chegada(uuid) from public, anon;
revoke execute on function public.iniciar_atendimento_campo(uuid) from public, anon;
revoke execute on function public.pausar_atendimento(uuid, public.motivo_pausa, text) from public, anon;
revoke execute on function public.retomar_atendimento(uuid) from public, anon;

grant execute on function public.iniciar_deslocamento(uuid) to authenticated;
grant execute on function public.registrar_chegada(uuid) to authenticated;
grant execute on function public.iniciar_atendimento_campo(uuid) to authenticated;
grant execute on function public.pausar_atendimento(uuid, public.motivo_pausa, text) to authenticated;
grant execute on function public.retomar_atendimento(uuid) to authenticated;
