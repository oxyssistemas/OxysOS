-- =====================================================================
-- Fase 2 · 12 — Módulo de Ordens de Serviço
--
-- * Numeração OS-AAAA-000001 por empresa e ano, gerada pelo banco numa
--   linha de contador bloqueada (sem duplicidade nem corrida).
-- * Novos campos: título, observações internas, agendamento (data/hora),
--   SLA (horas + data limite), dados do atendimento, desconto, versão.
-- * Regras: permissão por ação (criar, editar, atribuir técnico), dados de
--   OS encerrada bloqueados, total calculado pelo banco a partir dos itens.
-- * Itens: serviço, produto, peça ou material, com subtotal calculado.
-- * Histórico e eventos gravados pelo banco (criação, técnico, alterações,
--   itens); o histórico de status não aceita mais inserção direta.
-- * OS não é excluída: cancela-se (com motivo).
-- * Listagem e detalhe por funções com situação do SLA.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Numeração
-- ---------------------------------------------------------------------
create table public.os_numeracao (
  loja_id uuid not null references public.lojas(id) on delete cascade,
  ano int not null,
  ultimo int not null,
  primary key (loja_id, ano),
  constraint os_numeracao_ultimo_positivo check (ultimo > 0)
);
-- sem políticas: só funções do banco leem e escrevem
alter table public.os_numeracao enable row level security;

alter table public.ordens_servico
  add column numero_ano int,
  add column numero_sequencia int;

with numeradas as (
  select id,
         extract(year from criado_em at time zone 'America/Sao_Paulo')::int as ano,
         row_number() over (
           partition by loja_id, extract(year from criado_em at time zone 'America/Sao_Paulo')
           order by criado_em, id
         ) as seq
  from public.ordens_servico
)
update public.ordens_servico o
   set numero_ano = n.ano, numero_sequencia = n.seq
  from numeradas n
 where n.id = o.id;

insert into public.os_numeracao (loja_id, ano, ultimo)
select loja_id, numero_ano, max(numero_sequencia)
from public.ordens_servico
group by loja_id, numero_ano;

alter table public.ordens_servico
  alter column numero_ano set not null,
  alter column numero_sequencia set not null,
  add column numero text generated always as (
    'OS-' || numero_ano::text || '-' ||
    case when numero_sequencia < 1000000 then lpad(numero_sequencia::text, 6, '0') else numero_sequencia::text end
  ) stored,
  add constraint ordens_servico_numero_key unique (loja_id, numero_ano, numero_sequencia);

create or replace function public.trg_ordens_servico_numerar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.numero_ano := extract(year from now() at time zone 'America/Sao_Paulo')::int;
  -- a linha do contador fica bloqueada até o fim da transação: inserções simultâneas esperam
  insert into public.os_numeracao as n (loja_id, ano, ultimo)
  values (new.loja_id, new.numero_ano, 1)
  on conflict (loja_id, ano) do update set ultimo = n.ultimo + 1
  returning n.ultimo into new.numero_sequencia;
  return new;
end;
$$;

create trigger ordens_servico_numerar
  before insert on public.ordens_servico
  for each row execute function public.trg_ordens_servico_numerar();

-- ---------------------------------------------------------------------
-- 2. Campos da OS
-- ---------------------------------------------------------------------
alter table public.ordens_servico
  add column titulo text,
  add column observacoes_internas text,
  add column data_agendada date,
  add column hora_agendada time,
  add column sla_horas int,
  add column prazo_em timestamptz,
  add column concluido_em timestamptz,
  add column diagnostico text,
  add column servico_executado text,
  add column solucao text,
  add column observacoes_tecnicas text,
  add column desconto numeric(12,2) not null default 0,
  add column versao int not null default 1,
  add column atualizado_por uuid references public.usuarios(id) on delete set null;

-- histórico: OS já encerradas recebem a data em que chegaram ao status atual
update public.ordens_servico os
   set concluido_em = coalesce(
         (select max(h.criado_em) from public.os_historico h where h.os_id = os.id and h.status_novo_id = os.status_id),
         os.atualizado_em)
  from public.status_os s
 where s.id = os.status_id and s.categoria in ('finalizado_sucesso', 'finalizado_cancelado');

