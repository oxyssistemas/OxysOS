-- Fase 3 · etapa 17 — notificações internas (§43)
-- As notificações nascem dos eventos que já vão para log_eventos (um gatilho só,
-- sem espalhar chamadas pelas funções de agenda, campo e status). Quem fez a ação
-- não é avisado. "OS urgente atrasada" não tem evento: é gerada sob demanda quando
-- alguém da empresa consulta as notificações, com chave única contra repetição.

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  tipo text not null check (tipo in (
    'atendimento_iniciado', 'atendimento_pausado', 'os_finalizada', 'os_urgente_atrasada',
    'os_atribuida', 'atendimento_agendado', 'horario_alterado', 'atendimento_cancelado', 'os_cancelada')),
  titulo text not null check (length(titulo) between 1 and 120),
  mensagem text not null check (length(mensagem) between 1 and 500),
  os_id uuid,
  agendamento_id uuid,
  chave_unica text,
  criada_em timestamptz not null default now(),
  lida_em timestamptz,
  constraint notificacoes_os_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint notificacoes_agendamento_fkey foreign key (loja_id, agendamento_id)
    references public.agendamentos(loja_id, id) on delete set null (agendamento_id)
);

create index idx_notificacoes_usuario_criada on public.notificacoes (usuario_id, criada_em desc);
create index idx_notificacoes_usuario_nao_lidas on public.notificacoes (usuario_id) where lida_em is null;
create index idx_notificacoes_loja_os on public.notificacoes (loja_id, os_id);
create index idx_notificacoes_loja_agendamento on public.notificacoes (loja_id, agendamento_id);
create unique index notificacoes_chave_unica on public.notificacoes (usuario_id, chave_unica) where chave_unica is not null;

comment on table public.notificacoes is
  'Notificações in-app (§43). Geradas pelo banco a partir de log_eventos; cada usuário lê só as suas.';

alter table public.notificacoes enable row level security;

create policy notificacoes_select on public.notificacoes
  for select to authenticated
  using (usuario_id = (select auth.uid()) and loja_id = (select public.loja_operacional_id()));
-- sem políticas de escrita: gerar e marcar como lida passam pelo banco

-- ---------------------------------------------------------------------------
-- destinatários (internas)
-- ---------------------------------------------------------------------------

