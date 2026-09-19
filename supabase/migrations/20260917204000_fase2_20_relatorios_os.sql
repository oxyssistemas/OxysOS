-- =====================================================================
-- Fase 2 · 20 — Relatórios iniciais (etapa 14)
-- Só indicadores com fonte de dados nesta fase: OS por período, status,
-- técnico e prioridade; tempo médio de atendimento (quando houver
-- amostra suficiente); clientes com mais OS; equipamentos com mais
-- chamados. Tudo calculado no banco, limitado à empresa do usuário e à
-- permissão reports.view.
-- =====================================================================

create or replace function public.relatorio_os(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_fuso text default 'America/Sao_Paulo',
  p_tecnico uuid default null,
  p_tipo uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_campo_data text;
  v_passo interval;
  v_min_amostra constant int := 3;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('reports.view') then
    raise exception 'Sem acesso aos relatórios.' using errcode = '42501';
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

  if p_tecnico is not null and not exists (select 1 from public.tecnicos where id = p_tecnico and loja_id = v_loja) then
    raise exception 'Técnico não encontrado nesta empresa.' using errcode = 'P0002';
  end if;
  if p_tipo is not null and not exists (select 1 from public.tipos_servico where id = p_tipo and loja_id = v_loja) then
    raise exception 'Tipo de serviço não encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  if p_fim - p_inicio <= interval '62 days' then
    v_campo_data := 'day';
    v_passo := interval '1 day';
  else
    v_campo_data := 'month';
    v_passo := interval '1 month';
  end if;

  with base as (
    -- OS abertas no período, já com a categoria do status atual
    select os.id, os.cliente_id, os.equipamento_id, os.tecnico_id, os.status_id, os.prioridade_id,
           os.criado_em, os.iniciado_em, os.concluido_em, os.prazo_em, s.categoria
    from public.ordens_servico os
    join public.status_os s on s.id = os.status_id
    where os.loja_id = v_loja
      and os.criado_em >= p_inicio and os.criado_em < p_fim
      and (p_tecnico is null or os.tecnico_id = p_tecnico)
      and (p_tipo is null or os.tipo_servico_id = p_tipo)
  ),
  concluidas as (
    select *, extract(epoch from (concluido_em - criado_em)) as segundos_total,
           case when iniciado_em is not null then extract(epoch from (concluido_em - iniciado_em)) end as segundos_execucao
    from base
    where categoria = 'finalizado_sucesso' and concluido_em is not null
  ),
  resumo as (
    select jsonb_build_object(
             'criadas', (select count(*) from base),
             'em_aberto', (select count(*) from base where categoria not in ('finalizado_sucesso', 'finalizado_cancelado')),
             'finalizadas', (select count(*) from base where categoria = 'finalizado_sucesso'),
             'canceladas', (select count(*) from base where categoria = 'finalizado_cancelado'),
             'amostra_tempo_total', (select count(*) from concluidas),
             'tempo_medio_horas', (select case when count(*) >= v_min_amostra
                                            then round((avg(segundos_total) / 3600)::numeric, 1) end from concluidas),
             'amostra_tempo_execucao', (select count(*) from concluidas where segundos_execucao is not null),
             'tempo_execucao_medio_horas', (select case when count(*) >= v_min_amostra
                                                    then round((avg(segundos_execucao) / 3600)::numeric, 1) end
                                            from concluidas where segundos_execucao is not null),
             'com_prazo', (select count(*) from concluidas where prazo_em is not null),
             'no_prazo', (select count(*) from concluidas where prazo_em is not null and concluido_em <= prazo_em),
             'com_atraso', (select count(*) from concluidas where prazo_em is not null and concluido_em > prazo_em)
           ) as j
  ),
  finalizadas_bucket as (
    -- finalizações ocorridas no período (pela data da troca de status)
    select date_trunc(v_campo_data, h.criado_em at time zone p_fuso) as bucket, count(distinct h.os_id) as total
    from public.os_historico h
    join public.ordens_servico os on os.id = h.os_id and os.loja_id = v_loja
    join public.status_os s on s.id = h.status_novo_id and s.loja_id = v_loja
    where s.categoria = 'finalizado_sucesso'
      and h.criado_em >= p_inicio and h.criado_em < p_fim
      and (p_tecnico is null or os.tecnico_id = p_tecnico)
      and (p_tipo is null or os.tipo_servico_id = p_tipo)
    group by 1
  ),
  criadas_bucket as (
    select date_trunc(v_campo_data, criado_em at time zone p_fuso) as bucket, count(*) as total
    from base
    group by 1
  ),
  serie as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'inicio', to_char(b.bucket, 'YYYY-MM-DD'),
             'criadas', coalesce(c.total, 0),
             'finalizadas', coalesce(f.total, 0))
           order by b.bucket), '[]'::jsonb) as j
    from generate_series(
           date_trunc(v_campo_data, p_inicio at time zone p_fuso),
           date_trunc(v_campo_data, (p_fim - interval '1 microsecond') at time zone p_fuso),
           v_passo
         ) as b(bucket)
    left join criadas_bucket c on c.bucket = b.bucket
    left join finalizadas_bucket f on f.bucket = b.bucket
  ),
  por_status as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'nome', t.nome, 'cor', t.cor, 'categoria', t.categoria, 'total', t.total)
           order by t.ordem, t.nome), '[]'::jsonb) as j
    from (
      select s.id, s.nome, s.cor, s.categoria, s.ordem, count(o.id) as total
      from public.status_os s
      left join base o on o.status_id = s.id
      where s.loja_id = v_loja
      group by s.id
      having count(o.id) > 0 or s.ativo
    ) t
  ),
  por_prioridade as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'nome', t.nome, 'cor', t.cor, 'nivel', t.nivel, 'total', t.total)
           order by t.ordem, t.nome), '[]'::jsonb) as j
    from (
      select p.id, p.nome, p.cor, p.nivel, p.ordem, count(o.id) as total
      from public.prioridades_os p
      left join base o on o.prioridade_id = p.id
      where p.loja_id = v_loja
      group by p.id
      having count(o.id) > 0 or p.ativo
    ) t
  ),
  por_tecnico as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.tecnico_id, 'nome', t.nome, 'total', t.total,
             'finalizadas', t.finalizadas, 'tempo_medio_horas', t.tempo_medio)
           order by t.total desc, t.nome), '[]'::jsonb) as j
    from (
      select o.tecnico_id,
             coalesce(nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), ''), 'Sem técnico') as nome,
             count(*) as total,
             count(*) filter (where o.categoria = 'finalizado_sucesso') as finalizadas,
             case when count(*) filter (where o.categoria = 'finalizado_sucesso' and o.concluido_em is not null) >= v_min_amostra
                  then round((avg(extract(epoch from (o.concluido_em - o.criado_em)))
                               filter (where o.categoria = 'finalizado_sucesso' and o.concluido_em is not null) / 3600)::numeric, 1)
             end as tempo_medio
      from base o
      left join public.tecnicos tec on tec.id = o.tecnico_id and tec.loja_id = v_loja
      group by o.tecnico_id, tec.nome, tec.sobrenome
      order by count(*) desc
      limit 50
    ) t
  ),
  clientes as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'nome', t.nome, 'total', t.total, 'finalizadas', t.finalizadas)
           order by t.total desc, t.nome), '[]'::jsonb) as j
    from (
      select c.id, c.nome, count(*) as total,
             count(*) filter (where o.categoria = 'finalizado_sucesso') as finalizadas
      from base o
      join public.clientes c on c.id = o.cliente_id and c.loja_id = v_loja
      group by c.id, c.nome
      order by count(*) desc, c.nome
      limit 10
    ) t
  ),
  equipamentos as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'nome', t.nome, 'cliente', t.cliente, 'total', t.total)
           order by t.total desc, t.nome), '[]'::jsonb) as j
    from (
      select e.id, e.nome, c.nome as cliente, count(*) as total
      from base o
      join public.equipamentos e on e.id = o.equipamento_id and e.loja_id = v_loja
      left join public.clientes c on c.id = e.cliente_id and c.loja_id = v_loja
      group by e.id, e.nome, c.nome
      order by count(*) desc, e.nome
      limit 10
    ) t
  )
  select jsonb_build_object(
           'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                         'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
           'filtros', jsonb_build_object('tecnico_id', p_tecnico, 'tipo_servico_id', p_tipo),
           'amostra_minima', v_min_amostra,
           'resumo', (select j from resumo),
           'os_por_periodo', (select j from serie),
           'os_por_status', (select j from por_status),
           'os_por_prioridade', (select j from por_prioridade),
           'os_por_tecnico', (select j from por_tecnico),
           'clientes', (select j from clientes),
           'equipamentos', (select j from equipamentos)
         )
  into v_resultado;

  -- listas que dependem de outros módulos: null quando a empresa não tem acesso
  if not (public.tem_feature('customers') and public.tem_permissao('customers.view')) then
    v_resultado := jsonb_set(v_resultado, '{clientes}', 'null'::jsonb);
  end if;
  if not (public.tem_feature('assets') and public.tem_permissao('assets.view')) then
    v_resultado := jsonb_set(v_resultado, '{equipamentos}', 'null'::jsonb);
  end if;

  return v_resultado;
end;
$$;

revoke execute on function public.relatorio_os(timestamptz, timestamptz, text, uuid, uuid) from public, anon;
grant execute on function public.relatorio_os(timestamptz, timestamptz, text, uuid, uuid) to authenticated;
