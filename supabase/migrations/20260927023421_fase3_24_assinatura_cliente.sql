-- =====================================================================
-- Fase 3 · 24 — Assinatura e confirmação do cliente (etapa 14)
-- §37/§38: antes de finalizar, o cliente confirma o atendimento com nome
-- de quem acompanhou, documento (opcional), observações e a assinatura
-- feita na tela. A imagem fica no banco (PNG), atrás de RLS e só com
-- escrita por função: nada de arquivo solto no bucket. O servidor
-- confere que é mesmo um PNG, grava o SHA-256 dos bytes e usa o próprio
-- relógio. Assinatura não é apagada nem editada: uma nova substitui a
-- anterior, que continua no histórico.
-- =====================================================================

create table public.os_assinaturas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  os_id uuid not null,
  agendamento_id uuid,
  tecnico_id uuid,
  nome_responsavel text not null,
  documento text,
  observacao text,
  imagem_png text not null,
  hash_sha256 text not null,
  assinado_em timestamptz not null default now(),
  registrado_por uuid references public.usuarios(id) on delete set null,
  substituida_em timestamptz,
  substituida_por uuid references public.usuarios(id) on delete set null,
  constraint os_assinaturas_loja_id_id_key unique (loja_id, id),
  constraint os_assinaturas_os_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint os_assinaturas_agendamento_fkey foreign key (loja_id, agendamento_id)
    references public.agendamentos(loja_id, id) on delete set null (agendamento_id),
  constraint os_assinaturas_tecnico_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete set null (tecnico_id),
  constraint os_assinaturas_nome_tamanho check (length(btrim(nome_responsavel)) between 2 and 120),
  constraint os_assinaturas_documento_tamanho check (documento is null or length(btrim(documento)) between 3 and 30),
  constraint os_assinaturas_observacao_tamanho check (observacao is null or length(observacao) <= 500),
  constraint os_assinaturas_imagem_formato check (
    imagem_png like 'data:image/png;base64,%' and length(imagem_png) between 200 and 400000),
  constraint os_assinaturas_hash_formato check (hash_sha256 ~ '^[0-9a-f]{64}$')
);

comment on table public.os_assinaturas is
  'Confirmação do cliente na OS (§37/§38). Só a linha sem substituida_em vale; as outras são histórico.';

-- uma assinatura válida por OS
create unique index os_assinaturas_uma_valida on public.os_assinaturas(os_id) where substituida_em is null;
create index idx_os_assinaturas_os on public.os_assinaturas(loja_id, os_id, assinado_em desc);
create index idx_os_assinaturas_tecnico on public.os_assinaturas(loja_id, tecnico_id) where tecnico_id is not null;

alter table public.os_assinaturas enable row level security;

-- leitura para quem vê a OS; escrita só pela função abaixo
create policy os_assinaturas_select on public.os_assinaturas for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('service_orders'))
    and (select public.tem_permissao('service_orders.view'))
  );

