-- =====================================================================
-- Fase 3 · 09 — Acesso ao portal do técnico (etapa 7)
-- Quem entra no /technician é decidido no banco: precisa estar ligado a
-- um técnico ativo da empresa, ter a feature technician_portal e a
-- permissão technician.jobs.view. O portal enxerga os atendimentos do
-- próprio técnico e os das equipes de que ele participa (regra escolhida
-- pelo usuário), nunca os de outro técnico.
-- =====================================================================

-- técnico ligado ao usuário logado (null quando não é técnico)
create or replace function public.tecnico_do_usuario()
returns uuid
language sql stable security definer set search_path = public as $$
  select t.id
  from public.tecnicos t
  where t.usuario_id = (select auth.uid())
    and t.loja_id = (select public.loja_operacional_id())
    and t.ativo
  limit 1;
$$;

-- o portal está liberado para este usuário?
create or replace function public.pode_portal_tecnico()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.tem_feature('technician_portal')
     and public.tem_permissao('technician.jobs.view')
     and public.tecnico_do_usuario() is not null;
$$;

/* Para onde mandar o usuário depois do login (a decisão é do servidor). */
create or replace function public.destino_inicial()
returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return 'login';
  end if;
  if public.is_super_admin() then
    return 'admin';
  end if;
  if public.pode_portal_tecnico() then
    return 'technician';
  end if;
  return 'app';
end;
$$;

-- ---------------------------------------------------------------------
-- Contexto do portal (uma chamada alimenta layout, perfil e permissões)
-- ---------------------------------------------------------------------
create or replace function public.contexto_tecnico()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('situacao', 'sem_sessao');
  end if;
  if v_loja is null then
    -- empresa suspensa, trial vencido, usuário inativo… (mesma regra do portal da empresa)
    return jsonb_build_object('situacao', 'sem_acesso');
  end if;
  if not public.tem_feature('technician_portal') then
    return jsonb_build_object('situacao', 'sem_feature');
  end if;

  v_tecnico := public.tecnico_do_usuario();
  if v_tecnico is null then
    return jsonb_build_object('situacao', 'sem_tecnico');
  end if;
  if not public.tem_permissao('technician.jobs.view') then
    return jsonb_build_object('situacao', 'sem_permissao');
  end if;

  return jsonb_build_object(
    'situacao', 'liberado',
    'usuario', (
      select jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email,
                                'cargo', c.nome)
      from public.usuarios u
      left join public.cargos c on c.id = u.cargo_id
      where u.id = v_uid
    ),
    'empresa', (select jsonb_build_object('id', l.id, 'nome', l.nome) from public.lojas l where l.id = v_loja),
    'tecnico', (
      select jsonb_build_object(
               'id', t.id,
               'nome', nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), ''),
               'telefone', t.telefone,
               'especialidades', (
                 select coalesce(jsonb_agg(e.nome order by e.nome), '[]'::jsonb)
                 from public.tecnico_especialidades te
                 join public.especialidades e on e.id = te.especialidade_id and e.ativo
                 where te.tecnico_id = t.id and te.loja_id = v_loja
               ))
      from public.tecnicos t where t.id = v_tecnico
    ),
    'equipes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) order by e.nome), '[]'::jsonb)
      from public.equipe_membros m
      join public.equipes e on e.id = m.equipe_id and e.ativo
      where m.tecnico_id = v_tecnico and m.loja_id = v_loja
    ),
    'jornada', (
      select coalesce(jsonb_agg(jsonb_build_object('dia_semana', j.dia_semana,
                                                   'inicio', to_char(j.inicio, 'HH24:MI'),
                                                   'fim', to_char(j.fim, 'HH24:MI'))
             order by j.dia_semana, j.inicio), '[]'::jsonb)
      from public.tecnico_jornada j where j.tecnico_id = v_tecnico and j.loja_id = v_loja
    ),
    -- o técnico também pode abrir o portal da empresa quando o cargo permite
    'acesso_portal_empresa', public.tem_permissao('dashboard.view'),
    'permissoes', (
      select coalesce(jsonb_agg(p.chave order by p.chave), '[]'::jsonb)
      from public.permissoes p
      where p.chave in ('technician.jobs.view', 'technician.jobs.start', 'technician.jobs.pause',
                        'technician.jobs.complete', 'checklists.fill', 'attachments.upload',
                        'service_orders.add_material', 'service_orders.sign', 'service_orders.view')
        and public.tem_permissao(p.chave)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Home do técnico: o dia em números e o próximo atendimento
-- ---------------------------------------------------------------------
create or replace function public.home_tecnico(p_fuso text default 'America/Sao_Paulo')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid;
  v_agora timestamptz := now();
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  v_tecnico := public.tecnico_do_usuario();
  v_inicio := ((v_agora at time zone p_fuso)::date::timestamp) at time zone p_fuso;
  v_fim := v_inicio + interval '1 day';

  return (
    with meus as (
      select a.*, os.numero, os.titulo, os.descricao, os.local_atendimento,
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
    hoje as (select * from meus where inicio_em < v_fim and fim_em > v_inicio)
    select jsonb_build_object(
      'hoje', jsonb_build_object(
        'total', (select count(*) from hoje),
        'urgentes', (select count(*) from hoje h join public.prioridades_os p on p.id = h.prioridade_id
                     where p.nivel in ('alta', 'urgente')),
        'concluidos', (select count(*) from hoje where status = 'concluido'),
        'em_andamento', (select count(*) from hoje where status = 'em_andamento')
      ),
      'proximo', (
        select jsonb_build_object(
                 'agendamento_id', h.id,
                 'os_id', h.os_id,
                 'numero', h.numero,
                 'titulo', coalesce(nullif(h.titulo, ''), ts.nome, h.descricao),
                 'cliente', c.nome,
                 'tipo_servico', ts.nome,
                 'local_atendimento', h.local_atendimento,
                 'inicio_em', h.inicio_em,
                 'fim_em', h.fim_em,
                 'status', h.status,
                 'status_os', jsonb_build_object('nome', s.nome, 'cor', s.cor, 'categoria', s.categoria),
                 'prioridade', jsonb_build_object('nome', p.nome, 'cor', p.cor, 'nivel', p.nivel))
        from meus h
        join public.clientes c on c.id = h.cliente_id
        join public.status_os s on s.id = h.status_id
        join public.prioridades_os p on p.id = h.prioridade_id
        left join public.tipos_servico ts on ts.id = h.tipo_servico_id
        where h.status in ('agendado', 'confirmado', 'em_andamento')
          and h.fim_em > v_agora
        order by (h.status = 'em_andamento') desc, h.inicio_em
        limit 1
      ),
      'proximos_dias', (
        select count(*) from meus
        where inicio_em >= v_fim and inicio_em < v_fim + interval '7 days'
      )
    )
  );
end;
$$;

revoke execute on function public.tecnico_do_usuario() from public, anon;
revoke execute on function public.pode_portal_tecnico() from public, anon;
revoke execute on function public.destino_inicial() from public, anon;
revoke execute on function public.contexto_tecnico() from public, anon;
revoke execute on function public.home_tecnico(text) from public, anon;

grant execute on function public.tecnico_do_usuario() to authenticated;
grant execute on function public.pode_portal_tecnico() to authenticated;
grant execute on function public.destino_inicial() to authenticated;
grant execute on function public.contexto_tecnico() to authenticated;
grant execute on function public.home_tecnico(text) to authenticated;
