-- =====================================================================
-- Fase 3 · 03 — Funções de equipes e disponibilidade (etapa 3)
-- Toda escrita passa por aqui: valida empresa, permissão, técnicos e
-- registra auditoria. A OS passa a registrar a equipe na timeline.
-- =====================================================================

create or replace function public.exigir_gestao_tecnicos()
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.manage') then
    raise exception 'Sem permissão para gerenciar técnicos e equipes.' using errcode = '42501';
  end if;
  return v_loja;
end;
$$;

-- ---------------------------------------------------------------------
-- Equipes
-- ---------------------------------------------------------------------
create or replace function public.salvar_equipe(p_id uuid, p_versao integer, p_dados jsonb, p_membros jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_tecnicos();
  v_id uuid;
  v_nome text := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_cor text := upper(coalesce(nullif(p_dados->>'cor', ''), '#1565FF'));
  v_membros jsonb := coalesce(p_membros, '[]'::jsonb);
  v_invalido uuid;
begin
  if jsonb_typeof(v_membros) <> 'array' then
    raise exception 'Lista de membros inválida.' using errcode = '22023';
  end if;

  -- todo membro precisa ser técnico ativo da mesma empresa
  select (m->>'tecnico_id')::uuid into v_invalido
  from jsonb_array_elements(v_membros) m
  where not exists (
    select 1 from public.tecnicos t
    where t.id = (m->>'tecnico_id')::uuid and t.loja_id = v_loja and t.ativo
  )
  limit 1;
  if v_invalido is not null then
    raise exception 'Só técnicos ativos desta empresa entram na equipe.' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.equipes (loja_id, nome, descricao, cor, criado_por, atualizado_por)
    values (v_loja, v_nome, nullif(btrim(coalesce(p_dados->>'descricao', '')), ''), v_cor, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.equipes
       set nome = v_nome,
           descricao = nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
           cor = v_cor,
           versao = versao + 1,
           atualizado_em = now(),
           atualizado_por = auth.uid()
     where id = p_id and loja_id = v_loja and versao = p_versao
    returning id into v_id;
    if v_id is null then
      if exists (select 1 from public.equipes where id = p_id and loja_id = v_loja) then
        raise exception 'Esta equipe foi alterada por outra pessoa. Recarregue antes de salvar.' using errcode = '40001';
      end if;
      raise exception 'Equipe não encontrada.' using errcode = 'P0002';
    end if;
    delete from public.equipe_membros where equipe_id = v_id;
  end if;

  insert into public.equipe_membros (loja_id, equipe_id, tecnico_id, lider)
  select distinct on ((m->>'tecnico_id')::uuid)
         v_loja, v_id, (m->>'tecnico_id')::uuid, coalesce((m->>'lider')::boolean, false)
  from jsonb_array_elements(v_membros) m;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_id is null then 'equipe_criada' else 'equipe_alterada' end,
          'equipe', v_id, jsonb_build_object('nome', v_nome, 'membros', jsonb_array_length(v_membros)));
  return v_id;
end;
$$;

create or replace function public.definir_equipe_ativa(p_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_tecnicos();
  v_nome text;
begin
  select nome into v_nome from public.equipes where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Equipe não encontrada.' using errcode = 'P0002';
  end if;
  if not p_ativo and exists (
    select 1 from public.ordens_servico os
    join public.status_os s on s.id = os.status_id
    where os.equipe_id = p_id and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado')
  ) then
    raise exception 'Esta equipe tem OS em aberto. Conclua ou transfira antes de desativar.' using errcode = '23514';
  end if;

  update public.equipes set ativo = p_ativo, versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and loja_id = v_loja;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, case when p_ativo then 'equipe_reativada' else 'equipe_desativada' end,
          'equipe', p_id, jsonb_build_object('nome', v_nome));
end;
$$;

create or replace function public.excluir_equipe(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_tecnicos();
  v_nome text;
begin
  select nome into v_nome from public.equipes where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Equipe não encontrada.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ordens_servico where equipe_id = p_id) then
    raise exception 'Esta equipe já foi usada em ordens de serviço. Desative-a em vez de excluir.' using errcode = '23503';
  end if;

  delete from public.equipes where id = p_id and loja_id = v_loja;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'equipe_excluida', 'equipe', p_id, jsonb_build_object('nome', v_nome));
