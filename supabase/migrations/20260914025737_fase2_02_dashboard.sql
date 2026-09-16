-- =====================================================================
-- Fase 2 · 02 · Dashboard do Portal da Empresa
--
-- 1. Evento "cliente_cadastrado" gravado pelo banco (não depende do front)
-- 2. RPC dashboard_resumo(periodo): cards, OS por status, por período e por responsável
-- 3. RPC dashboard_atividade(): feed de atividade recente com nomes resolvidos
--
-- Tudo escopado pela empresa do usuário logado (loja_operacional_id) e pelas
-- permissões/features: seções sem acesso voltam null. Métricas sem fonte real
-- ainda (técnicos, equipamentos, prioridade, atraso/SLA, faturamento) voltam null.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Atividade: cadastro de cliente
-- ---------------------------------------------------------------------
create or replace function public.trg_clientes_log_cadastro()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (new.loja_id, auth.uid(), 'cliente_cadastrado', jsonb_build_object('cliente_id', new.id));
  return new;
end;
$$;

create trigger clientes_log_cadastro
  after insert on public.clientes
  for each row execute function public.trg_clientes_log_cadastro();

-- Índices usados pelas agregações do dashboard
create index if not exists idx_os_historico_status_novo_criado_em
  on public.os_historico(status_novo_id, criado_em);
create index if not exists idx_clientes_loja_criado_em
  on public.clientes(loja_id, criado_em desc);

-- ---------------------------------------------------------------------
-- 2. Resumo do dashboard
--    p_inicio inclusive, p_fim exclusivo; p_fuso para agrupar por dia/mês local
-- ---------------------------------------------------------------------
create or replace function public.dashboard_resumo(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_fuso text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_ver_os boolean;
  v_ver_clientes boolean;
  v_campo_data text;
  v_passo interval;
  v_cards jsonb;
  v_por_status jsonb;
  v_por_periodo jsonb;
  v_por_responsavel jsonb;
begin
  if v_loja is null or not public.tem_permissao('dashboard.view') then
    raise exception 'Acesso negado ao dashboard.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_fim - p_inicio > interval '367 days' then
    raise exception 'O período máximo é de 1 ano.' using errcode = '22023';
  end if;

  begin
    perform now() at time zone p_fuso;
  exception when others then
    p_fuso := 'America/Sao_Paulo';
  end;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');

  if p_fim - p_inicio <= interval '62 days' then
    v_campo_data := 'day';
    v_passo := interval '1 day';
  else
    v_campo_data := 'month';
    v_passo := interval '1 month';
  end if;

  -- Cards ------------------------------------------------------------
  v_cards := jsonb_build_object(
    'os_abertas', null, 'os_em_andamento', null, 'os_pausadas', null,
    'os_criadas_periodo', null, 'os_finalizadas_periodo', null,
    'clientes_total', null, 'clientes_novos_periodo', null,
    -- sem fonte de dados nesta fase:
    'os_atrasadas', null, 'tecnicos_ativos', null, 'equipamentos', null, 'faturamento_periodo', null
  );

  if v_ver_os then
    select v_cards || jsonb_build_object(
      'os_abertas', count(*) filter (where s.categoria = 'aberto'),
      'os_em_andamento', count(*) filter (where s.categoria = 'em_andamento'),
      'os_pausadas', count(*) filter (where s.categoria = 'pausado'),
      'os_criadas_periodo', count(*) filter (where os.criado_em >= p_inicio and os.criado_em < p_fim)
    )
    into v_cards
    from public.ordens_servico os
    join public.status_os s on s.id = os.status_id
    where os.loja_id = v_loja;

    select v_cards || jsonb_build_object('os_finalizadas_periodo', count(distinct h.os_id))
    into v_cards
    from public.os_historico h
    join public.ordens_servico os on os.id = h.os_id and os.loja_id = v_loja
    join public.status_os s on s.id = h.status_novo_id and s.loja_id = v_loja
    where s.categoria = 'finalizado_sucesso'
      and h.criado_em >= p_inicio and h.criado_em < p_fim;
  end if;

  if v_ver_clientes then
    select v_cards || jsonb_build_object(
      'clientes_total', count(*),
      'clientes_novos_periodo', count(*) filter (where c.criado_em >= p_inicio and c.criado_em < p_fim)
    )
    into v_cards
    from public.clientes c
    where c.loja_id = v_loja;
  end if;

  if not v_ver_os then
    return jsonb_build_object(
      'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                    'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
      'cards', v_cards,
      'os_por_status', null, 'os_por_periodo', null, 'os_por_responsavel', null, 'os_por_prioridade', null
    );
  end if;

  -- OS criadas no período, pelo status atual ---------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nome', t.nome, 'cor', t.cor, 'categoria', t.categoria, 'total', t.total)
         order by t.ordem, t.nome), '[]'::jsonb)
  into v_por_status
  from (
    select s.id, s.nome, s.cor, s.categoria, s.ordem, count(os.id) as total
    from public.status_os s
    left join public.ordens_servico os
      on os.status_id = s.id and os.loja_id = v_loja
     and os.criado_em >= p_inicio and os.criado_em < p_fim
    where s.loja_id = v_loja
    group by s.id
  ) t;

  -- Série temporal: criadas x finalizadas -----------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
           'inicio', to_char(b.bucket, 'YYYY-MM-DD'),
           'criadas', coalesce(c.total, 0),
           'finalizadas', coalesce(f.total, 0))
         order by b.bucket), '[]'::jsonb)
  into v_por_periodo
  from generate_series(
         date_trunc(v_campo_data, p_inicio at time zone p_fuso),
         date_trunc(v_campo_data, (p_fim - interval '1 microsecond') at time zone p_fuso),
         v_passo
       ) as b(bucket)
  left join (
    select date_trunc(v_campo_data, os.criado_em at time zone p_fuso) as bucket, count(*) as total
    from public.ordens_servico os
    where os.loja_id = v_loja and os.criado_em >= p_inicio and os.criado_em < p_fim
    group by 1
  ) c on c.bucket = b.bucket
  left join (
    select date_trunc(v_campo_data, h.criado_em at time zone p_fuso) as bucket, count(distinct h.os_id) as total
    from public.os_historico h
    join public.ordens_servico os on os.id = h.os_id and os.loja_id = v_loja
    join public.status_os s on s.id = h.status_novo_id and s.loja_id = v_loja
    where s.categoria = 'finalizado_sucesso' and h.criado_em >= p_inicio and h.criado_em < p_fim
    group by 1
  ) f on f.bucket = b.bucket;

  -- OS criadas no período por responsável -----------------------------
  -- (até o módulo de técnicos existir, o responsável é o usuário atribuído à OS)
  select coalesce(jsonb_agg(jsonb_build_object('id', t.responsavel_id, 'nome', t.nome, 'total', t.total)
         order by t.total desc, t.nome), '[]'::jsonb)
  into v_por_responsavel
  from (
    select os.responsavel_id, coalesce(u.nome, 'Sem responsável') as nome, count(*) as total
    from public.ordens_servico os
    left join public.usuarios u on u.id = os.responsavel_id and u.loja_id = v_loja
    where os.loja_id = v_loja and os.criado_em >= p_inicio and os.criado_em < p_fim
    group by os.responsavel_id, u.nome
    order by count(*) desc
    limit 50
  ) t;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                  'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
    'cards', v_cards,
    'os_por_status', v_por_status,
    'os_por_periodo', v_por_periodo,
    'os_por_responsavel', v_por_responsavel,
    'os_por_prioridade', null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Atividade recente
