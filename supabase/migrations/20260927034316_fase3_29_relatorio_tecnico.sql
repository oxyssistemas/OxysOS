-- Fase 3 · etapa 16 — relatório técnico (§41)
-- O relatório é montado no banco com uma estrutura estável (pronta para um PDF
-- futuro) e congelado em os_relatorios quando a OS é finalizada. Reabrir e
-- finalizar de novo gera outra versão; as anteriores ficam. Antes de finalizar,
-- a leitura devolve uma prévia com os dados atuais. Sem valores: o que custou
-- é assunto do recibo.

create table public.os_relatorios (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  os_id uuid not null,
  versao integer not null check (versao >= 1),
  conteudo jsonb not null,
  gerado_em timestamptz not null default now(),
  gerado_por uuid references public.usuarios(id) on delete set null,
  constraint os_relatorios_os_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint os_relatorios_versao_unica unique (os_id, versao)
);

create index idx_os_relatorios_loja_os on public.os_relatorios (loja_id, os_id);
create index idx_os_relatorios_gerado_por on public.os_relatorios (gerado_por);

comment on table public.os_relatorios is
  'Relatório técnico congelado na finalização da OS (§41). Só o banco grava; uma versão por finalização.';

alter table public.os_relatorios enable row level security;

create policy os_relatorios_select on public.os_relatorios
  for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('service_orders'))
    and (select public.tem_permissao('service_orders.view'))
  );
-- sem políticas de escrita: ninguém grava direto, nem o dono