-- quem acompanha o campo: o dono e quem tem dispatch.view
create or replace function public.gestores_notificacao(p_loja uuid, p_exceto uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select u.id
  from public.usuarios u
  join public.cargos c on c.id = u.cargo_id and c.loja_id = u.loja_id and c.ativo
  where u.loja_id = p_loja and u.ativo and u.id is distinct from p_exceto
    and (c.chave = 'owner'
         or exists (select 1 from public.cargo_permissoes cp
                    where cp.cargo_id = c.id and cp.permissao_chave = 'dispatch.view'));
$function$;

-- login do técnico e dos membros da equipe (ativos)
create or replace function public.usuarios_de_campo(p_loja uuid, p_tecnico uuid, p_equipe uuid, p_exceto uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select distinct u.id
  from public.tecnicos t
  join public.usuarios u on u.id = t.usuario_id and u.loja_id = t.loja_id and u.ativo
  where t.loja_id = p_loja and t.ativo and u.id is distinct from p_exceto
    and (t.id = p_tecnico
         or t.id in (select m.tecnico_id from public.equipe_membros m
                     where m.equipe_id = p_equipe and m.loja_id = p_loja));
$function$;

-- ---------------------------------------------------------------------------
-- gatilho: log_eventos → notificacoes
-- ---------------------------------------------------------------------------
create or replace function public.trg_log_eventos_notificar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d jsonb := new.detalhes;
  v_os uuid;
  v_ag uuid;
  v_rotulo text;
  v_ator text;
  v_tec_nome text;
  v_categoria public.categoria_status;
  v_ag_tecnico uuid;
  v_ag_equipe uuid;
  v_ag_inicio timestamptz;
  v_quando text;
  v_usuario uuid;
begin
  begin
    v_os := nullif(d->>'os_id', '')::uuid;
    if v_os is null then
      return null;
    end if;
    v_ag := nullif(d->>'agendamento_id', '')::uuid;

    select coalesce(os.numero, 'OS') || ' · ' || c.nome into v_rotulo
    from public.ordens_servico os join public.clientes c on c.id = os.cliente_id
    where os.id = v_os and os.loja_id = new.loja_id;
    if v_rotulo is null then
      return null;
    end if;
    select nome into v_ator from public.usuarios where id = new.usuario_id;
    select nullif(btrim(coalesce(t.nome, '') || ' ' || coalesce(t.sobrenome, '')), '') into v_tec_nome
    from public.tecnicos t where t.id = nullif(d->>'tecnico_id', '')::uuid and t.loja_id = new.loja_id;

    if v_ag is not null then
      select a.tecnico_id, a.equipe_id, a.inicio_em into v_ag_tecnico, v_ag_equipe, v_ag_inicio
      from public.agendamentos a where a.id = v_ag and a.loja_id = new.loja_id;
      v_quando := to_char(v_ag_inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
    end if;

    case new.acao
    -- ---------------- para quem acompanha o campo ----------------
    when 'os_atendimento_iniciado' then
      insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id, agendamento_id)
      select new.loja_id, g, 'atendimento_iniciado', 'Atendimento iniciado',
             coalesce(v_tec_nome, v_ator, 'O técnico') || ' iniciou o atendimento · ' || v_rotulo, v_os, v_ag
      from public.gestores_notificacao(new.loja_id, new.usuario_id) g;

    when 'os_atendimento_pausado' then
      insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id, agendamento_id)
      select new.loja_id, g, 'atendimento_pausado', 'Atendimento pausado',
             left(coalesce(v_tec_nome, v_ator, 'O técnico') || ' pausou · ' || v_rotulo
                  || coalesce(' · ' || case d->>'motivo'
                                          when 'almoco' then 'almoço'
                                          when 'aguardando_cliente' then 'aguardando cliente'
                                          when 'aguardando_peca' then 'aguardando peça'
                                          when 'problema_tecnico' then 'problema técnico'
                                          when 'outro' then 'outro motivo' end, ''), 500),
             v_os, v_ag
      from public.gestores_notificacao(new.loja_id, new.usuario_id) g;

    when 'os_status_alterado' then
      select categoria into v_categoria from public.status_os
      where id = nullif(d->>'para', '')::uuid and loja_id = new.loja_id;
      if v_categoria = 'finalizado_sucesso' then
        insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id)
        select new.loja_id, g, 'os_finalizada', 'OS finalizada',
               v_rotulo || coalesce(' · por ' || v_ator, ''), v_os
        from public.gestores_notificacao(new.loja_id, new.usuario_id) g;
      elsif v_categoria = 'finalizado_cancelado' then
        -- técnico e equipe da OS e de todas as visitas dela
        insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id)
        select new.loja_id, x.u, 'os_cancelada', 'OS cancelada',
               left(v_rotulo || coalesce(' · ' || (d->>'observacao'), ''), 500), v_os
        from (
          select public.usuarios_de_campo(new.loja_id, os.tecnico_id, os.equipe_id, new.usuario_id) as u
          from public.ordens_servico os where os.id = v_os
          union
          select public.usuarios_de_campo(new.loja_id, a.tecnico_id, a.equipe_id, new.usuario_id)
          from public.agendamentos a where a.os_id = v_os and a.loja_id = new.loja_id
        ) x;
      end if;

    -- ---------------- para o técnico ----------------
    when 'os_tecnico_atribuido', 'os_equipe_atribuida' then
      insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id)
      select new.loja_id, u, 'os_atribuida', 'Nova OS atribuída', v_rotulo, v_os
      from public.usuarios_de_campo(new.loja_id,
                                    case when new.acao = 'os_tecnico_atribuido' then nullif(d->>'tecnico_id', '')::uuid end,
                                    case when new.acao = 'os_equipe_atribuida' then nullif(d->>'equipe_id', '')::uuid end,
                                    new.usuario_id) u
      where not exists (select 1 from public.notificacoes n
                        where n.usuario_id = u and n.os_id = v_os and n.criada_em = now()
                          and n.tipo = 'os_atribuida');

    when 'os_agendada', 'os_reagendada' then
      for v_usuario in select public.usuarios_de_campo(new.loja_id, v_ag_tecnico, v_ag_equipe, new.usuario_id) loop
        -- a atribuição da OS feita junto (mesma transação) vira um aviso só
        update public.notificacoes
           set tipo = 'atendimento_agendado', titulo = 'Novo atendimento agendado',
               mensagem = left(v_rotulo || coalesce(' · ' || v_quando, ''), 500), agendamento_id = v_ag
         where usuario_id = v_usuario and os_id = v_os and criada_em = now() and tipo = 'os_atribuida';
        if not found then
          insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id, agendamento_id)
          values (new.loja_id, v_usuario,
                  case when new.acao = 'os_agendada' then 'atendimento_agendado' else 'horario_alterado' end,
                  case when new.acao = 'os_agendada' then 'Novo atendimento agendado' else 'Horário alterado' end,
                  left(v_rotulo || coalesce(' · ' || v_quando, ''), 500), v_os, v_ag);
        end if;
      end loop;

    when 'os_agendamento_cancelado' then
      insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id, agendamento_id)
      select new.loja_id, u, 'atendimento_cancelado', 'Atendimento cancelado',
             left(v_rotulo || coalesce(' · ' || v_quando, '') || coalesce(' · ' || (d->>'observacao'), ''), 500), v_os, v_ag
      from public.usuarios_de_campo(new.loja_id, v_ag_tecnico, v_ag_equipe, new.usuario_id) u;

    else
      null;
    end case;
  exception when others then
    -- aviso nunca derruba a operação que o gerou
    raise warning 'notificação não gerada (%): %', new.acao, sqlerrm;
  end;
  return null;