-- o desconto antes ficava embutido no total
update public.ordens_servico os
   set desconto = greatest(t.soma - os.valor_total, 0)
  from (select os_id, sum(quantidade * valor_unitario) as soma from public.os_itens group by os_id) t
 where t.os_id = os.id and t.soma > os.valor_total;

alter table public.ordens_servico
  add constraint ordens_servico_titulo_tamanho check (titulo is null or length(btrim(titulo)) between 1 and 120),
  add constraint ordens_servico_descricao_tamanho check (length(btrim(descricao)) between 1 and 5000),
  add constraint ordens_servico_textos_tamanho check (
    coalesce(length(observacoes_internas), 0) <= 5000 and coalesce(length(diagnostico), 0) <= 5000
    and coalesce(length(servico_executado), 0) <= 5000 and coalesce(length(solucao), 0) <= 5000
    and coalesce(length(observacoes_tecnicas), 0) <= 5000 and coalesce(length(objeto_atendimento), 0) <= 200
  ),
  add constraint ordens_servico_hora_exige_data check (hora_agendada is null or data_agendada is not null),
  add constraint ordens_servico_sla_valido check (sla_horas is null or sla_horas between 1 and 8760),
  add constraint ordens_servico_desconto_valido check (desconto >= 0),
  add column busca text generated always as (
    public.normalizar_busca(
      'os-' || numero_ano::text || '-' || lpad(numero_sequencia::text, 6, '0') || ' ' ||
      coalesce(titulo, '') || ' ' || descricao || ' ' ||
      coalesce(objeto_atendimento, '') || ' ' || coalesce(codigo_aparelho, '')
    )
  ) stored;

create index idx_os_busca_trgm on public.ordens_servico using gin (busca extensions.gin_trgm_ops);
create index idx_os_loja_prazo_aberto on public.ordens_servico(loja_id, prazo_em) where concluido_em is null;
create index idx_os_loja_agendamento on public.ordens_servico(loja_id, data_agendada);
create index idx_os_atualizado_por on public.ordens_servico(atualizado_por);

alter table public.prioridades_os
  add column sla_horas int,
  add constraint prioridades_os_sla_valido check (sla_horas is null or sla_horas between 1 and 8760);

alter table public.os_historico
  add column observacao text,
  add constraint os_historico_observacao_tamanho check (observacao is null or length(observacao) <= 500);

-- ---------------------------------------------------------------------
-- 3. Situação do SLA
-- ---------------------------------------------------------------------
create or replace function public.situacao_sla_os(
  p_prazo timestamptz,
  p_criado_em timestamptz,
  p_concluido_em timestamptz,
  p_categoria public.categoria_status
)
returns text
language sql stable set search_path = '' as $$
  select case
    when p_prazo is null then 'sem_prazo'
    when p_categoria = 'finalizado_cancelado' then 'cancelada'
    when p_categoria = 'finalizado_sucesso' then
      case when coalesce(p_concluido_em, now()) <= p_prazo then 'cumprido' else 'cumprido_atraso' end
    when now() > p_prazo then 'atrasada'
    -- próximo do vencimento: últimos 20% do prazo (mínimo de 2 horas)
    when p_prazo - now() <= greatest(interval '2 hours', (p_prazo - p_criado_em) * 0.2) then 'vencendo'
    else 'no_prazo'
  end;
$$;

-- ---------------------------------------------------------------------
-- 4. Regras da OS
-- ---------------------------------------------------------------------
create or replace function public.trg_ordens_servico_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_via_status boolean := coalesce(current_setting('oxys.alterar_status_os', true), '') = 'on';
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
  new.servico_executado := nullif(btrim(coalesce(new.servico_executado, '')), '');
  new.solucao := nullif(btrim(coalesce(new.solucao, '')), '');
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
    (new.diagnostico, new.servico_executado, new.solucao, new.observacoes_tecnicas)
    is distinct from (old.diagnostico, old.servico_executado, old.solucao, old.observacoes_tecnicas);
  v_tecnico_mudou := new.tecnico_id is distinct from old.tecnico_id;

  if v_uid is not null and not v_via_status then
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
$$;

create trigger ordens_servico_regras
  before insert or update on public.ordens_servico
  for each row execute function public.trg_ordens_servico_regras();