-- ---------------------------------------------------------------------------
-- montagem (interna): a mesma estrutura para a prévia e para a versão congelada
-- ---------------------------------------------------------------------------
create or replace function public.montar_relatorio_os(p_os_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid;
  v_resultado jsonb;
begin
  select loja_id into v_loja from public.ordens_servico where id = p_os_id;
  if v_loja is null then
    return null;
  end if;

  select jsonb_build_object(
    'estrutura', 1,
    'montado_em', now(),
    'empresa', jsonb_build_object('nome', l.nome, 'cnpj', l.cnpj, 'telefone', l.telefone,
                                  'cidade', l.cidade, 'estado', l.estado),
    'os', jsonb_build_object(
      'id', os.id, 'numero', os.numero, 'titulo', os.titulo,
      'tipo_servico', t.nome, 'prioridade', p.nome,
      'status', jsonb_build_object('nome', s.nome, 'categoria', s.categoria),
      'local_atendimento', os.local_atendimento, 'objeto_atendimento', os.objeto_atendimento,
      'aberta_em', os.criado_em, 'concluida_em', os.concluido_em),
    'cliente', jsonb_build_object('nome', c.nome, 'documento', c.documento,
                                  'telefone', coalesce(c.telefone, c.whatsapp), 'email', c.email),
    'endereco', case when en.id is null then null else jsonb_build_object(
      'rotulo', en.rotulo, 'logradouro', en.logradouro, 'numero', en.numero, 'complemento', en.complemento,
      'bairro', en.bairro, 'cidade', en.cidade, 'estado', en.estado, 'cep', en.cep, 'referencia', en.referencia) end,
    'equipamento', case when e.id is null then null else jsonb_build_object(
      'nome', e.nome, 'marca', e.marca, 'modelo', e.modelo, 'numero_serie', e.numero_serie,
      'localizacao', e.localizacao) end,
    'tecnico', nullif(btrim(coalesce(tec.nome, '') || ' ' || coalesce(tec.sobrenome, '')), ''),
    'equipe', eq.nome,
    'problema', os.descricao,
    'atendimento', jsonb_build_object(
      'diagnostico', os.diagnostico, 'causa', os.causa, 'servico_executado', os.servico_executado,
      'solucao', os.solucao, 'recomendacao', os.recomendacao, 'observacoes_tecnicas', os.observacoes_tecnicas),
    'checklists', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nome', ck.nome,
               'itens', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'ordem', i.ordem, 'rotulo', i.rotulo, 'tipo', i.tipo, 'obrigatorio', i.obrigatorio,
                          'unidade', i.unidade, 'valor_min', i.valor_min, 'valor_max', i.valor_max,
                          'valor_booleano', i.valor_booleano, 'valor_texto', i.valor_texto,
                          'valor_numero', i.valor_numero, 'valor_data', i.valor_data,
                          'valor_hora', i.valor_hora, 'valor_opcao', i.valor_opcao,
                          'anexo', case when an.id is null then null
                                        else jsonb_build_object('nome_arquivo', an.nome_arquivo, 'caminho', an.caminho) end,
                          'fora_faixa', public.item_checklist_fora_faixa(i),
                          'respondido_em', i.respondido_em)
                        order by i.ordem), '[]'::jsonb)
                 from public.os_checklist_itens i
                 left join public.os_anexos an on an.id = i.anexo_id and an.removido_em is null
                 where i.checklist_id = ck.id and public.item_checklist_visivel(i)))
             order by ck.aplicado_em), '[]'::jsonb)
      from public.os_checklists ck where ck.os_id = os.id),
    'materiais', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'descricao', i.descricao, 'tipo', i.tipo, 'quantidade', i.quantidade,
               'unidade', i.unidade, 'observacao', i.observacao) order by i.criado_em), '[]'::jsonb)
      from public.os_itens i where i.os_id = os.id and i.tipo <> 'servico'),
    'servicos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'descricao', i.descricao, 'quantidade', i.quantidade,
               'unidade', i.unidade, 'observacao', i.observacao) order by i.criado_em), '[]'::jsonb)
      from public.os_itens i where i.os_id = os.id and i.tipo = 'servico'),
    'fotos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'caminho', a.caminho, 'nome_arquivo', a.nome_arquivo, 'momento', a.momento,
               'descricao', a.descricao, 'enviado_em', a.criado_em,
               'tecnico', nullif(btrim(coalesce(ta.nome, '') || ' ' || coalesce(ta.sobrenome, '')), ''))
             order by array_position(array['antes', 'problema', 'equipamento', 'durante', 'depois', 'outros'], a.momento::text),
                      a.criado_em), '[]'::jsonb)
      from public.os_anexos a
      left join public.tecnicos ta on ta.id = a.tecnico_id and ta.loja_id = a.loja_id
      where a.os_id = os.id and a.loja_id = os.loja_id and a.tipo = 'foto' and a.removido_em is null),
    'visitas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'inicio_previsto', ag.inicio_em, 'fim_previsto', ag.fim_em, 'status', ag.status,
               'tecnico', nullif(btrim(coalesce(tv.nome, '') || ' ' || coalesce(tv.sobrenome, '')), ''),
               'equipe', ev.nome,
               'saida_em', h.saida_em, 'chegada_em', h.chegada_em,
               'inicio_atendimento_em', h.inicio_atendimento_em, 'termino_em', h.termino_em)
             order by ag.inicio_em), '[]'::jsonb)
      from public.agendamentos ag
      left join public.tecnicos tv on tv.id = ag.tecnico_id and tv.loja_id = ag.loja_id
      left join public.equipes ev on ev.id = ag.equipe_id and ev.loja_id = ag.loja_id
      left join lateral (
        select min(ap.inicio_em) filter (where ap.tipo = 'deslocamento') as saida_em,
               max(ap.fim_em) filter (where ap.tipo = 'deslocamento') as chegada_em,
               min(ap.inicio_em) filter (where ap.tipo = 'atendimento') as inicio_atendimento_em,
               max(ap.fim_em) filter (where ap.tipo in ('atendimento', 'pausa')) as termino_em
        from public.os_apontamentos ap
        where ap.agendamento_id = ag.id and ap.loja_id = ag.loja_id
      ) h on true
      where ag.os_id = os.id and ag.loja_id = os.loja_id and ag.status <> 'cancelado'),
    'tempos', (
      select jsonb_build_object(
        'deslocamento_min', coalesce(sum(ap.duracao_min) filter (where ap.tipo = 'deslocamento'), 0),
        'atendimento_min', coalesce(sum(ap.duracao_min) filter (where ap.tipo = 'atendimento'), 0),
        'pausa_min', coalesce(sum(ap.duracao_min) filter (where ap.tipo = 'pausa'), 0))
      from public.os_apontamentos ap where ap.os_id = os.id and ap.loja_id = os.loja_id),
    'assinatura', (
      select jsonb_build_object(
        'nome_responsavel', sa.nome_responsavel, 'documento', sa.documento, 'observacao', sa.observacao,
        'assinado_em', sa.assinado_em, 'hash_sha256', sa.hash_sha256, 'imagem_png', sa.imagem_png)
      from public.os_assinaturas sa
      where sa.os_id = os.id and sa.loja_id = os.loja_id and sa.substituida_em is null)
  )
  into v_resultado
  from public.ordens_servico os
  join public.lojas l on l.id = os.loja_id
  join public.status_os s on s.id = os.status_id and s.loja_id = os.loja_id
  join public.clientes c on c.id = os.cliente_id and c.loja_id = os.loja_id
  left join public.tipos_servico t on t.id = os.tipo_servico_id and t.loja_id = os.loja_id
  left join public.prioridades_os p on p.id = os.prioridade_id and p.loja_id = os.loja_id
  left join public.cliente_enderecos en on en.id = os.cliente_endereco_id and en.loja_id = os.loja_id
  left join public.equipamentos e on e.id = os.equipamento_id and e.loja_id = os.loja_id
  left join public.tecnicos tec on tec.id = os.tecnico_id and tec.loja_id = os.loja_id
  left join public.equipes eq on eq.id = os.equipe_id and eq.loja_id = os.loja_id
  where os.id = p_os_id;

  return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------------
