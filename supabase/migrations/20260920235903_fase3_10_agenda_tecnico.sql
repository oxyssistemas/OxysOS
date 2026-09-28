-- =====================================================================
-- Fase 3 · 10 — Agenda e detalhe do atendimento no portal do técnico
-- (etapa 8). Só leitura: as ações de campo entram na etapa 9.
-- O técnico enxerga os atendimentos dele e os das equipes de que faz
-- parte; qualquer outro devolve "não encontrado".
-- Nada de valor, custo ou margem: o portal de campo não mostra dinheiro.
-- =====================================================================

-- endereço legível do atendimento (ou null quando é na loja/sem endereço)
create or replace function public.endereco_atendimento(p_os_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when os.local_atendimento = 'loja' then null
    when e.id is null then null
    else jsonb_build_object(
      'rotulo', e.rotulo,
      'logradouro', e.logradouro,
      'numero', e.numero,
      'complemento', e.complemento,
      'bairro', e.bairro,
      'cidade', e.cidade,
      'estado', e.estado,
      'cep', e.cep,
      'referencia', e.referencia,
      'resumo', nullif(concat_ws(', ',
        nullif(concat_ws(', ', nullif(e.logradouro, ''), nullif(e.numero, '')), ''),
        nullif(e.bairro, ''),
        nullif(concat_ws('/', nullif(e.cidade, ''), nullif(e.estado, '')), '')), ''))
  end
  from public.ordens_servico os
  left join public.cliente_enderecos e on e.id = os.cliente_endereco_id and e.loja_id = os.loja_id
  where os.id = p_os_id;
$$;

-- ---------------------------------------------------------------------
-- Agenda: hoje, próximos e concluídos
-- ---------------------------------------------------------------------
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
      select a.id, a.os_id, a.inicio_em, a.fim_em, a.status, a.observacao, a.equipe_id,
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

-- ---------------------------------------------------------------------
-- Detalhe do atendimento (§18): o que o técnico precisa em campo
-- ---------------------------------------------------------------------
create or replace function public.atendimento_tecnico(p_agendamento_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_os uuid;
  v_contato boolean;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  v_tecnico := public.tecnico_do_usuario();

  -- o atendimento precisa ser dele ou da equipe dele
  select a.os_id into v_os
  from public.agendamentos a
  where a.id = p_agendamento_id and a.loja_id = v_loja
    and (
      a.tecnico_id = v_tecnico
      or a.equipe_id in (select m.equipe_id from public.equipe_membros m
                         where m.tecnico_id = v_tecnico and m.loja_id = v_loja)
    );
  if not found then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;

  v_contato := public.tem_feature('customers') and public.tem_permissao('customers.view');

  return (
    select jsonb_build_object(
      'agendamento', jsonb_build_object(
        'id', a.id, 'inicio_em', a.inicio_em, 'fim_em', a.fim_em,
        'status', a.status, 'observacao', a.observacao,
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
        'codigo', e.codigo_publico) end
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

-- ---------------------------------------------------------------------
-- Atendimento em foco: o que está em andamento ou o próximo
-- ---------------------------------------------------------------------
create or replace function public.atendimento_atual_tecnico(p_fuso text default 'America/Sao_Paulo')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_id uuid;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  v_tecnico := public.tecnico_do_usuario();

  select a.id into v_id
  from public.agendamentos a
  where a.loja_id = v_loja
    and a.status in ('agendado', 'confirmado', 'em_andamento')
    and a.fim_em > now() - interval '12 hours'
    and (
      a.tecnico_id = v_tecnico
      or a.equipe_id in (select m.equipe_id from public.equipe_membros m
                         where m.tecnico_id = v_tecnico and m.loja_id = v_loja)
    )
  order by (a.status = 'em_andamento') desc, a.inicio_em
  limit 1;

  if v_id is null then
    return null;
  end if;
  return public.atendimento_tecnico(v_id);
end;
$$;

revoke execute on function public.endereco_atendimento(uuid) from public, anon, authenticated;
revoke execute on function public.agenda_tecnico(text, text) from public, anon;
revoke execute on function public.atendimento_tecnico(uuid) from public, anon;
revoke execute on function public.atendimento_atual_tecnico(text) from public, anon;

grant execute on function public.agenda_tecnico(text, text) to authenticated;
grant execute on function public.atendimento_tecnico(uuid) to authenticated;
grant execute on function public.atendimento_atual_tecnico(text) to authenticated;