-- ---------------------------------------------------------------------
-- 5. Histórico e eventos da OS
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

create trigger ordens_servico_log
  after insert or update on public.ordens_servico
  for each row execute function public.trg_ordens_servico_log();

-- ---------------------------------------------------------------------
-- 6. Itens da OS
-- ---------------------------------------------------------------------
alter table public.os_itens
  add column criado_por uuid references public.usuarios(id) on delete set null,
  add column atualizado_em timestamptz not null default now(),
  add column subtotal numeric(18,2) generated always as (round(quantidade * valor_unitario, 2)) stored,
  add constraint os_itens_descricao_tamanho check (length(btrim(descricao)) between 1 and 200),
  add constraint os_itens_quantidade_valida check (quantidade > 0 and quantidade <= 100000),
  add constraint os_itens_valor_valido check (valor_unitario >= 0);

create index idx_os_itens_criado_por on public.os_itens(criado_por);

create or replace function public.trg_os_itens_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_os_id uuid;
  v_categoria public.categoria_status;
begin
  v_os_id := case when tg_op = 'DELETE' then old.os_id else new.os_id end;

  if tg_op = 'UPDATE' and new.os_id <> old.os_id then
    raise exception 'O item não pode mudar de OS.' using errcode = '42501';
  end if;

  select s.categoria into v_categoria
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id
  where os.id = v_os_id;

  -- OS já removida (exclusão da empresa): nada a validar
  if found and auth.uid() is not null then
    if not public.tem_permissao('service_orders.edit') then
      raise exception 'Sem permissão para alterar os itens da OS.' using errcode = '42501';
    end if;
    if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
      raise exception 'OS encerrada: reabra a OS para alterar os itens.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.descricao := btrim(regexp_replace(coalesce(new.descricao, ''), '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
    new.criado_em := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger os_itens_regras
  before insert or update or delete on public.os_itens
  for each row execute function public.trg_os_itens_regras();

create or replace function public.trg_os_itens_totais()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item public.os_itens%rowtype;
  v_loja uuid;
  v_cliente uuid;
  v_acao text;
begin
  if tg_op = 'DELETE' then
    v_item := old;
  else
    v_item := new;
  end if;

  select loja_id, cliente_id into v_loja, v_cliente from public.ordens_servico where id = v_item.os_id;
  if not found then
    return null;
  end if;

  -- a regra da OS recalcula o total
  update public.ordens_servico set valor_total = valor_total where id = v_item.os_id;

  if tg_op = 'UPDATE' and (new.descricao, new.tipo, new.quantidade, new.valor_unitario)
                          is not distinct from (old.descricao, old.tipo, old.quantidade, old.valor_unitario) then
    return null;
  end if;

  v_acao := case tg_op when 'INSERT' then 'os_item_adicionado' when 'UPDATE' then 'os_item_alterado' else 'os_item_removido' end;
  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), v_acao,
          jsonb_build_object('os_id', v_item.os_id, 'cliente_id', v_cliente, 'item', v_item.descricao,
                             'quantidade', v_item.quantidade, 'subtotal', round(v_item.quantidade * v_item.valor_unitario, 2)));
  return null;
end;
$$;

create trigger os_itens_totais
  after insert or update or delete on public.os_itens
  for each row execute function public.trg_os_itens_totais();

-- ---------------------------------------------------------------------
-- 7. Troca de status (com observação e data de conclusão)
-- ---------------------------------------------------------------------
drop function public.alterar_status_os(uuid, uuid);