-- leitura (interna): versão pedida, a última (OS finalizada) ou a prévia
-- ---------------------------------------------------------------------------
create or replace function public.ler_relatorio_os(p_os_id uuid, p_versao integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_categoria public.categoria_status;
  v_versao integer;
  v_conteudo jsonb;
  v_gerado_em timestamptz;
  v_gerado_por text;
  v_origem text := 'previa';
begin
  select s.categoria into v_categoria
  from public.ordens_servico os join public.status_os s on s.id = os.status_id
  where os.id = p_os_id;

  if p_versao is not null then
    select r.versao, r.conteudo, r.gerado_em, u.nome into v_versao, v_conteudo, v_gerado_em, v_gerado_por
    from public.os_relatorios r left join public.usuarios u on u.id = r.gerado_por and u.loja_id = r.loja_id
    where r.os_id = p_os_id and r.versao = p_versao;
    if v_versao is null then
      raise exception 'Versão do relatório não encontrada.' using errcode = 'P0002';
    end if;
  elsif v_categoria = 'finalizado_sucesso' then
    -- OS finalizada: a última versão congelada
    select r.versao, r.conteudo, r.gerado_em, u.nome into v_versao, v_conteudo, v_gerado_em, v_gerado_por
    from public.os_relatorios r left join public.usuarios u on u.id = r.gerado_por and u.loja_id = r.loja_id
    where r.os_id = p_os_id
    order by r.versao desc limit 1;
  end if;

  if v_versao is not null then
    v_origem := 'finalizacao';
  else
    -- OS aberta (ou finalizada antes do relatório existir): prévia com os dados atuais
    v_conteudo := public.montar_relatorio_os(p_os_id);
  end if;

  -- contato do cliente só para quem pode ver clientes (a versão guarda tudo)
  if not public.tem_permissao('customers.view') then
    v_conteudo := jsonb_set(v_conteudo, '{cliente}', jsonb_build_object('nome', v_conteudo->'cliente'->>'nome'));
  end if;

  return jsonb_build_object(
    'origem', v_origem,
    'versao', v_versao,
    'gerado_em', v_gerado_em,
    'gerado_por', v_gerado_por,
    'encerrada', v_categoria in ('finalizado_sucesso', 'finalizado_cancelado'),
    'versoes', (
      select coalesce(jsonb_agg(jsonb_build_object('versao', r.versao, 'gerado_em', r.gerado_em, 'gerado_por', u.nome)
                                order by r.versao desc), '[]'::jsonb)
      from public.os_relatorios r left join public.usuarios u on u.id = r.gerado_por and u.loja_id = r.loja_id
      where r.os_id = p_os_id),
    'relatorio', v_conteudo);
end;
$function$;

-- ---------------------------------------------------------------------------
-- RPCs: Portal da Empresa (por OS) e portal do técnico (por atendimento)
-- ---------------------------------------------------------------------------
create or replace function public.relatorio_tecnico_os(p_os_id uuid, p_versao integer default null)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ordens_servico where id = p_os_id and loja_id = v_loja) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  return public.ler_relatorio_os(p_os_id, p_versao);
end;
$function$;

