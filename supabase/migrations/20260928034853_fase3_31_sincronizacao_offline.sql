-- Fase 3 · etapa 18 — sincronização do modo offline (§46 a §48)
-- O portal do técnico guarda no aparelho o que foi feito sem internet e manda
-- depois por estas funções. Cada operação traz uma chave (idempotência: repetir
-- o envio não aplica de novo nem gera evento repetido) e a versão que o técnico
-- viu (conflito: se alguém mudou o mesmo dado no meio tempo, nada é sobrescrito
-- em silêncio — a operação volta como conflito para o técnico decidir).
-- Só vale para planos com a feature offline_mode.

create table public.sync_operacoes (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  chave uuid not null,
  loja_id uuid not null references public.lojas(id) on delete cascade,
  tipo text not null check (tipo in ('checklist', 'atendimento')),
  resultado jsonb not null,
  criada_em timestamptz not null default now(),
  primary key (usuario_id, chave)
);

create index idx_sync_operacoes_loja on public.sync_operacoes (loja_id);

comment on table public.sync_operacoes is
  'Registro de idempotência das operações feitas offline no portal do técnico (§48). Só o banco lê e grava.';

alter table public.sync_operacoes enable row level security;
-- sem políticas: acesso só pelas funções abaixo

-- resultado já registrado para esta chave (null = operação nova)
create or replace function public.sync_resultado_anterior(p_chave uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select resultado || jsonb_build_object('repetida', true)
  from public.sync_operacoes where usuario_id = auth.uid() and chave = p_chave;
$function$;

create or replace function public.sync_exigir_offline()
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if public.loja_operacional_id() is null or not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if not public.tem_feature('offline_mode') then
    raise exception 'O modo offline não faz parte do plano da empresa.' using errcode = '42501';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- resposta de checklist feita offline
-- p_base: respondido_em que o técnico viu quando respondeu (null = nunca respondido)
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_resposta_checklist(
  p_chave uuid, p_item_id uuid, p_resposta jsonb, p_base timestamptz)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_anterior jsonb;
  v_item public.os_checklist_itens;
  v_quem text;
  v_resultado jsonb;
begin
  perform public.sync_exigir_offline();
  if p_chave is null then
    raise exception 'Operação sem chave.' using errcode = '22023';
  end if;
  v_anterior := public.sync_resultado_anterior(p_chave);
  if v_anterior is not null then
    return v_anterior;
  end if;

  select * into v_item from public.os_checklist_itens where id = p_item_id and loja_id = v_loja for update;
  if v_item.id is null then
    raise exception 'Item do checklist não encontrado.' using errcode = 'P0002';
  end if;

  if v_item.respondido_em is distinct from p_base then
    select nome into v_quem from public.usuarios where id = v_item.respondido_por;
    v_resultado := jsonb_build_object(
      'status', 'conflito',
      'servidor', jsonb_build_object(
        'valor_booleano', v_item.valor_booleano, 'valor_texto', v_item.valor_texto,
        'valor_numero', v_item.valor_numero, 'valor_data', v_item.valor_data,
        'valor_hora', v_item.valor_hora, 'valor_opcao', v_item.valor_opcao,
        'respondido_em', v_item.respondido_em, 'respondido_por', v_quem));
  else
    -- a própria função de resposta valida permissão, OS aberta e o valor
    perform public.responder_item_checklist(p_item_id, p_resposta);
    select respondido_em into v_item.respondido_em from public.os_checklist_itens where id = p_item_id;
    v_resultado := jsonb_build_object('status', 'aplicado', 'respondido_em', v_item.respondido_em);
  end if;

  insert into public.sync_operacoes (usuario_id, chave, loja_id, tipo, resultado)
  values (auth.uid(), p_chave, v_loja, 'checklist', v_resultado);
  delete from public.sync_operacoes where usuario_id = auth.uid() and criada_em < now() - interval '30 days';
  return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------------
-- registro do atendimento (diagnóstico etc.) feito offline — conflito por campo
-- p_base: valor de cada campo que o técnico viu antes de editar
-- ---------------------------------------------------------------------------
create or replace function public.sincronizar_atendimento_campo(
  p_chave uuid, p_agendamento_id uuid, p_dados jsonb, p_base jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_anterior jsonb;
  v_atual jsonb;
  v_chave text;
  v_aplicar jsonb := '{}'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_servidor text;
  v_resultado jsonb;
begin
  perform public.sync_exigir_offline();
  if p_chave is null or p_dados is null or jsonb_typeof(p_dados) <> 'object'
     or (p_base is not null and jsonb_typeof(p_base) <> 'object') then
    raise exception 'Operação inválida.' using errcode = '22023';
  end if;
  v_anterior := public.sync_resultado_anterior(p_chave);
  if v_anterior is not null then
    return v_anterior;
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
           'diagnostico', os.diagnostico, 'causa', os.causa, 'servico_executado', os.servico_executado,
           'solucao', os.solucao, 'recomendacao', os.recomendacao, 'observacoes_tecnicas', os.observacoes_tecnicas)
    into v_atual
  from public.agendamentos a join public.ordens_servico os on os.id = a.os_id
  where a.id = p_agendamento_id and a.loja_id = v_loja
  for update of os;

  for v_chave in select jsonb_object_keys(p_dados) loop
    if not v_atual ? v_chave then
      raise exception 'Campo não permitido: %.', v_chave using errcode = '22023';
    end if;
    v_servidor := v_atual->>v_chave;
    -- mudou no servidor desde que o técnico viu, e para outra coisa: não sobrescreve
    if coalesce(v_servidor, '') <> coalesce(p_base->>v_chave, '')
       and coalesce(v_servidor, '') <> coalesce(btrim(p_dados->>v_chave), '') then
      v_conflitos := v_conflitos || jsonb_build_object('campo', v_chave, 'servidor', v_servidor, 'seu', p_dados->>v_chave);
    else
      v_aplicar := v_aplicar || jsonb_build_object(v_chave, p_dados->v_chave);
    end if;
  end loop;

  if v_aplicar <> '{}'::jsonb then
    -- validações de permissão, OS aberta e tamanho ficam na função de sempre
    perform public.registrar_atendimento_campo(p_agendamento_id, v_aplicar);
  end if;

  v_resultado := jsonb_build_object(
    'status', case when jsonb_array_length(v_conflitos) = 0 then 'aplicado'
                   when v_aplicar = '{}'::jsonb then 'conflito' else 'parcial' end,
    'aplicados', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_aplicar) k),
    'conflitos', v_conflitos);

  insert into public.sync_operacoes (usuario_id, chave, loja_id, tipo, resultado)
  values (auth.uid(), p_chave, v_loja, 'atendimento', v_resultado);
  delete from public.sync_operacoes where usuario_id = auth.uid() and criada_em < now() - interval '30 days';
  return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------------
-- contexto do portal: o aparelho só guarda dados se o plano tiver offline_mode
-- ---------------------------------------------------------------------------
create or replace function public.contexto_tecnico()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
    -- dados no aparelho e fila offline só com a feature do plano (§45/§56)
    'offline', public.tem_feature('offline_mode'),
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
$function$;

revoke all on function public.sync_resultado_anterior(uuid) from public, anon, authenticated;
revoke all on function public.sync_exigir_offline() from public, anon, authenticated;
revoke all on function public.sincronizar_resposta_checklist(uuid, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.sincronizar_atendimento_campo(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.sincronizar_resposta_checklist(uuid, uuid, jsonb, timestamptz) to authenticated;
grant execute on function public.sincronizar_atendimento_campo(uuid, uuid, jsonb, jsonb) to authenticated;
