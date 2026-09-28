-- Fase 3 · etapa 15 — finalização da OS: estrutura
-- 1) requisitos de finalização configurados por tipo de serviço (§39)
-- 2) campos do diagnóstico que faltavam (§36: causa encontrada e recomendação)
-- 3) gatilhos da OS: normalizam/registram os campos novos e aceitam o registro
--    do atendimento feito pelo portal do técnico (flag oxys.campo_atendimento)

alter table public.tipos_servico
  add column exige_diagnostico boolean not null default false,
  add column exige_assinatura boolean not null default false,
  add column exige_materiais boolean not null default false,
  add column fotos_minimas smallint not null default 0,
  add constraint tipos_servico_fotos_minimas check (fotos_minimas between 0 and 20);

comment on column public.tipos_servico.exige_diagnostico is 'Finalizar exige o diagnóstico preenchido.';
comment on column public.tipos_servico.exige_assinatura is 'Finalizar exige a assinatura válida do cliente.';
comment on column public.tipos_servico.exige_materiais is 'Finalizar exige ao menos um material, peça ou produto lançado.';
comment on column public.tipos_servico.fotos_minimas is 'Quantidade mínima de fotos na OS para finalizar (0 = não exige).';

alter table public.ordens_servico
  add column causa text,
  add column recomendacao text;

alter table public.ordens_servico drop constraint ordens_servico_textos_tamanho;
alter table public.ordens_servico add constraint ordens_servico_textos_tamanho check (
  coalesce(length(observacoes_internas), 0) <= 5000
  and coalesce(length(diagnostico), 0) <= 5000
  and coalesce(length(causa), 0) <= 5000
  and coalesce(length(servico_executado), 0) <= 5000
  and coalesce(length(solucao), 0) <= 5000
  and coalesce(length(recomendacao), 0) <= 5000
  and coalesce(length(observacoes_tecnicas), 0) <= 5000
  and coalesce(length(objeto_atendimento), 0) <= 200
);

create or replace function public.trg_ordens_servico_regras()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_via_status boolean := coalesce(current_setting('oxys.alterar_status_os', true), '') = 'on';
  -- registro do atendimento pelo portal do técnico (registrar_atendimento_campo já validou)
  v_via_campo boolean := coalesce(current_setting('oxys.campo_atendimento', true), '') = 'on';
  v_categoria public.categoria_status;
  v_dados_mudaram boolean;
  v_atendimento_mudou boolean;
  v_tecnico_mudou boolean;