end;
$$;

create or replace function public.listar_equipes()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.view') then
    raise exception 'Sem acesso às equipes.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'nome', e.nome, 'descricao', e.descricao, 'cor', e.cor,
             'ativo', e.ativo, 'versao', e.versao,
             'membros', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'tecnico_id', t.id,
                        'nome', nullif(btrim(t.nome || ' ' || coalesce(t.sobrenome, '')), ''),
                        'ativo', t.ativo, 'lider', m.lider)
                      order by m.lider desc, t.nome), '[]'::jsonb)
               from public.equipe_membros m
               join public.tecnicos t on t.id = m.tecnico_id and t.loja_id = v_loja
               where m.equipe_id = e.id
             ),
             'os_abertas', (
               select count(*) from public.ordens_servico os
               join public.status_os s on s.id = os.status_id
               where os.equipe_id = e.id and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado')
             ))
           order by e.ativo desc, e.nome), '[]'::jsonb)
    from public.equipes e
    where e.loja_id = v_loja
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Disponibilidade
-- ---------------------------------------------------------------------
create or replace function public.salvar_jornada_tecnico(p_tecnico_id uuid, p_jornada jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_tecnicos();
  v_turno jsonb;
begin
  if not exists (select 1 from public.tecnicos where id = p_tecnico_id and loja_id = v_loja) then
    raise exception 'Técnico não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_jornada, '[]'::jsonb)) <> 'array' then
    raise exception 'Jornada inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_jornada, '[]'::jsonb)) > 21 then
    raise exception 'Use no máximo três turnos por dia.' using errcode = '23514';
  end if;

  delete from public.tecnico_jornada where tecnico_id = p_tecnico_id and loja_id = v_loja;

  for v_turno in select * from jsonb_array_elements(coalesce(p_jornada, '[]'::jsonb)) loop
    insert into public.tecnico_jornada (loja_id, tecnico_id, dia_semana, inicio, fim)
    values (v_loja, p_tecnico_id, (v_turno->>'dia_semana')::smallint,
            (v_turno->>'inicio')::time, (v_turno->>'fim')::time);
  end loop;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'tecnico_jornada_alterada', 'tecnico', p_tecnico_id,
          jsonb_build_object('turnos', jsonb_array_length(coalesce(p_jornada, '[]'::jsonb))));
end;
$$;

