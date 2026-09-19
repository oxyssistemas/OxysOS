-- =====================================================================
-- Fase 2 · 15 — Anexos da OS e linha do tempo
--
-- * Bucket privado os-anexos (fotos e documentos; vídeo previsto no tipo,
--   ainda não aceito). Caminho obrigatório: <empresa>/<os>/<arquivo>;
--   o Storage só aceita arquivos de OS da empresa do usuário.
-- * os_anexos: tipo, tamanho e formato lidos do próprio Storage (não do
--   navegador), limites por tipo, remoção lógica (nada é apagado).
-- * Histórico imutável: eventos só são gravados pelo banco/servidor;
--   comentários da OS não podem ser editados nem apagados.
-- * timeline_os(): eventos da OS com nomes resolvidos + comentários.
-- * os_fotos (sem registros) é substituída por os_anexos.
-- =====================================================================

alter table public.ordens_servico add constraint ordens_servico_loja_id_id_key unique (loja_id, id);

-- ---------------------------------------------------------------------
-- 1. Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'os-anexos', 'os-anexos', false, 20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <empresa>/<os>/<arquivo>: empresa do usuário, OS existente dessa empresa e permissão da ação
create or replace function public.pode_acessar_arquivo_os(p_nome text, p_acao text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_pastas text[];
  v_os uuid;
begin
  if v_loja is null or not public.tem_feature('service_orders') then
    return false;
  end if;
  v_pastas := storage.foldername(p_nome);
  if coalesce(array_length(v_pastas, 1), 0) <> 2 or v_pastas[1] <> v_loja::text then
    return false;
  end if;
  begin
    v_os := v_pastas[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if not exists (select 1 from public.ordens_servico where id = v_os and loja_id = v_loja) then
    return false;
  end if;
  return case p_acao
    when 'ver' then public.tem_permissao('service_orders.view')
    when 'enviar' then public.tem_permissao('service_orders.edit')
    else false
  end;
end;
$$;

create policy os_anexos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'os-anexos' and public.pode_acessar_arquivo_os(name, 'ver'));
create policy os_anexos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'os-anexos' and public.pode_acessar_arquivo_os(name, 'enviar'));

-- ---------------------------------------------------------------------
-- 2. Anexos
-- ---------------------------------------------------------------------
create type public.tipo_anexo_os as enum ('foto', 'documento', 'video');
create type public.momento_foto_os as enum ('antes', 'durante', 'depois');

create table public.os_anexos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  os_id uuid not null,
  tipo public.tipo_anexo_os not null,
  momento public.momento_foto_os,
  nome_arquivo text not null,
  caminho text not null,
  mime_type text not null,
  tamanho_bytes bigint not null,
  descricao text,
  enviado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  removido_em timestamptz,
  removido_por uuid references public.usuarios(id) on delete set null,
  constraint os_anexos_loja_id_id_key unique (loja_id, id),
  constraint os_anexos_os_mesma_loja_fkey foreign key (loja_id, os_id)
    references public.ordens_servico(loja_id, id) on delete cascade,
  constraint os_anexos_caminho_key unique (caminho),
  constraint os_anexos_nome_tamanho check (length(btrim(nome_arquivo)) between 1 and 200),
  constraint os_anexos_descricao_tamanho check (descricao is null or length(descricao) <= 500),
  constraint os_anexos_momento_so_foto check (momento is null or tipo = 'foto'),
  constraint os_anexos_tamanho_positivo check (tamanho_bytes > 0)
);

create index idx_os_anexos_os on public.os_anexos(os_id, criado_em desc);
create index idx_os_anexos_enviado_por on public.os_anexos(enviado_por);
create index idx_os_anexos_removido_por on public.os_anexos(removido_por);

