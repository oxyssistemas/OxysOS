-- Fase 3 · etapa 15 — finalização da OS: funções
-- Um só lugar decide o que falta para finalizar (requisitos_finalizacao_os) e um só
-- lugar efetiva a troca de status (efetivar_status_os). Os dois caminhos de
-- finalização — "Alterar status" no Portal da Empresa e "Finalizar atendimento"
-- no Portal do Técnico — passam por eles (§20: nada de regra espalhada).

-- ---------------------------------------------------------------------------
-- requisitos: lista {chave, rotulo, ok, detalhe, acao}; o checklist obrigatório
-- vale sempre, os demais conforme o tipo de serviço da OS (§39)
-- ---------------------------------------------------------------------------
create or replace function public.requisitos_finalizacao_os(p_os_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_os record;
  v_tipo record;
  v_pendentes int;
  v_fotos int;
  v_materiais int;
  v_assinatura boolean;
  v_req jsonb := '[]'::jsonb;
begin
  select os.id, os.loja_id, os.tipo_servico_id, os.diagnostico into v_os
  from public.ordens_servico os where os.id = p_os_id;
  if not found then
    return v_req;
  end if;

  select count(*) into v_pendentes
  from public.os_checklist_itens i
  join public.os_checklists c on c.id = i.checklist_id
  where c.os_id = p_os_id and public.item_checklist_pendente(i);

  v_req := v_req || jsonb_build_object(
    'chave', 'checklist', 'rotulo', 'Checklist obrigatório completo', 'ok', v_pendentes = 0,
    'detalhe', case when v_pendentes = 0 then 'Nenhum item obrigatório pendente'
                    when v_pendentes = 1 then 'Falta 1 item obrigatório'
                    else format('Faltam %s itens obrigatórios', v_pendentes) end,
    'acao', case when v_pendentes = 1 then 'responda o item obrigatório do checklist'
                 else format('responda os %s itens obrigatórios do checklist', v_pendentes) end);

  select t.exige_diagnostico, t.exige_assinatura, t.exige_materiais, t.fotos_minimas into v_tipo
  from public.tipos_servico t
  where t.id = v_os.tipo_servico_id and t.loja_id = v_os.loja_id;
  if not found then
    return v_req;
  end if;

  if v_tipo.exige_diagnostico then
    v_req := v_req || jsonb_build_object(
      'chave', 'diagnostico', 'rotulo', 'Diagnóstico preenchido', 'ok', v_os.diagnostico is not null,
      'detalhe', case when v_os.diagnostico is null then 'Ainda em branco' else 'Preenchido' end,
      'acao', 'preencha o diagnóstico');
  end if;

  if v_tipo.fotos_minimas > 0 then
    select count(*) into v_fotos
    from public.os_anexos a
    where a.os_id = p_os_id and a.loja_id = v_os.loja_id and a.tipo = 'foto' and a.removido_em is null;
    v_req := v_req || jsonb_build_object(
      'chave', 'fotos', 'rotulo', 'Fotos obrigatórias enviadas', 'ok', v_fotos >= v_tipo.fotos_minimas,
      'detalhe', format('%s de %s', least(v_fotos, v_tipo.fotos_minimas), v_tipo.fotos_minimas),
      'acao', case when v_tipo.fotos_minimas = 1 then 'envie ao menos 1 foto'
                   else format('envie ao menos %s fotos (há %s)', v_tipo.fotos_minimas, v_fotos) end);
  end if;

  if v_tipo.exige_assinatura then
    select exists (
      select 1 from public.os_assinaturas a
      where a.os_id = p_os_id and a.loja_id = v_os.loja_id and a.substituida_em is null
    ) into v_assinatura;
    v_req := v_req || jsonb_build_object(
      'chave', 'assinatura', 'rotulo', 'Assinatura do cliente', 'ok', v_assinatura,
      'detalhe', case when v_assinatura then 'Colhida' else 'Ainda não colhida' end,
      'acao', 'colha a assinatura do cliente');
  end if;

  if v_tipo.exige_materiais then
    select count(*) into v_materiais
    from public.os_itens i
    where i.os_id = p_os_id and i.tipo in ('material', 'peca', 'produto');
    v_req := v_req || jsonb_build_object(
      'chave', 'materiais', 'rotulo', 'Materiais registrados', 'ok', v_materiais > 0,
      'detalhe', case when v_materiais = 0 then 'Nenhum material lançado'
                      when v_materiais = 1 then '1 item lançado'
                      else format('%s itens lançados', v_materiais) end,
      'acao', 'registre os materiais usados');
  end if;

  return v_req;
end;
$function$;

-- texto único para o erro: "Antes de finalizar: ...; ... ." ou null se nada falta
create or replace function public.pendencias_finalizacao_os(p_os_id uuid)
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select 'Antes de finalizar: ' || string_agg(r->>'acao', '; ' order by n) || '.'
  from jsonb_array_elements(public.requisitos_finalizacao_os(p_os_id)) with ordinality as x(r, n)
  where not (r->>'ok')::boolean
  having count(*) > 0;
$function$;

-- ---------------------------------------------------------------------------
-- resumo antes de finalizar (§40) — sem valores: é o que foi feito, não quanto custa
-- ---------------------------------------------------------------------------
create or replace function public.resumo_finalizacao_os(p_os_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid;
  v_resultado jsonb;
  v_requisitos jsonb := public.requisitos_finalizacao_os(p_os_id);
begin
  select loja_id into v_loja from public.ordens_servico where id = p_os_id;

  select jsonb_build_object(
    'os_id', os.id,
    'numero', os.numero,
    'encerrada', s.categoria in ('finalizado_sucesso', 'finalizado_cancelado'),
    'status', jsonb_build_object('nome', s.nome, 'cor', s.cor, 'categoria', s.categoria),
    'tipo_servico', case when t.id is null then null else jsonb_build_object('id', t.id, 'nome', t.nome) end,
    'tempos', (
      select jsonb_build_object(
        'deslocamento_min', coalesce(sum(m) filter (where a.tipo = 'deslocamento'), 0),
        'atendimento_min', coalesce(sum(m) filter (where a.tipo = 'atendimento'), 0),
        'pausa_min', coalesce(sum(m) filter (where a.tipo = 'pausa'), 0),
        'relogio_aberto', coalesce(bool_or(a.fim_em is null), false))
      from public.os_apontamentos a
      cross join lateral (
        select greatest(0, round(extract(epoch from (coalesce(a.fim_em, now()) - a.inicio_em)) / 60))::int as m
      ) d
      where a.os_id = os.id and a.loja_id = v_loja),
    'checklist', (
      select jsonb_build_object(
        'checklists', count(distinct c.id),
        'itens', count(i.id) filter (where public.item_checklist_visivel(i)),
        'respondidos', count(i.id) filter (where public.item_checklist_visivel(i) and public.item_checklist_respondido(i)),
        'pendentes', count(i.id) filter (where public.item_checklist_pendente(i)))
      from public.os_checklists c
      left join public.os_checklist_itens i on i.checklist_id = c.id
      where c.os_id = os.id),
    'materiais', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'descricao', i.descricao, 'tipo', i.tipo, 'quantidade', i.quantidade, 'unidade', i.unidade)
             order by i.criado_em), '[]'::jsonb)
      from public.os_itens i where i.os_id = os.id and i.tipo <> 'servico'),
    'servicos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'descricao', i.descricao, 'quantidade', i.quantidade, 'unidade', i.unidade)
             order by i.criado_em), '[]'::jsonb)
      from public.os_itens i where i.os_id = os.id and i.tipo = 'servico'),
    'fotos', (
      select count(*) from public.os_anexos a
      where a.os_id = os.id and a.loja_id = v_loja and a.tipo = 'foto' and a.removido_em is null),
    'atendimento', jsonb_build_object(
      'diagnostico', os.diagnostico, 'causa', os.causa, 'servico_executado', os.servico_executado,
      'solucao', os.solucao, 'recomendacao', os.recomendacao, 'observacoes_tecnicas', os.observacoes_tecnicas),
    'assinatura', (
      select jsonb_build_object('nome_responsavel', a.nome_responsavel, 'assinado_em', a.assinado_em)
      from public.os_assinaturas a
      where a.os_id = os.id and a.loja_id = v_loja and a.substituida_em is null),
    'requisitos', v_requisitos,
    'pendentes', (select count(*) from jsonb_array_elements(v_requisitos) r where not (r->>'ok')::boolean)
  )
  into v_resultado
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id and s.loja_id = os.loja_id
  left join public.tipos_servico t on t.id = os.tipo_servico_id and t.loja_id = os.loja_id
  where os.id = p_os_id;

  return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------------