create or replace function public.alterar_status_os(p_os_id uuid, p_status_id uuid, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_status_atual uuid;
  v_de record;
  v_para record;
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
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

  perform set_config('oxys.alterar_status_os', 'on', true);
  update public.ordens_servico
     set status_id = v_para.id,
         iniciado_em = case when v_para.categoria = 'em_andamento' then coalesce(iniciado_em, now()) else iniciado_em end,
         concluido_em = case
           when v_para.categoria in ('finalizado_sucesso', 'finalizado_cancelado') then now()
           else null
         end
   where id = p_os_id;
  perform set_config('oxys.alterar_status_os', 'off', true);

  insert into public.os_historico (os_id, usuario_id, status_anterior_id, status_novo_id, observacao)
  values (p_os_id, v_uid, v_de.id, v_para.id, v_observacao);

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, v_uid, 'os_status_alterado',
          jsonb_build_object('os_id', p_os_id, 'de', v_de.id, 'para', v_para.id, 'observacao', v_observacao));

  return jsonb_build_object('os_id', p_os_id, 'status_id', v_para.id, 'categoria', v_para.categoria, 'alterado', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Listagem, detalhe e histórico de status
-- ---------------------------------------------------------------------
create or replace function public.listar_ordens_servico(
  p_busca text default null,
  p_grupo text default 'abertas',
  p_status uuid default null,
  p_prioridade uuid default null,
  p_tecnico text default null,
  p_tipo uuid default null,
  p_cliente uuid default null,
  p_equipamento uuid default null,
  p_sla text default null,
  p_ordem text default 'recentes',
  p_pagina integer default 1,
  p_por_pagina integer default 20
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_por_pagina, 20), 1), 100);
  v_offset int := (greatest(coalesce(p_pagina, 1), 1) - 1) * least(greatest(coalesce(p_por_pagina, 20), 1), 100);
  v_termo text := nullif(public.normalizar_busca(btrim(coalesce(p_busca, ''))), '');
  v_padrao text;
  v_grupo text := coalesce(p_grupo, 'abertas');
  v_ordem text := coalesce(p_ordem, 'recentes');
  v_tecnico uuid;
  v_total bigint;
  v_itens jsonb;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if v_grupo not in ('abertas', 'finalizadas', 'canceladas', 'todas')
     or v_ordem not in ('recentes', 'prazo', 'agendamento')
     or (p_sla is not null and p_sla not in ('atrasada', 'vencendo', 'no_prazo', 'sem_prazo')) then
    raise exception 'Filtro inválido.' using errcode = '22023';
  end if;
  if p_tecnico is not null and p_tecnico <> 'sem' then
    begin
      v_tecnico := p_tecnico::uuid;
    exception when invalid_text_representation then
      raise exception 'Filtro inválido.' using errcode = '22023';
    end;
  end if;

  if v_termo is not null then
    v_padrao := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb), coalesce(max(x.total), 0)
    into v_itens, v_total
  from (
    select
      row_number() over (
        order by
          case when v_ordem = 'prazo' then f.prazo_em end asc nulls last,
          case when v_ordem = 'agendamento' then f.data_agendada end asc nulls last,
          case when v_ordem = 'agendamento' then f.hora_agendada end asc nulls last,
          f.criado_em desc, f.id
      ) as ord,
      count(*) over () as total,
      jsonb_build_object(
        'id', f.id,
        'numero', f.numero,
        'titulo', f.titulo,
        'descricao', left(f.descricao, 160),
        'criado_em', f.criado_em,
        'data_agendada', f.data_agendada,
        'hora_agendada', f.hora_agendada,
        'prazo_em', f.prazo_em,
        'concluido_em', f.concluido_em,
        'sla', f.sla,
        'valor_total', f.valor_total,
        'local_atendimento', f.local_atendimento,
        'cliente', jsonb_build_object('id', f.cliente_id, 'nome', f.cliente_nome),
        'status', jsonb_build_object('id', f.status_id, 'nome', f.status_nome, 'cor', f.status_cor, 'categoria', f.categoria),
        'prioridade', case when f.prioridade_nome is null then null
                           else jsonb_build_object('id', f.prioridade_id, 'nome', f.prioridade_nome,
                                                   'cor', f.prioridade_cor, 'nivel', f.prioridade_nivel) end,
        'tipo_servico', case when f.tipo_nome is null then null
                             else jsonb_build_object('id', f.tipo_servico_id, 'nome', f.tipo_nome) end,
        'tecnico', case when f.tecnico_nome is null then null
                        else jsonb_build_object('id', f.tecnico_id, 'nome', f.tecnico_nome) end,
        'equipamento', case when f.equipamento_nome is null then null
                            else jsonb_build_object('id', f.equipamento_id, 'nome', f.equipamento_nome) end
      ) as item
    from (
      select
        os.id, os.numero, os.titulo, os.descricao, os.criado_em, os.data_agendada, os.hora_agendada,
        os.prazo_em, os.concluido_em, os.valor_total, os.local_atendimento,
        os.cliente_id, c.nome as cliente_nome,
        os.status_id, s.nome as status_nome, s.cor as status_cor, s.categoria,
        os.prioridade_id, p.nome as prioridade_nome, p.cor as prioridade_cor, p.nivel as prioridade_nivel,
        os.tipo_servico_id, t.nome as tipo_nome,
        os.tecnico_id, nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), '') as tecnico_nome,
        os.equipamento_id, e.nome as equipamento_nome,
        public.situacao_sla_os(os.prazo_em, os.criado_em, os.concluido_em, s.categoria) as sla
      from public.ordens_servico os
      join public.status_os s on s.id = os.status_id and s.loja_id = v_loja
      join public.clientes c on c.id = os.cliente_id and c.loja_id = v_loja
      left join public.prioridades_os p on p.id = os.prioridade_id and p.loja_id = v_loja
      left join public.tipos_servico t on t.id = os.tipo_servico_id and t.loja_id = v_loja
      left join public.tecnicos tec on tec.id = os.tecnico_id and tec.loja_id = v_loja
      left join public.equipamentos e on e.id = os.equipamento_id and e.loja_id = v_loja
      where os.loja_id = v_loja
        and (
          v_grupo = 'todas'
          or (v_grupo = 'abertas' and s.categoria not in ('finalizado_sucesso', 'finalizado_cancelado'))
          or (v_grupo = 'finalizadas' and s.categoria = 'finalizado_sucesso')
          or (v_grupo = 'canceladas' and s.categoria = 'finalizado_cancelado')
        )
        and (p_status is null or os.status_id = p_status)
        and (p_prioridade is null or os.prioridade_id = p_prioridade)
        and (p_tipo is null or os.tipo_servico_id = p_tipo)
        and (p_cliente is null or os.cliente_id = p_cliente)
        and (p_equipamento is null or os.equipamento_id = p_equipamento)
        and (p_tecnico is null or (p_tecnico = 'sem' and os.tecnico_id is null) or os.tecnico_id = v_tecnico)
        and (v_padrao is null or os.busca like v_padrao or c.busca like v_padrao or e.busca like v_padrao)
    ) f
    where p_sla is null or f.sla = p_sla
    order by 1
    limit v_limite offset v_offset
  ) x;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end;