create or replace function public.registrar_indisponibilidade(
  p_tecnico_id uuid,
  p_motivo public.motivo_indisponibilidade,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_tecnicos();
  v_id uuid;
begin
  if not exists (select 1 from public.tecnicos where id = p_tecnico_id and loja_id = v_loja) then
    raise exception 'Técnico não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Informe um período válido.' using errcode = '22023';
  end if;

  begin
    insert into public.tecnico_indisponibilidade (loja_id, tecnico_id, motivo, inicio_em, fim_em, observacao, criado_por)
    values (v_loja, p_tecnico_id, p_motivo, p_inicio, p_fim,
            nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Este técnico já tem um período de ausência que cobre esse intervalo.' using errcode = '23514';
  end;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'tecnico_indisponibilidade_registrada', 'tecnico', p_tecnico_id,
          jsonb_build_object('motivo', p_motivo, 'inicio', p_inicio, 'fim', p_fim));
  return v_id;
end;
$$;

create or replace function public.remover_indisponibilidade(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.exigir_gestao_tecnicos();
  v_tecnico uuid;
begin
  select tecnico_id into v_tecnico from public.tecnico_indisponibilidade where id = p_id and loja_id = v_loja;
  if not found then
    raise exception 'Período não encontrado.' using errcode = 'P0002';
  end if;
  delete from public.tecnico_indisponibilidade where id = p_id and loja_id = v_loja;

  insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
  values (auth.uid(), v_loja, 'tecnico_indisponibilidade_removida', 'tecnico', v_tecnico, jsonb_build_object('id', p_id));
end;
$$;

create or replace function public.disponibilidade_tecnico(p_tecnico_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.view') then
    raise exception 'Sem acesso aos técnicos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tecnicos where id = p_tecnico_id and loja_id = v_loja) then
    raise exception 'Técnico não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'jornada', (
      select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'dia_semana', j.dia_semana,
                                                   'inicio', to_char(j.inicio, 'HH24:MI'),
                                                   'fim', to_char(j.fim, 'HH24:MI'))
             order by j.dia_semana, j.inicio), '[]'::jsonb)
      from public.tecnico_jornada j where j.tecnico_id = p_tecnico_id and j.loja_id = v_loja
    ),
    'ausencias', (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'motivo', i.motivo, 'inicio_em', i.inicio_em,
                                                   'fim_em', i.fim_em, 'observacao', i.observacao)
             order by i.inicio_em), '[]'::jsonb)
      from public.tecnico_indisponibilidade i
      where i.tecnico_id = p_tecnico_id and i.loja_id = v_loja and i.fim_em >= now() - interval '30 days'
    )
  );
end;
$$;

-- base dos conflitos do agendamento: jornada cobre o intervalo e não há ausência
create or replace function public.tecnico_disponivel_em(
  p_tecnico_id uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_fuso text default 'America/Sao_Paulo'
)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_inicio_local timestamp;
  v_fim_local timestamp;
begin
  if v_loja is null or p_inicio is null or p_fim is null or p_fim <= p_inicio then
    return false;
  end if;
  if not exists (select 1 from public.tecnicos where id = p_tecnico_id and loja_id = v_loja and ativo) then
    return false;
  end if;
  if exists (
    select 1 from public.tecnico_indisponibilidade i
    where i.tecnico_id = p_tecnico_id and i.loja_id = v_loja
      and tstzrange(i.inicio_em, i.fim_em) && tstzrange(p_inicio, p_fim)
  ) then
    return false;
  end if;

  begin
    v_inicio_local := p_inicio at time zone p_fuso;
    v_fim_local := p_fim at time zone p_fuso;
  exception when others then
    v_inicio_local := p_inicio at time zone 'America/Sao_Paulo';
    v_fim_local := p_fim at time zone 'America/Sao_Paulo';
  end;

  -- sem jornada cadastrada, o técnico é tratado como disponível
  if not exists (select 1 from public.tecnico_jornada where tecnico_id = p_tecnico_id and loja_id = v_loja) then
    return true;
  end if;
  -- atendimento que atravessa o dia não cabe em um turno
  if v_inicio_local::date <> v_fim_local::date then
    return false;
  end if;
  return exists (
    select 1 from public.tecnico_jornada j
    where j.tecnico_id = p_tecnico_id and j.loja_id = v_loja
      and j.dia_semana = extract(dow from v_inicio_local)::smallint
      and j.inicio <= v_inicio_local::time and j.fim >= v_fim_local::time
  );
end;
$$;