-- efetiva a troca de status (quem chama já validou permissão e requisitos)
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
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- "Alterar status" do Portal da Empresa: mesmas regras de antes, agora com os
-- requisitos configurados em vez de só o checklist
-- ---------------------------------------------------------------------------
create or replace function public.alterar_status_os(p_os_id uuid, p_status_id uuid, p_observacao text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_status_atual uuid;
  v_de record;
  v_para record;
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_pendencias text;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;

  select status_id into v_status_atual
  from public.ordens_servico
  where id = p_os_id and loja_id = v_loja
  for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  select id, nome, categoria, ativo into v_para
  from public.status_os where id = p_status_id and loja_id = v_loja;
  if not found then
    raise exception 'Status não encontrado.' using errcode = 'P0002';
  end if;

  if v_status_atual = v_para.id then
    return jsonb_build_object('os_id', p_os_id, 'status_id', v_para.id, 'categoria', v_para.categoria, 'alterado', false);
  end if;
  if not v_para.ativo then
    raise exception 'Este status está desativado.' using errcode = '23514';
  end if;

  select id, nome, categoria into v_de from public.status_os where id = v_status_atual;

  -- permissões pela categoria interna: o nome do status é personalizável
  if v_para.categoria = 'finalizado_sucesso' then
    if not public.tem_permissao('service_orders.finish') then
      raise exception 'Sem permissão para finalizar ordens de serviço.' using errcode = '42501';
    end if;
  elsif v_para.categoria = 'finalizado_cancelado' then
    if not public.tem_permissao('service_orders.cancel') then
      raise exception 'Sem permissão para cancelar ordens de serviço.' using errcode = '42501';
    end if;
  elsif not public.tem_permissao('service_orders.edit') then
    raise exception 'Sem permissão para alterar o status da OS.' using errcode = '42501';
  end if;

  -- reabrir exige a mesma permissão de quem finalizou/cancelou
  if v_de.categoria = 'finalizado_sucesso' and not public.tem_permissao('service_orders.finish') then
    raise exception 'Sem permissão para alterar uma OS finalizada.' using errcode = '42501';
  end if;
  if v_de.categoria = 'finalizado_cancelado' and not public.tem_permissao('service_orders.cancel') then
    raise exception 'Sem permissão para alterar uma OS cancelada.' using errcode = '42501';
  end if;

  if v_para.categoria = 'finalizado_cancelado' and v_observacao is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '23514';
  end if;
  if length(v_observacao) > 500 then
    raise exception 'A observação deve ter até 500 caracteres.' using errcode = '23514';
  end if;

  -- finalizar exige os requisitos configurados (checklist obrigatório sempre)
  if v_para.categoria = 'finalizado_sucesso' then
    v_pendencias := public.pendencias_finalizacao_os(p_os_id);
    if v_pendencias is not null then
      raise exception '%', v_pendencias using errcode = '23514';
    end if;
  end if;

  perform public.efetivar_status_os(p_os_id, v_para.id, v_observacao);

  return jsonb_build_object('os_id', p_os_id, 'status_id', v_para.id, 'categoria', v_para.categoria, 'alterado', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- leitura: Portal da Empresa (por OS) e Portal do Técnico (por atendimento)
-- ---------------------------------------------------------------------------
create or replace function public.finalizacao_os(p_os_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_resumo jsonb;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ordens_servico where id = p_os_id and loja_id = v_loja) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  v_resumo := public.resumo_finalizacao_os(p_os_id);
  return v_resumo || jsonb_build_object(
    'pode_finalizar', public.tem_permissao('service_orders.finish') and not (v_resumo->>'encerrada')::boolean);
end;
$function$;

create or replace function public.finalizacao_atendimento(p_agendamento_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_ag record;
  v_resumo jsonb;
begin
  if not public.pode_portal_tecnico() or not public.tem_permissao('technician.jobs.view') then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;
  select a.os_id, a.estado_campo, a.status into v_ag from public.agendamentos a where a.id = p_agendamento_id;

  v_resumo := public.resumo_finalizacao_os(v_ag.os_id);
  return v_resumo || jsonb_build_object(
    'agendamento_id', p_agendamento_id,
    'estado_campo', v_ag.estado_campo,
    'pode_registrar', public.tem_permissao('technician.jobs.start')
                      and not (v_resumo->>'encerrada')::boolean and v_ag.status <> 'cancelado',
    'pode_finalizar', public.tem_permissao('technician.jobs.complete')
                      and not (v_resumo->>'encerrada')::boolean
                      and v_ag.status <> 'cancelado'
                      and v_ag.estado_campo in ('em_atendimento', 'pausado'));
end;
$function$;

-- ---------------------------------------------------------------------------
-- diagnóstico em campo (§36): só as chaves enviadas mudam
-- ---------------------------------------------------------------------------
create or replace function public.registrar_atendimento_campo(p_agendamento_id uuid, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_ag record;
  v_categoria public.categoria_status;
  v_chave text;
  v_os public.ordens_servico;
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;
  if not public.tem_permissao('technician.jobs.start') then
    raise exception 'Seu cargo não permite registrar o atendimento.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados inválidos.' using errcode = '22023';
  end if;
  for v_chave in select jsonb_object_keys(p_dados) loop
    if v_chave not in ('diagnostico', 'causa', 'servico_executado', 'solucao', 'recomendacao', 'observacoes_tecnicas') then
      raise exception 'Campo não permitido: %.', v_chave using errcode = '22023';
    end if;
    if jsonb_typeof(p_dados->v_chave) not in ('string', 'null') then
      raise exception 'Dados inválidos.' using errcode = '22023';
    end if;
    if length(p_dados->>v_chave) > 5000 then
      raise exception 'Cada campo aceita até 5000 caracteres.' using errcode = '22023';
    end if;
  end loop;

  select a.os_id, a.status into v_ag from public.agendamentos a where a.id = p_agendamento_id;
  if v_ag.status = 'cancelado' then
    raise exception 'Este atendimento foi cancelado.' using errcode = '23514';
  end if;

  select s.categoria into v_categoria
  from public.ordens_servico os join public.status_os s on s.id = os.status_id
  where os.id = v_ag.os_id and os.loja_id = v_loja
  for update of os;
  if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
    raise exception 'OS encerrada: o registro do atendimento fica com o escritório.' using errcode = '23514';
  end if;

  perform set_config('oxys.campo_atendimento', 'on', true);
  update public.ordens_servico os
     set diagnostico = case when p_dados ? 'diagnostico' then p_dados->>'diagnostico' else os.diagnostico end,
         causa = case when p_dados ? 'causa' then p_dados->>'causa' else os.causa end,
         servico_executado = case when p_dados ? 'servico_executado' then p_dados->>'servico_executado' else os.servico_executado end,
         solucao = case when p_dados ? 'solucao' then p_dados->>'solucao' else os.solucao end,
         recomendacao = case when p_dados ? 'recomendacao' then p_dados->>'recomendacao' else os.recomendacao end,
         observacoes_tecnicas = case when p_dados ? 'observacoes_tecnicas' then p_dados->>'observacoes_tecnicas' else os.observacoes_tecnicas end
   where os.id = v_ag.os_id and os.loja_id = v_loja
  returning * into v_os;
  perform set_config('oxys.campo_atendimento', 'off', true);

  return jsonb_build_object(
    'diagnostico', v_os.diagnostico, 'causa', v_os.causa, 'servico_executado', v_os.servico_executado,
    'solucao', v_os.solucao, 'recomendacao', v_os.recomendacao, 'observacoes_tecnicas', v_os.observacoes_tecnicas);
end;
$function$;

-- ---------------------------------------------------------------------------
-- "Finalizar atendimento" (§19/§20/§39): só depois de iniciado; encerrando a
-- OS, valida os requisitos; sem encerrar, fecha só esta visita (retorno)
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_atendimento_campo(
  p_agendamento_id uuid,
  p_encerrar_os boolean default true,
  p_observacao text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_loja uuid := public.loja_operacional_id();
  v_tecnico uuid := public.tecnico_do_usuario();
  v_ag record;
  v_categoria public.categoria_status;
  v_status uuid;
  v_pendencias text;
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_encerrar boolean := coalesce(p_encerrar_os, true);
  v_agora timestamptz := now();
begin
  if not public.pode_portal_tecnico() then
    raise exception 'Sem acesso ao portal do técnico.' using errcode = '42501';
  end if;
  if public.atendimento_do_tecnico(p_agendamento_id) is null then
    raise exception 'Atendimento não encontrado.' using errcode = 'P0002';
  end if;
  if not public.tem_permissao('technician.jobs.complete') then
    raise exception 'Seu cargo não permite finalizar o atendimento.' using errcode = '42501';
  end if;
  if length(v_observacao) > 500 then
    raise exception 'A observação deve ter até 500 caracteres.' using errcode = '22023';
  end if;

  select a.os_id, a.estado_campo, a.status into v_ag
  from public.agendamentos a where a.id = p_agendamento_id for update;

  select s.categoria into v_categoria
  from public.ordens_servico os join public.status_os s on s.id = os.status_id
  where os.id = v_ag.os_id and os.loja_id = v_loja
  for update of os;
  if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
    raise exception 'A OS já está encerrada.' using errcode = '23514';
  end if;
  if v_ag.status = 'cancelado' then
    raise exception 'Este atendimento foi cancelado.' using errcode = '23514';
  end if;
  -- §20: não se finaliza o que nunca começou
  if v_ag.estado_campo not in ('em_atendimento', 'pausado') then
    raise exception 'Inicie o atendimento antes de finalizar.' using errcode = '23514';
  end if;

  if v_encerrar then
    v_pendencias := public.pendencias_finalizacao_os(v_ag.os_id);
    if v_pendencias is not null then
      raise exception '%', v_pendencias using errcode = '23514';
    end if;
    select s.id into v_status
    from public.status_os s
    where s.loja_id = v_loja and s.categoria = 'finalizado_sucesso' and s.ativo
    order by s.chave = 'finalizada' desc nulls last, s.ordem, s.nome
    limit 1;
    if v_status is null then
      raise exception 'A empresa não tem um status de finalização ativo.' using errcode = '23514';
    end if;
  end if;

  -- fecha o relógio deste técnico e encerra a visita
  update public.os_apontamentos
     set fim_em = v_agora
   where tecnico_id = v_tecnico and loja_id = v_loja and fim_em is null;

  update public.agendamentos
     set estado_campo = 'finalizado',
         status = 'concluido',
         versao = versao + 1,
         atualizado_em = v_agora,
         atualizado_por = auth.uid()
   where id = p_agendamento_id and loja_id = v_loja;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'os_atendimento_finalizado', jsonb_build_object(
    'os_id', v_ag.os_id, 'agendamento_id', p_agendamento_id, 'tecnico_id', v_tecnico,
    'encerrou_os', v_encerrar, 'observacao', v_observacao));

  if v_encerrar then
    perform public.efetivar_status_os(v_ag.os_id, v_status,
                                      coalesce(v_observacao, 'Atendimento finalizado em campo.'));
  end if;

  return jsonb_build_object('estado_campo', 'finalizado', 'encerrou_os', v_encerrar,
                            'status_id', v_status, 'em', v_agora);
end;
$function$;

-- timeline: o evento de finalização diz se encerrou a OS
create or replace function public.timeline_os(p_os_id uuid, p_limite integer default 300)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
            'motivo', e.detalhes->>'motivo',
            'tipo_apontamento', e.detalhes->>'tipo_apontamento',
            'duracao_min', e.detalhes->'duracao_min',
            'item', e.detalhes->>'item',
            'quantidade', e.detalhes->'quantidade',
            'subtotal', e.detalhes->'subtotal',
            'arquivo', case when e.acao like 'os\_anexo\_%' then e.detalhes->>'nome' end,
            'tipo_anexo', case when e.acao like 'os\_anexo\_%' then e.detalhes->>'tipo' end,
            'checklist', e.detalhes->>'checklist',
            'responsavel', e.detalhes->>'responsavel',
            'substituiu', e.detalhes->'substituiu',
            'encerrou_os', e.detalhes->'encerrou_os'
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
$function$;

-- helpers internos não ficam expostos na API
revoke all on function public.requisitos_finalizacao_os(uuid) from public, anon, authenticated;
revoke all on function public.pendencias_finalizacao_os(uuid) from public, anon, authenticated;
revoke all on function public.resumo_finalizacao_os(uuid) from public, anon, authenticated;
revoke all on function public.efetivar_status_os(uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.finalizacao_os(uuid) from public, anon;
revoke all on function public.finalizacao_atendimento(uuid) from public, anon;
revoke all on function public.registrar_atendimento_campo(uuid, jsonb) from public, anon;
revoke all on function public.finalizar_atendimento_campo(uuid, boolean, text) from public, anon;
grant execute on function public.finalizacao_os(uuid) to authenticated;
grant execute on function public.finalizacao_atendimento(uuid) to authenticated;
grant execute on function public.registrar_atendimento_campo(uuid, jsonb) to authenticated;
grant execute on function public.finalizar_atendimento_campo(uuid, boolean, text) to authenticated;