--    Nomes são resolvidos sempre dentro da própria empresa: um "detalhes"
--    forjado apontando para registros de outra empresa não revela nada.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_atividade(p_limite int default 15)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_limite, 15), 1), 50);
  v_ver_os boolean;
  v_ver_clientes boolean;
  v_ver_equipe boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_permissao('dashboard.view') then
    raise exception 'Acesso negado ao dashboard.' using errcode = '42501';
  end if;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');
  v_ver_equipe := public.tem_permissao('team.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'acao', t.acao,
           'criado_em', t.criado_em,
           'usuario', t.usuario_nome,
           'os', case when t.os_id is null then null
                      else jsonb_build_object('id', t.os_id, 'cliente', t.os_cliente) end,
           'status_novo', t.status_novo,
           'cliente', t.cliente_nome,
           'funcionario', t.funcionario_nome)
         order by t.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      e.id, e.acao, e.criado_em,
      u.nome as usuario_nome,
      os.id as os_id,
      cos.nome as os_cliente,
      st.nome as status_novo,
      cli.nome as cliente_nome,
      fu.nome as funcionario_nome
    from public.log_eventos e
    left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
    left join public.ordens_servico os on os.id::text = e.detalhes->>'os_id' and os.loja_id = v_loja
    left join public.clientes cos on cos.id = os.cliente_id and cos.loja_id = v_loja
    left join public.status_os st on st.id::text = e.detalhes->>'para' and st.loja_id = v_loja
    left join public.clientes cli on cli.id::text = e.detalhes->>'cliente_id' and cli.loja_id = v_loja
    left join public.usuarios fu on fu.id::text = e.detalhes->>'funcionario_id' and fu.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        (e.acao like 'os\_%' and v_ver_os)
        or (e.acao like 'cliente\_%' and v_ver_clientes)
        or (e.acao like 'funcionario\_%' and v_ver_equipe)
      )
      -- o fluxo atual grava "status alterado" junto de "reparo iniciado"/"OS concluída":
      -- mostra só o evento mais específico
      and not (
        e.acao = 'os_status_alterado'
        and exists (
          select 1 from public.log_eventos e2
          where e2.loja_id = v_loja
            and e2.acao in ('os_reparo_iniciado', 'os_concluida')
            and e2.detalhes->>'os_id' = e.detalhes->>'os_id'
            and e2.usuario_id is not distinct from e.usuario_id
            and e2.criado_em between e.criado_em and e.criado_em + interval '10 seconds'
        )
      )
    order by e.criado_em desc
    limit v_limite
  ) t;

  return v_resultado;
end;
$$;

revoke execute on function public.trg_clientes_log_cadastro() from public, anon, authenticated;
revoke execute on function public.dashboard_resumo(timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.dashboard_atividade(int) from public, anon;
grant execute on function public.dashboard_resumo(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.dashboard_atividade(int) to authenticated;