$$;

create or replace function public.obter_ordem_servico(p_os_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_contato boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  v_contato := public.tem_permissao('customers.view');

  select
    (to_jsonb(os) - 'busca') || jsonb_build_object(
      'sla', public.situacao_sla_os(os.prazo_em, os.criado_em, os.concluido_em, s.categoria),
      'subtotal_itens', coalesce((select sum(i.subtotal) from public.os_itens i where i.os_id = os.id), 0),
      'status', jsonb_build_object('id', s.id, 'nome', s.nome, 'cor', s.cor, 'categoria', s.categoria, 'chave', s.chave),
      'cliente', jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'arquivado', c.arquivado_em is not null,
        'telefone', case when v_contato then c.telefone end,
        'email', case when v_contato then c.email end,
        'documento', case when v_contato then c.documento end
      ),
      'endereco', case when en.id is null then null else jsonb_build_object(
        'id', en.id, 'rotulo', en.rotulo, 'logradouro', en.logradouro, 'numero', en.numero,
        'complemento', en.complemento, 'bairro', en.bairro, 'cidade', en.cidade, 'estado', en.estado) end,
      'equipamento', case when e.id is null then null else jsonb_build_object(
        'id', e.id, 'nome', e.nome, 'marca', e.marca, 'modelo', e.modelo, 'numero_serie', e.numero_serie) end,
      'prioridade', case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'cor', p.cor, 'nivel', p.nivel, 'sla_horas', p.sla_horas) end,
      'tipo_servico', case when t.id is null then null else jsonb_build_object('id', t.id, 'nome', t.nome) end,
      'tecnico', case when tec.id is null then null else jsonb_build_object(
        'id', tec.id, 'nome', nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), ''), 'ativo', tec.ativo) end,
      'criador', case when uc.id is null then null else jsonb_build_object('id', uc.id, 'nome', uc.nome) end,
      'atualizador', case when ua.id is null then null else jsonb_build_object('id', ua.id, 'nome', ua.nome) end
    )
  into v_resultado
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id and s.loja_id = v_loja
  join public.clientes c on c.id = os.cliente_id and c.loja_id = v_loja
  left join public.cliente_enderecos en on en.id = os.cliente_endereco_id and en.loja_id = v_loja
  left join public.equipamentos e on e.id = os.equipamento_id and e.loja_id = v_loja
  left join public.prioridades_os p on p.id = os.prioridade_id and p.loja_id = v_loja
  left join public.tipos_servico t on t.id = os.tipo_servico_id and t.loja_id = v_loja
  left join public.tecnicos tec on tec.id = os.tecnico_id and tec.loja_id = v_loja
  left join public.usuarios uc on uc.id = os.criado_por and uc.loja_id = v_loja
  left join public.usuarios ua on ua.id = os.atualizado_por and ua.loja_id = v_loja
  where os.id = p_os_id and os.loja_id = v_loja;

  if v_resultado is null then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  return v_resultado;