create or replace function public.trg_os_anexos_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_metadados jsonb;
begin
  if tg_op = 'INSERT' then
    if v_uid is not null and not public.tem_permissao('service_orders.edit') then
      raise exception 'Sem permissão para anexar arquivos à OS.' using errcode = '42501';
    end if;
    if position(new.loja_id::text || '/' || new.os_id::text || '/' in new.caminho) <> 1 then
      raise exception 'Caminho do arquivo inválido.' using errcode = '42501';
    end if;

    -- tamanho e formato vêm do que foi realmente gravado no Storage
    select metadata into v_metadados
    from storage.objects
    where bucket_id = 'os-anexos' and name = new.caminho;
    if not found then
      raise exception 'Arquivo não encontrado no armazenamento. Envie novamente.' using errcode = '23514';
    end if;
    new.mime_type := coalesce(v_metadados->>'mimetype', '');
    new.tamanho_bytes := coalesce((v_metadados->>'size')::bigint, 0);

    if new.mime_type like 'video/%' then
      raise exception 'Vídeos ainda não são aceitos.' using errcode = '23514';
    elsif new.mime_type like 'image/%' then
      new.tipo := 'foto';
      if new.tamanho_bytes > 10485760 then
        raise exception 'A foto deve ter no máximo 10 MB.' using errcode = '23514';
      end if;
    else
      new.tipo := 'documento';
      new.momento := null;
      if new.tamanho_bytes > 20971520 then
        raise exception 'O documento deve ter no máximo 20 MB.' using errcode = '23514';
      end if;
    end if;

    new.nome_arquivo := left(btrim(regexp_replace(coalesce(new.nome_arquivo, ''), '\s+', ' ', 'g')), 200);
    new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
    new.enviado_por := coalesce(v_uid, new.enviado_por);
    new.criado_em := now();
    new.removido_em := null;
    new.removido_por := null;
    return new;
  end if;

  -- UPDATE: só a remoção (lógica) é permitida
  if (new.id, new.loja_id, new.os_id, new.tipo, new.momento, new.nome_arquivo, new.caminho, new.mime_type,
      new.tamanho_bytes, new.descricao, new.enviado_por, new.criado_em)
     is distinct from
     (old.id, old.loja_id, old.os_id, old.tipo, old.momento, old.nome_arquivo, old.caminho, old.mime_type,
      old.tamanho_bytes, old.descricao, old.enviado_por, old.criado_em) then
    raise exception 'Anexos não podem ser alterados; envie um novo arquivo.' using errcode = '42501';
  end if;
  if old.removido_em is not null then
    raise exception 'Este anexo já foi removido.' using errcode = '23514';
  end if;
  if new.removido_em is not null then
    if v_uid is not null and not public.tem_permissao('service_orders.edit') then
      raise exception 'Sem permissão para remover anexos.' using errcode = '42501';
    end if;
    new.removido_em := now();
    new.removido_por := coalesce(v_uid, new.removido_por);
  end if;
  return new;
end;
$$;

create trigger os_anexos_regras
  before insert or update on public.os_anexos
  for each row execute function public.trg_os_anexos_regras();

create or replace function public.trg_os_anexos_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid;
begin
  select cliente_id into v_cliente from public.ordens_servico where id = new.os_id;
  if tg_op = 'INSERT' then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'os_anexo_adicionado',
            jsonb_build_object('os_id', new.os_id, 'cliente_id', v_cliente, 'anexo_id', new.id,
                               'nome', new.nome_arquivo, 'tipo', new.tipo));
  elsif new.removido_em is not null and old.removido_em is null then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'os_anexo_removido',
            jsonb_build_object('os_id', new.os_id, 'cliente_id', v_cliente, 'anexo_id', new.id,
                               'nome', new.nome_arquivo, 'tipo', new.tipo));
  end if;
  return null;
end;
$$;

create trigger os_anexos_log
  after insert or update on public.os_anexos
  for each row execute function public.trg_os_anexos_log();

alter table public.os_anexos enable row level security;
create policy os_anexos_select on public.os_anexos for select to authenticated
  using (loja_id = (select public.loja_operacional_id())
         and exists (select 1 from public.ordens_servico os where os.id = os_anexos.os_id));
create policy os_anexos_insert on public.os_anexos for insert to authenticated
  with check (loja_id = (select public.loja_operacional_id())
              and (select public.tem_permissao('service_orders.edit'))
              and exists (select 1 from public.ordens_servico os where os.id = os_anexos.os_id));
create policy os_anexos_update on public.os_anexos for update to authenticated
  using (loja_id = (select public.loja_operacional_id()) and (select public.tem_permissao('service_orders.edit')))
  with check (loja_id = (select public.loja_operacional_id()));