create or replace function public.relatorio_tecnico_atendimento(p_agendamento_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_os uuid;
begin
  if not public.pode_portal_tecnico() or not public.tem_permissao('technician.jobs.view') then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;
  select os_id into v_os from public.agendamentos where id = p_agendamento_id;
  return public.ler_relatorio_os(v_os, null);
end;
$function$;

-- ---------------------------------------------------------------------------
-- efetivar_status_os: finalizar congela uma nova versão do relatório
-- ---------------------------------------------------------------------------
create or replace function public.efetivar_status_os(p_os_id uuid, p_status_id uuid, p_observacao text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid;
  v_de uuid;
  v_categoria public.categoria_status;
  v_uid uuid := auth.uid();
  v_agora timestamptz := now();
  v_versao integer;
begin
  select loja_id, status_id into v_loja, v_de from public.ordens_servico where id = p_os_id;
  select categoria into v_categoria from public.status_os where id = p_status_id and loja_id = v_loja;

  perform set_config('oxys.alterar_status_os', 'on', true);
  update public.ordens_servico
     set status_id = p_status_id,
         iniciado_em = case when v_categoria = 'em_andamento' then coalesce(iniciado_em, v_agora) else iniciado_em end,
         concluido_em = case
           when v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then v_agora
           else null
         end
   where id = p_os_id;
  perform set_config('oxys.alterar_status_os', 'off', true);

  insert into public.os_historico (os_id, usuario_id, status_anterior_id, status_novo_id, observacao)
  values (p_os_id, v_uid, v_de, p_status_id, p_observacao);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, v_uid, 'os_status_alterado',
          jsonb_build_object('os_id', p_os_id, 'de', v_de, 'para', p_status_id, 'observacao', p_observacao));

  if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
    -- OS encerrada não deixa relógio correndo
    update public.os_apontamentos
       set fim_em = v_agora
     where os_id = p_os_id and loja_id = v_loja and fim_em is null;
  end if;

  if v_categoria = 'finalizado_sucesso' then
    -- visitas ainda abertas desta OS terminam junto
    update public.agendamentos
       set status = 'concluido',
           estado_campo = case when estado_campo = 'nao_iniciado' then estado_campo else 'finalizado' end,
           versao = versao + 1,
           atualizado_em = v_agora,
           atualizado_por = v_uid
     where os_id = p_os_id and loja_id = v_loja and status not in ('concluido', 'cancelado');

    -- relatório técnico congelado (§41); a OS já está travada por quem chamou
    select coalesce(max(versao), 0) + 1 into v_versao from public.os_relatorios where os_id = p_os_id;
    insert into public.os_relatorios (loja_id, os_id, versao, conteudo, gerado_em, gerado_por)
    values (v_loja, p_os_id, v_versao, public.montar_relatorio_os(p_os_id), v_agora, v_uid);

    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (v_loja, v_uid, 'os_relatorio_gerado', jsonb_build_object('os_id', p_os_id, 'versao', v_versao));
  end if;
end;
$function$;

revoke all on function public.montar_relatorio_os(uuid) from public, anon, authenticated;
revoke all on function public.ler_relatorio_os(uuid, integer) from public, anon, authenticated;
revoke all on function public.relatorio_tecnico_os(uuid, integer) from public, anon;
revoke all on function public.relatorio_tecnico_atendimento(uuid) from public, anon;
grant execute on function public.relatorio_tecnico_os(uuid, integer) to authenticated;
grant execute on function public.relatorio_tecnico_atendimento(uuid) to authenticated;