end;
$$;

create or replace function public.historico_status_os(p_os_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ordens_servico where id = p_os_id and loja_id = v_loja) then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', h.id,
             'criado_em', h.criado_em,
             'usuario', u.nome,
             'de', case when sa.id is null then null else jsonb_build_object('nome', sa.nome, 'cor', sa.cor) end,
             'para', case when sn.id is null then null else jsonb_build_object('nome', sn.nome, 'cor', sn.cor, 'categoria', sn.categoria) end,
             'observacao', h.observacao)
           order by h.criado_em desc, h.id), '[]'::jsonb)
    from public.os_historico h
    left join public.usuarios u on u.id = h.usuario_id and u.loja_id = v_loja
    left join public.status_os sa on sa.id = h.status_anterior_id and sa.loja_id = v_loja
    left join public.status_os sn on sn.id = h.status_novo_id and sn.loja_id = v_loja
    where h.os_id = p_os_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------
drop policy os_select on public.ordens_servico;
drop policy os_insert on public.ordens_servico;
drop policy os_update on public.ordens_servico;
drop policy os_delete on public.ordens_servico;

create policy os_select on public.ordens_servico for select to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('service_orders'))
         and (select public.tem_permissao('service_orders.view')));
create policy os_insert on public.ordens_servico for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('service_orders'))
              and (select public.tem_permissao('service_orders.create')));
create policy os_update on public.ordens_servico for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_feature('service_orders'))
         and ((select public.tem_permissao('service_orders.edit')) or (select public.tem_permissao('service_orders.assign'))))
  with check (loja_id = (select public.loja_operacional_id()));
-- sem política de exclusão: OS é cancelada, nunca apagada

drop policy os_itens_insert on public.os_itens;
drop policy os_itens_update on public.os_itens;
drop policy os_itens_delete on public.os_itens;

create policy os_itens_insert on public.os_itens for insert to authenticated
  with check (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id)
              and (select public.tem_permissao('service_orders.edit')));
create policy os_itens_update on public.os_itens for update to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id)
         and (select public.tem_permissao('service_orders.edit')))
  with check (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id));
create policy os_itens_delete on public.os_itens for delete to authenticated
  using (exists (select 1 from public.ordens_servico os where os.id = os_itens.os_id)
         and (select public.tem_permissao('service_orders.edit')));

-- histórico de status só pelo banco
drop policy os_historico_insert on public.os_historico;