-- sem exclusão: a remoção é lógica e o arquivo continua guardado

-- arquivo enviado cujo registro falhou pode ser apagado por quem enviou (enquanto não estiver vinculado)
create policy os_anexos_storage_delete_orfao on storage.objects for delete to authenticated
  using (
    bucket_id = 'os-anexos'
    and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.os_anexos a where a.caminho = storage.objects.name)
  );

create or replace function public.anexos_os(p_os_id uuid)
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
             'id', a.id, 'tipo', a.tipo, 'momento', a.momento, 'nome_arquivo', a.nome_arquivo,
             'caminho', a.caminho, 'mime_type', a.mime_type, 'tamanho_bytes', a.tamanho_bytes,
             'descricao', a.descricao, 'criado_em', a.criado_em, 'enviado_por', u.nome)
           order by a.criado_em desc, a.id), '[]'::jsonb)
    from public.os_anexos a
    left join public.usuarios u on u.id = a.enviado_por and u.loja_id = v_loja
    where a.os_id = p_os_id and a.loja_id = v_loja and a.removido_em is null
  );
end;
$$;

-- os_fotos nunca recebeu registros: substituída por os_anexos
do $$
begin
  if exists (select 1 from public.os_fotos) then
    raise exception 'os_fotos possui registros: migre para os_anexos antes de remover a tabela.';
  end if;
end $$;
drop policy if exists os_fotos_storage_select on storage.objects;
drop policy if exists os_fotos_storage_insert on storage.objects;
drop table public.os_fotos;

-- ---------------------------------------------------------------------
-- 3. Histórico imutável
-- ---------------------------------------------------------------------
-- eventos só pelo banco (triggers/funções) e pelas funções de servidor
drop policy log_eventos_insert on public.log_eventos;

-- comentários: exigem edição da OS; sem update/delete (não há políticas)
drop policy os_observacoes_insert on public.os_observacoes;
create policy os_observacoes_insert on public.os_observacoes for insert to authenticated
  with check (
    usuario_id = (select auth.uid())
    and (select public.tem_permissao('service_orders.edit'))
    and exists (select 1 from public.ordens_servico os where os.id = os_observacoes.os_id)
  );

create or replace function public.trg_os_observacoes_normalizar()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.texto := btrim(coalesce(new.texto, ''));
  new.criado_em := now();
  return new;
end;
$$;

create trigger os_observacoes_normalizar
  before insert on public.os_observacoes
  for each row execute function public.trg_os_observacoes_normalizar();

alter table public.os_observacoes
  add constraint os_observacoes_texto_tamanho check (length(texto) between 1 and 2000);

create index idx_log_eventos_loja_os on public.log_eventos(loja_id, (detalhes->>'os_id'));

-- ---------------------------------------------------------------------
-- 4. Linha do tempo da OS
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
           order by t.criado_em desc, t.acao <> 'os_criada', t.id), '[]'::jsonb)
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
            'item', e.detalhes->>'item',
            'quantidade', e.detalhes->'quantidade',
            'subtotal', e.detalhes->'subtotal',
            'arquivo', case when e.acao like 'os\_anexo\_%' then e.detalhes->>'nome' end,
            'tipo_anexo', case when e.acao like 'os\_anexo\_%' then e.detalhes->>'tipo' end,
            'checklist', e.detalhes->>'checklist'
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

-- ---------------------------------------------------------------------
-- 5. Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.trg_os_anexos_regras() from public, anon, authenticated;
revoke execute on function public.trg_os_anexos_log() from public, anon, authenticated;
revoke execute on function public.trg_os_observacoes_normalizar() from public, anon, authenticated;
revoke execute on function public.pode_acessar_arquivo_os(text, text) from public, anon;
revoke execute on function public.anexos_os(uuid) from public, anon;
revoke execute on function public.timeline_os(uuid, integer) from public, anon;
grant execute on function public.pode_acessar_arquivo_os(text, text) to authenticated;
grant execute on function public.anexos_os(uuid) to authenticated;
grant execute on function public.timeline_os(uuid, integer) to authenticated;