end;
$function$;

create trigger log_eventos_notificar
  after insert on public.log_eventos
  for each row
  when (new.acao in ('os_atendimento_iniciado', 'os_atendimento_pausado', 'os_status_alterado',
                     'os_tecnico_atribuido', 'os_equipe_atribuida', 'os_agendada', 'os_reagendada',
                     'os_agendamento_cancelado'))
  execute function public.trg_log_eventos_notificar();

-- ---------------------------------------------------------------------------
-- OS urgente atrasada (sob demanda, uma vez por prazo)
-- ---------------------------------------------------------------------------
create or replace function public.gerar_alertas_atraso(p_loja uuid)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.notificacoes (loja_id, usuario_id, tipo, titulo, mensagem, os_id, chave_unica)
  select os.loja_id, g, 'os_urgente_atrasada', 'OS urgente atrasada',
         coalesce(os.numero, 'OS') || ' · ' || c.nome || ' · prazo '
           || to_char(os.prazo_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
         os.id, 'atraso:' || os.id || ':' || extract(epoch from os.prazo_em)::bigint
  from public.ordens_servico os
  join public.prioridades_os p on p.id = os.prioridade_id and p.loja_id = os.loja_id and p.nivel = 'urgente'
  join public.status_os s on s.id = os.status_id and s.loja_id = os.loja_id
  join public.clientes c on c.id = os.cliente_id
  cross join lateral public.gestores_notificacao(os.loja_id, null) g
  where os.loja_id = p_loja
    and os.prazo_em < now()
    and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado')
  on conflict (usuario_id, chave_unica) where chave_unica is not null do nothing;
$function$;

-- ---------------------------------------------------------------------------
-- RPCs do usuário
-- ---------------------------------------------------------------------------
create or replace function public.minhas_notificacoes(p_limite integer default 30)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_limite int := least(greatest(coalesce(p_limite, 30), 1), 100);
begin
  if v_loja is null then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;

  perform public.gerar_alertas_atraso(v_loja);
  -- guarda 90 dias
  delete from public.notificacoes where usuario_id = v_uid and criada_em < now() - interval '90 days';

  return jsonb_build_object(
    'nao_lidas', (select count(*) from public.notificacoes
                  where usuario_id = v_uid and loja_id = v_loja and lida_em is null),
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'tipo', n.tipo, 'titulo', n.titulo, 'mensagem', n.mensagem,
               'os_id', n.os_id, 'agendamento_id', n.agendamento_id,
               'criada_em', n.criada_em, 'lida_em', n.lida_em)
             order by n.criada_em desc, n.id), '[]'::jsonb)
      from (select * from public.notificacoes
            where usuario_id = v_uid and loja_id = v_loja
            order by criada_em desc, id limit v_limite) n));
end;
$function$;

-- null marca todas as do usuário
create or replace function public.marcar_notificacoes_lidas(p_ids uuid[] default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_n integer;
begin
  if v_loja is null then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  update public.notificacoes
     set lida_em = now()
   where usuario_id = auth.uid() and loja_id = v_loja and lida_em is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.gestores_notificacao(uuid, uuid) from public, anon, authenticated;
revoke all on function public.usuarios_de_campo(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.trg_log_eventos_notificar() from public, anon, authenticated;
revoke all on function public.gerar_alertas_atraso(uuid) from public, anon, authenticated;
revoke all on function public.minhas_notificacoes(integer) from public, anon;
revoke all on function public.marcar_notificacoes_lidas(uuid[]) from public, anon;
grant execute on function public.minhas_notificacoes(integer) to authenticated;
grant execute on function public.marcar_notificacoes_lidas(uuid[]) to authenticated;