-- ---------------------------------------------------------------------
-- 10. Dashboard: SLA real (atrasadas / vencendo), OS por técnico e número na atividade
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
  v_ver_tecnicos boolean;
  v_ver_equipamentos boolean;
  v_campo_data text;
  v_passo interval;
  v_cards jsonb;
  v_por_status jsonb;
  v_por_periodo jsonb;
  v_por_tecnico jsonb;
  v_por_prioridade jsonb;
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
  v_ver_tecnicos := public.tem_feature('technicians') and public.tem_permissao('technicians.view');
  v_ver_equipamentos := public.tem_feature('assets') and public.tem_permissao('assets.view');

  if p_fim - p_inicio <= interval '62 days' then
    v_campo_data := 'day';
    v_passo := interval '1 day';
  else
    v_campo_data := 'month';
    v_passo := interval '1 month';
  end if;

  v_cards := jsonb_build_object(
    'os_abertas', null, 'os_agendadas', null, 'os_em_andamento', null, 'os_pausadas', null,
    'os_criadas_periodo', null, 'os_finalizadas_periodo', null,
    'clientes_total', null, 'clientes_novos_periodo', null,
    'tecnicos_ativos', null, 'equipamentos', null,
    'os_atrasadas', null, 'os_vencendo', null, 'faturamento_periodo', null
  );

  if v_ver_os then
    select v_cards || jsonb_build_object(
      'os_abertas', count(*) filter (where s.categoria = 'aberto'),
      'os_agendadas', count(*) filter (where s.categoria = 'agendado'),
      'os_em_andamento', count(*) filter (where s.categoria = 'em_andamento'),
      'os_pausadas', count(*) filter (where s.categoria = 'pausado'),
      'os_atrasadas', count(*) filter (where public.situacao_sla_os(os.prazo_em, os.criado_em, os.concluido_em, s.categoria) = 'atrasada'),
      'os_vencendo', count(*) filter (where public.situacao_sla_os(os.prazo_em, os.criado_em, os.concluido_em, s.categoria) = 'vencendo'),
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
      'clientes_total', count(*) filter (where c.arquivado_em is null),
      'clientes_novos_periodo', count(*) filter (where c.criado_em >= p_inicio and c.criado_em < p_fim)
    )
    into v_cards
    from public.clientes c
    where c.loja_id = v_loja;
  end if;

  if v_ver_tecnicos then
    select v_cards || jsonb_build_object('tecnicos_ativos', count(*))
    into v_cards
    from public.tecnicos t
    where t.loja_id = v_loja and t.ativo;
  end if;

  if v_ver_equipamentos then
    select v_cards || jsonb_build_object('equipamentos', count(*))
    into v_cards
    from public.equipamentos e
    where e.loja_id = v_loja and e.arquivado_em is null;
  end if;

  if not v_ver_os then
    return jsonb_build_object(
      'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                    'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
      'cards', v_cards,
      'os_por_status', null, 'os_por_periodo', null, 'os_por_tecnico', null, 'os_por_prioridade', null
    );
  end if;

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
    having s.ativo or count(os.id) > 0
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'nome', t.nome, 'cor', t.cor, 'nivel', t.nivel, 'total', t.total)
         order by t.ordem, t.nome), '[]'::jsonb)
  into v_por_prioridade
  from (
    select p.id, p.nome, p.cor, p.nivel, p.ordem, count(os.id) as total
    from public.prioridades_os p
    left join public.ordens_servico os
      on os.prioridade_id = p.id and os.loja_id = v_loja
     and os.criado_em >= p_inicio and os.criado_em < p_fim
    where p.loja_id = v_loja
    group by p.id
    having p.ativo or count(os.id) > 0
  ) t;

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

  select coalesce(jsonb_agg(jsonb_build_object('id', t.tecnico_id, 'nome', t.nome, 'total', t.total)
         order by t.total desc, t.nome), '[]'::jsonb)
  into v_por_tecnico
  from (
    select os.tecnico_id,
           coalesce(nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), ''), 'Sem técnico') as nome,
           count(*) as total
    from public.ordens_servico os
    left join public.tecnicos tec on tec.id = os.tecnico_id and tec.loja_id = v_loja
    where os.loja_id = v_loja and os.criado_em >= p_inicio and os.criado_em < p_fim
    group by os.tecnico_id, tec.nome, tec.sobrenome
    order by count(*) desc
    limit 50
  ) t;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'fuso', p_fuso,
                                  'granularidade', case v_campo_data when 'day' then 'dia' else 'mes' end),
    'cards', v_cards,
    'os_por_status', v_por_status,
    'os_por_periodo', v_por_periodo,
    'os_por_tecnico', v_por_tecnico,
    'os_por_prioridade', v_por_prioridade
  );
end;
$$;