-- ---------------------------------------------------------------------
-- OS: a equipe entra na timeline
-- ---------------------------------------------------------------------
create or replace function public.trg_ordens_servico_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.os_historico (os_id, usuario_id, status_anterior_id, status_novo_id)
    values (new.id, v_uid, null, new.status_id);
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, v_uid, 'os_criada', jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id));
    if new.tecnico_id is not null then
      insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
      values (new.loja_id, v_uid, 'os_tecnico_atribuido',
              jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id, 'tecnico_id', new.tecnico_id));
    end if;
    if new.equipe_id is not null then
      insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
      values (new.loja_id, v_uid, 'os_equipe_atribuida',
              jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id, 'equipe_id', new.equipe_id));
    end if;
    return null;
  end if;

  if new.tecnico_id is distinct from old.tecnico_id then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (
      new.loja_id, v_uid,
      case when new.tecnico_id is null then 'os_tecnico_removido' else 'os_tecnico_atribuido' end,
      jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id,
                         'tecnico_id', coalesce(new.tecnico_id, old.tecnico_id), 'de', old.tecnico_id)
    );
  end if;

  if new.equipe_id is distinct from old.equipe_id then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (
      new.loja_id, v_uid,
      case when new.equipe_id is null then 'os_equipe_removida' else 'os_equipe_atribuida' end,
      jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id,
                         'equipe_id', coalesce(new.equipe_id, old.equipe_id), 'de', old.equipe_id)
    );
  end if;

  if new.titulo is distinct from old.titulo then v_campos := v_campos || 'titulo'::text; end if;
  if new.descricao is distinct from old.descricao then v_campos := v_campos || 'descricao'::text; end if;
  if new.objeto_atendimento is distinct from old.objeto_atendimento then v_campos := v_campos || 'objeto'::text; end if;
  if new.equipamento_id is distinct from old.equipamento_id then v_campos := v_campos || 'equipamento'::text; end if;
  if (new.data_agendada, new.hora_agendada) is distinct from (old.data_agendada, old.hora_agendada) then
    v_campos := v_campos || 'agendamento'::text;
  end if;
  if (new.sla_horas, new.prazo_em) is distinct from (old.sla_horas, old.prazo_em) then v_campos := v_campos || 'prazo'::text; end if;
  if new.observacoes_internas is distinct from old.observacoes_internas then v_campos := v_campos || 'observacoes_internas'::text; end if;
  if new.diagnostico is distinct from old.diagnostico then v_campos := v_campos || 'diagnostico'::text; end if;
  if new.servico_executado is distinct from old.servico_executado then v_campos := v_campos || 'servico_executado'::text; end if;
  if new.solucao is distinct from old.solucao then v_campos := v_campos || 'solucao'::text; end if;
  if new.observacoes_tecnicas is distinct from old.observacoes_tecnicas then v_campos := v_campos || 'observacoes_tecnicas'::text; end if;
  if new.desconto is distinct from old.desconto then v_campos := v_campos || 'desconto'::text; end if;

  if cardinality(v_campos) > 0 then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, v_uid, 'os_atualizada',
            jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id, 'campos', v_campos));
  end if;
  return null;
end;
$$;

revoke execute on function public.exigir_gestao_tecnicos() from public, anon, authenticated;
revoke execute on function public.salvar_equipe(uuid, integer, jsonb, jsonb) from public, anon;
revoke execute on function public.definir_equipe_ativa(uuid, boolean) from public, anon;
revoke execute on function public.excluir_equipe(uuid) from public, anon;
revoke execute on function public.listar_equipes() from public, anon;
revoke execute on function public.salvar_jornada_tecnico(uuid, jsonb) from public, anon;
revoke execute on function public.registrar_indisponibilidade(uuid, public.motivo_indisponibilidade, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.remover_indisponibilidade(uuid) from public, anon;
revoke execute on function public.disponibilidade_tecnico(uuid) from public, anon;
revoke execute on function public.tecnico_disponivel_em(uuid, timestamptz, timestamptz, text) from public, anon;

grant execute on function public.salvar_equipe(uuid, integer, jsonb, jsonb) to authenticated;
grant execute on function public.definir_equipe_ativa(uuid, boolean) to authenticated;
grant execute on function public.excluir_equipe(uuid) to authenticated;
grant execute on function public.listar_equipes() to authenticated;
grant execute on function public.salvar_jornada_tecnico(uuid, jsonb) to authenticated;
grant execute on function public.registrar_indisponibilidade(uuid, public.motivo_indisponibilidade, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.remover_indisponibilidade(uuid) to authenticated;
grant execute on function public.disponibilidade_tecnico(uuid) to authenticated;
grant execute on function public.tecnico_disponivel_em(uuid, timestamptz, timestamptz, text) to authenticated;