-- ---------------------------------------------------------------------
-- Registrar
-- ---------------------------------------------------------------------
create or replace function public.registrar_assinatura_os(
  p_os_id uuid,
  p_nome text,
  p_documento text,
  p_observacao text,
  p_imagem text,
  p_agendamento_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_uid uuid := auth.uid();
  v_categoria public.categoria_status;
  v_cliente uuid;
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_documento text := nullif(btrim(coalesce(p_documento, '')), '');
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_bytes bytea;
  v_hash text;
  v_anterior uuid;
  v_id uuid;
  v_agora timestamptz := now();
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.sign') then
    raise exception 'Sem permissão para colher a assinatura do cliente.' using errcode = '42501';
  end if;

  -- trava a OS: duas assinaturas ao mesmo tempo não disputam a vaga
  select s.categoria, os.cliente_id into v_categoria, v_cliente
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id
  where os.id = p_os_id and os.loja_id = v_loja
  for update of os;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if v_categoria in ('finalizado_sucesso', 'finalizado_cancelado') then
    raise exception 'OS encerrada: a assinatura é colhida antes de finalizar.' using errcode = '23514';
  end if;

  if p_agendamento_id is not null and not exists (
    select 1 from public.agendamentos a
    where a.id = p_agendamento_id and a.os_id = p_os_id and a.loja_id = v_loja
  ) then
    raise exception 'Atendimento não encontrado nesta OS.' using errcode = 'P0002';
  end if;

  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'Informe o nome de quem acompanhou o atendimento.' using errcode = '22023';
  end if;
  if v_documento is not null and length(v_documento) not between 3 and 30 then
    raise exception 'O documento deve ter entre 3 e 30 caracteres.' using errcode = '22023';
  end if;
  if length(v_observacao) > 500 then
    raise exception 'As observações devem ter até 500 caracteres.' using errcode = '22023';
  end if;

  -- a imagem precisa ser um PNG de verdade, não só dizer que é
  if p_imagem is null or p_imagem not like 'data:image/png;base64,%' or length(p_imagem) > 400000 then
    raise exception 'Assinatura inválida.' using errcode = '22023';
  end if;
  begin
    v_bytes := decode(substr(p_imagem, 23), 'base64');
  exception when others then
    raise exception 'Assinatura inválida.' using errcode = '22023';
  end;
  if length(v_bytes) < 100 or substring(v_bytes from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then
    raise exception 'Assinatura inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(v_bytes, 'sha256'), 'hex');

  update public.os_assinaturas
     set substituida_em = v_agora, substituida_por = v_uid
   where os_id = p_os_id and loja_id = v_loja and substituida_em is null
  returning id into v_anterior;

  insert into public.os_assinaturas (loja_id, os_id, agendamento_id, tecnico_id, nome_responsavel, documento,
                                     observacao, imagem_png, hash_sha256, assinado_em, registrado_por)
  values (v_loja, p_os_id, p_agendamento_id, public.tecnico_do_usuario(), v_nome, v_documento,
          v_observacao, p_imagem, v_hash, v_agora, v_uid)
  returning id into v_id;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, v_uid, 'os_assinatura_registrada', jsonb_build_object(
    'os_id', p_os_id, 'cliente_id', v_cliente, 'assinatura_id', v_id,
    'responsavel', v_nome, 'tecnico_id', public.tecnico_do_usuario(),
    'substituiu', v_anterior is not null, 'observacao', v_observacao));

  return jsonb_build_object('id', v_id, 'assinado_em', v_agora, 'hash_sha256', v_hash,
                            'substituiu', v_anterior is not null);
end;
$$;

-- ---------------------------------------------------------------------
-- Consultar
-- ---------------------------------------------------------------------
create or replace function public.assinatura_os(p_os_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_categoria public.categoria_status;
begin
  if v_loja is null or not public.tem_feature('service_orders') or not public.tem_permissao('service_orders.view') then
    raise exception 'Sem acesso às ordens de serviço.' using errcode = '42501';
  end if;
  select s.categoria into v_categoria
  from public.ordens_servico os
  join public.status_os s on s.id = os.status_id
  where os.id = p_os_id and os.loja_id = v_loja;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'pode_assinar', public.tem_permissao('service_orders.sign')
                    and v_categoria not in ('finalizado_sucesso', 'finalizado_cancelado'),
    'encerrada', v_categoria in ('finalizado_sucesso', 'finalizado_cancelado'),
    'atual', (
      select jsonb_build_object(
               'id', a.id, 'nome_responsavel', a.nome_responsavel, 'documento', a.documento,
               'observacao', a.observacao, 'imagem_png', a.imagem_png, 'hash_sha256', a.hash_sha256,
               'assinado_em', a.assinado_em, 'registrado_por', u.nome,
               'tecnico', nullif(btrim(coalesce(t.nome, '') || ' ' || coalesce(t.sobrenome, '')), ''))
      from public.os_assinaturas a
      left join public.usuarios u on u.id = a.registrado_por and u.loja_id = v_loja
      left join public.tecnicos t on t.id = a.tecnico_id and t.loja_id = v_loja
      where a.os_id = p_os_id and a.loja_id = v_loja and a.substituida_em is null
    ),
    -- o histórico não carrega as imagens antigas (só quem, quando e o hash)
    'substituidas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'nome_responsavel', a.nome_responsavel, 'assinado_em', a.assinado_em,
               'substituida_em', a.substituida_em, 'hash_sha256', a.hash_sha256)
             order by a.assinado_em desc), '[]'::jsonb)
      from public.os_assinaturas a
      where a.os_id = p_os_id and a.loja_id = v_loja and a.substituida_em is not null
    ));
end;
$$;

-- ---------------------------------------------------------------------
-- Linha do tempo: nome de quem assinou e se substituiu outra
-- ---------------------------------------------------------------------
create or replace function public.timeline_os(p_os_id uuid, p_limite integer default 300)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
            'substituiu', e.detalhes->'substituiu'
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
$$;

revoke execute on function public.registrar_assinatura_os(uuid, text, text, text, text, uuid) from public, anon;
revoke execute on function public.assinatura_os(uuid) from public, anon;
grant execute on function public.registrar_assinatura_os(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.assinatura_os(uuid) to authenticated;