begin
  new.titulo := nullif(btrim(regexp_replace(coalesce(new.titulo, ''), '\s+', ' ', 'g')), '');
  new.descricao := btrim(coalesce(new.descricao, ''));
  new.objeto_atendimento := nullif(btrim(coalesce(new.objeto_atendimento, '')), '');
  new.observacoes_internas := nullif(btrim(coalesce(new.observacoes_internas, '')), '');
  new.diagnostico := nullif(btrim(coalesce(new.diagnostico, '')), '');
  new.causa := nullif(btrim(coalesce(new.causa, '')), '');
  new.servico_executado := nullif(btrim(coalesce(new.servico_executado, '')), '');
  new.solucao := nullif(btrim(coalesce(new.solucao, '')), '');
  new.recomendacao := nullif(btrim(coalesce(new.recomendacao, '')), '');
  new.observacoes_tecnicas := nullif(btrim(coalesce(new.observacoes_tecnicas, '')), '');
  new.desconto := coalesce(new.desconto, 0);

  if tg_op = 'INSERT' then
    if v_uid is not null then
      if not public.tem_permissao('service_orders.create') then
        raise exception 'Sem permissão para criar ordens de serviço.' using errcode = '42501';
      end if;
      if new.tecnico_id is not null and not public.tem_permissao('service_orders.assign') then
        raise exception 'Sem permissão para atribuir técnico.' using errcode = '42501';
      end if;
      new.criado_em := now();
      new.criado_por := v_uid;
    end if;
    new.atualizado_em := new.criado_em;
    new.atualizado_por := v_uid;
    new.versao := 1;
    new.concluido_em := null;
    new.iniciado_em := null;
    new.valor_total := 0;

    new.prioridade_id := coalesce(
      new.prioridade_id,
      (select id from public.prioridades_os where loja_id = new.loja_id and padrao)
    );
    -- sem prazo informado: usa o SLA sugerido pela prioridade
    if new.sla_horas is null and new.prazo_em is null then
      select sla_horas into new.sla_horas from public.prioridades_os where id = new.prioridade_id and loja_id = new.loja_id;
    end if;
    if new.prazo_em is null and new.sla_horas is not null then
      new.prazo_em := new.criado_em + make_interval(hours => new.sla_horas);
    end if;
    return new;
  end if;

  if new.id <> old.id or new.loja_id <> old.loja_id
     or new.numero_ano <> old.numero_ano or new.numero_sequencia <> old.numero_sequencia
     or new.criado_em <> old.criado_em or new.criado_por is distinct from old.criado_por then
    raise exception 'Alteração não permitida.' using errcode = '42501';
  end if;
  if new.cliente_id <> old.cliente_id then
    raise exception 'O cliente de uma OS não pode ser trocado.' using errcode = '23514';
  end if;

  -- só a troca de status registra a conclusão
  if not v_via_status then
    new.concluido_em := old.concluido_em;
  end if;

  -- total sempre derivado dos itens
  new.valor_total := greatest(
    coalesce((select sum(i.subtotal) from public.os_itens i where i.os_id = new.id), 0) - new.desconto,
    0
  );

  if new.sla_horas is distinct from old.sla_horas and new.prazo_em is not distinct from old.prazo_em then
    new.prazo_em := case when new.sla_horas is null then null
                         else new.criado_em + make_interval(hours => new.sla_horas) end;
  end if;

  v_dados_mudaram :=
    (new.titulo, new.descricao, new.objeto_atendimento, new.local_atendimento, new.cliente_endereco_id,
     new.equipamento_id, new.tipo_servico_id, new.prioridade_id, new.data_agendada, new.hora_agendada,
     new.sla_horas, new.prazo_em, new.observacoes_internas, new.desconto, new.responsavel_id, new.codigo_aparelho)
    is distinct from
    (old.titulo, old.descricao, old.objeto_atendimento, old.local_atendimento, old.cliente_endereco_id,
     old.equipamento_id, old.tipo_servico_id, old.prioridade_id, old.data_agendada, old.hora_agendada,
     old.sla_horas, old.prazo_em, old.observacoes_internas, old.desconto, old.responsavel_id, old.codigo_aparelho);
  v_atendimento_mudou :=
    (new.diagnostico, new.causa, new.servico_executado, new.solucao, new.recomendacao, new.observacoes_tecnicas)
    is distinct from
    (old.diagnostico, old.causa, old.servico_executado, old.solucao, old.recomendacao, old.observacoes_tecnicas);
  v_tecnico_mudou := new.tecnico_id is distinct from old.tecnico_id;

  -- o portal do técnico só pode mexer no registro do atendimento
  if v_via_campo and (v_dados_mudaram or v_tecnico_mudou) then
    raise exception 'Alteração não permitida.' using errcode = '42501';
  end if;

  if v_uid is not null and not v_via_status and not v_via_campo then
    if (v_dados_mudaram or v_atendimento_mudou) and not public.tem_permissao('service_orders.edit') then
      raise exception 'Sem permissão para editar ordens de serviço.' using errcode = '42501';
    end if;
    if v_tecnico_mudou and not public.tem_permissao('service_orders.assign') then
      raise exception 'Sem permissão para atribuir técnico.' using errcode = '42501';
    end if;
    select categoria into v_categoria from public.status_os where id = old.status_id;
    -- registro do atendimento continua liberado depois de encerrar
    if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') and (v_dados_mudaram or v_tecnico_mudou) then
      raise exception 'OS encerrada: reabra a OS para alterar estes dados.' using errcode = '23514';
    end if;
  end if;

  -- versão só muda com conteúdo editável (status e total não geram conflito de edição)
  if v_dados_mudaram or v_atendimento_mudou or v_tecnico_mudou then
    new.versao := old.versao + 1;
    new.atualizado_em := now();
    new.atualizado_por := coalesce(v_uid, old.atualizado_por);
  else
    new.versao := old.versao;
  end if;
  return new;
end;
$function$;

create or replace function public.trg_ordens_servico_log()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if new.causa is distinct from old.causa then v_campos := v_campos || 'causa'::text; end if;
  if new.servico_executado is distinct from old.servico_executado then v_campos := v_campos || 'servico_executado'::text; end if;
  if new.solucao is distinct from old.solucao then v_campos := v_campos || 'solucao'::text; end if;
  if new.recomendacao is distinct from old.recomendacao then v_campos := v_campos || 'recomendacao'::text; end if;
  if new.observacoes_tecnicas is distinct from old.observacoes_tecnicas then v_campos := v_campos || 'observacoes_tecnicas'::text; end if;
  if new.desconto is distinct from old.desconto then v_campos := v_campos || 'desconto'::text; end if;

  if cardinality(v_campos) > 0 then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, v_uid, 'os_atualizada',
            jsonb_build_object('os_id', new.id, 'cliente_id', new.cliente_id, 'campos', v_campos));
  end if;
  return null;
end;
$function$;