create or replace function public.dashboard_atividade(p_limite int default 15)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_limite, 15), 1), 50);
  v_ver_os boolean;
  v_ver_clientes boolean;
  v_ver_tecnicos boolean;
  v_ver_equipamentos boolean;
  v_ver_equipe boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_permissao('dashboard.view') then
    raise exception 'Acesso negado ao dashboard.' using errcode = '42501';
  end if;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');
  v_ver_clientes := public.tem_feature('customers') and public.tem_permissao('customers.view');
  v_ver_tecnicos := public.tem_feature('technicians') and public.tem_permissao('technicians.view');
  v_ver_equipamentos := public.tem_feature('assets') and public.tem_permissao('assets.view');
  v_ver_equipe := public.tem_permissao('team.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'acao', t.acao,
           'criado_em', t.criado_em,
           'usuario', t.usuario_nome,
           'os', case when t.os_id is null then null
                      else jsonb_build_object('id', t.os_id, 'numero', t.os_numero, 'cliente', t.os_cliente) end,
           'status_novo', t.status_novo,
           'cliente', t.cliente_nome,
           'cliente_id', t.cliente_id,
           'tecnico', t.tecnico_nome,
           'equipamento', t.equipamento_nome,
           'equipamento_id', t.equipamento_id,
           'funcionario', t.funcionario_nome,
           'item', t.item)
         order by t.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      e.id, e.acao, e.criado_em,
      u.nome as usuario_nome,
      os.id as os_id,
      os.numero as os_numero,
      e.detalhes->>'item' as item,
      cos.nome as os_cliente,
      st.nome as status_novo,
      cli.id as cliente_id,
      cli.nome as cliente_nome,
      nullif(btrim(tec.nome || ' ' || coalesce(tec.sobrenome, '')), '') as tecnico_nome,
      eq.id as equipamento_id,
      eq.nome as equipamento_nome,
      fu.nome as funcionario_nome
    from public.log_eventos e
    left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
    left join public.ordens_servico os on os.id::text = e.detalhes->>'os_id' and os.loja_id = v_loja
    left join public.clientes cos on cos.id = os.cliente_id and cos.loja_id = v_loja
    left join public.status_os st on st.id::text = e.detalhes->>'para' and st.loja_id = v_loja
    left join public.clientes cli on cli.id::text = e.detalhes->>'cliente_id' and cli.loja_id = v_loja
    left join public.tecnicos tec on tec.id::text = e.detalhes->>'tecnico_id' and tec.loja_id = v_loja
    left join public.equipamentos eq on eq.id::text = e.detalhes->>'equipamento_id' and eq.loja_id = v_loja
    left join public.usuarios fu on fu.id::text = e.detalhes->>'funcionario_id' and fu.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        (e.acao like 'os\_%' and v_ver_os)
        or (e.acao = 'cliente_cadastrado' and v_ver_clientes)
        or (e.acao = 'tecnico_cadastrado' and v_ver_tecnicos)
        or (e.acao = 'equipamento_cadastrado' and v_ver_equipamentos)
        or (e.acao like 'funcionario\_%' and v_ver_equipe)
      )
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

-- ---------------------------------------------------------------------
-- 11. Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.trg_ordens_servico_numerar() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_regras() from public, anon, authenticated;
revoke execute on function public.trg_ordens_servico_log() from public, anon, authenticated;
revoke execute on function public.trg_os_itens_regras() from public, anon, authenticated;
revoke execute on function public.trg_os_itens_totais() from public, anon, authenticated;

revoke execute on function public.situacao_sla_os(timestamptz, timestamptz, timestamptz, public.categoria_status) from public, anon;
revoke execute on function public.alterar_status_os(uuid, uuid, text) from public, anon;
revoke execute on function public.listar_ordens_servico(text, text, uuid, uuid, text, uuid, uuid, uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.obter_ordem_servico(uuid) from public, anon;
revoke execute on function public.historico_status_os(uuid) from public, anon;
grant execute on function public.situacao_sla_os(timestamptz, timestamptz, timestamptz, public.categoria_status) to authenticated;
grant execute on function public.alterar_status_os(uuid, uuid, text) to authenticated;
grant execute on function public.listar_ordens_servico(text, text, uuid, uuid, text, uuid, uuid, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.obter_ordem_servico(uuid) to authenticated;
grant execute on function public.historico_status_os(uuid) to authenticated;
