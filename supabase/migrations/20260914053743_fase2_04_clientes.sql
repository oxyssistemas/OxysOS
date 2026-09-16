-- =====================================================================
-- Fase 2 · 04 · Módulo de Clientes
--
-- 1. Busca sem acento (unaccent) e por trechos (pg_trgm)
-- 2. Validação de CPF e CNPJ (inclusive CNPJ alfanumérico, vigente desde 07/2026)
-- 3. clientes: PF/PJ, documento, razão social/fantasia, WhatsApp, observações,
--    tags, arquivamento (soft delete), autoria e versão (concorrência otimista)
-- 4. cliente_enderecos: múltiplos endereços, um principal por cliente
-- 5. Permissões customers.* aplicadas no banco (RLS + triggers); sem exclusão definitiva
-- 6. Eventos de atividade e auditoria de arquivamento
-- 7. RPCs: criar_cliente (transacional), clientes_tags, cliente_historico
-- 8. Dashboard passa a contar só clientes ativos e a mostrar só "cliente cadastrado"
-- =====================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Normalização para busca
-- ---------------------------------------------------------------------
create or replace function public.normalizar_busca(p_texto text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, '')));
$$;

-- ---------------------------------------------------------------------
-- 2. Documentos
-- ---------------------------------------------------------------------
create or replace function public.cpf_valido(p_cpf text)
returns boolean
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  v_d int[];
  v_soma int;
  v_resto int;
begin
  if p_cpf is null or p_cpf !~ '^\d{11}$' or p_cpf ~ '^(\d)\1{10}$' then
    return false;
  end if;
  v_d := array(select substr(p_cpf, g, 1)::int from generate_series(1, 11) g order by g);

  v_soma := 0;
  for i in 1..9 loop v_soma := v_soma + v_d[i] * (11 - i); end loop;
  v_resto := (v_soma * 10) % 11;
  if v_resto = 10 then v_resto := 0; end if;
  if v_resto <> v_d[10] then return false; end if;

  v_soma := 0;
  for i in 1..10 loop v_soma := v_soma + v_d[i] * (12 - i); end loop;
  v_resto := (v_soma * 10) % 11;
  if v_resto = 10 then v_resto := 0; end if;
  return v_resto = v_d[11];
end;
$$;

-- CNPJ numérico ou alfanumérico (12 posições [0-9A-Z] + 2 dígitos verificadores;
-- valor de cada caractere = código ASCII − 48)
create or replace function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  v_v int[];
  v_pesos1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_pesos2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_soma int;
  v_resto int;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' or p_cnpj ~ '^(.)\1{13}$' then
    return false;
  end if;
  v_v := array(select ascii(substr(p_cnpj, g, 1)) - 48 from generate_series(1, 14) g order by g);

  v_soma := 0;
  for i in 1..12 loop v_soma := v_soma + v_v[i] * v_pesos1[i]; end loop;
  v_resto := v_soma % 11;
  v_resto := case when v_resto < 2 then 0 else 11 - v_resto end;
  if v_resto <> v_v[13] then return false; end if;

  v_soma := 0;
  for i in 1..13 loop v_soma := v_soma + v_v[i] * v_pesos2[i]; end loop;
  v_resto := v_soma % 11;
  v_resto := case when v_resto < 2 then 0 else 11 - v_resto end;
  return v_resto = v_v[14];
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Clientes
-- ---------------------------------------------------------------------
create type public.tipo_pessoa as enum ('pf', 'pj');

alter table public.clientes
  add column tipo_pessoa public.tipo_pessoa not null default 'pf',
  add column documento text,
  add column razao_social text,
  add column nome_fantasia text,
  add column whatsapp text,
  add column observacoes text,
  add column tags text[] not null default '{}',
  add column criado_por uuid references public.usuarios(id) on delete set null,
  add column atualizado_em timestamptz not null default now(),
  add column atualizado_por uuid references public.usuarios(id) on delete set null,
  add column arquivado_em timestamptz,
  add column arquivado_por uuid references public.usuarios(id) on delete set null,
  add column versao integer not null default 1;

alter table public.clientes
  add constraint clientes_nome_preenchido check (length(btrim(nome)) between 1 and 200),
  add constraint clientes_razao_social_pj check (
    tipo_pessoa = 'pf' or length(btrim(coalesce(razao_social, ''))) between 1 and 200),
  add constraint clientes_documento_valido check (
    documento is null
    or (tipo_pessoa = 'pf' and public.cpf_valido(documento))
    or (tipo_pessoa = 'pj' and public.cnpj_valido(documento))),
  add constraint clientes_email_valido check (
    email is null or (length(email) <= 254 and email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  add constraint clientes_telefone_valido check (
    telefone is null or regexp_replace(telefone, '\D', '', 'g') ~ '^\d{10,11}$'),
  add constraint clientes_whatsapp_valido check (
    whatsapp is null or regexp_replace(whatsapp, '\D', '', 'g') ~ '^\d{10,13}$'),
  add constraint clientes_observacoes_tamanho check (observacoes is null or length(observacoes) <= 5000),
  add constraint clientes_tags_limite check (cardinality(tags) <= 20);

alter table public.clientes
  add column busca text generated always as (
    public.normalizar_busca(
      nome || ' ' || coalesce(razao_social, '') || ' ' || coalesce(nome_fantasia, '') || ' ' ||
      coalesce(documento, '') || ' ' || coalesce(email, '') || ' ' ||
      regexp_replace(coalesce(telefone, ''), '\D', '', 'g') || ' ' ||
      regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')
    )
  ) stored;

create unique index clientes_loja_documento_key on public.clientes(loja_id, documento) where documento is not null;
create index idx_clientes_busca_trgm on public.clientes using gin (busca extensions.gin_trgm_ops);
create index idx_clientes_tags on public.clientes using gin (tags);
create index idx_clientes_loja_ativos_nome on public.clientes(loja_id, nome) where arquivado_em is null;
create index idx_clientes_loja_nome on public.clientes(loja_id, nome);
drop index if exists public.idx_clientes_loja; -- coberto por idx_clientes_loja_nome

-- Normalização (roda antes das regras: triggers BEFORE disparam em ordem alfabética)
create or replace function public.trg_clientes_normalizar()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := btrim(coalesce(new.nome, ''));
  new.documento := nullif(upper(regexp_replace(coalesce(new.documento, ''), '[^0-9A-Za-z]', '', 'g')), '');
  new.razao_social := nullif(btrim(coalesce(new.razao_social, '')), '');
  new.nome_fantasia := nullif(btrim(coalesce(new.nome_fantasia, '')), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.telefone := nullif(btrim(coalesce(new.telefone, '')), '');
  new.whatsapp := nullif(btrim(coalesce(new.whatsapp, '')), '');
  new.observacoes := nullif(btrim(coalesce(new.observacoes, '')), '');
  new.tags := coalesce((
    select array_agg(distinct t order by t)
    from (select lower(btrim(x)) as t from unnest(new.tags) as x) s
    where t <> '' and length(t) <= 40
  ), '{}');

  if new.tipo_pessoa = 'pj' then
    -- nome de exibição da PJ: nome fantasia, senão razão social
    new.nome := coalesce(new.nome_fantasia, new.razao_social, new.nome);
  else
    new.razao_social := null;
    new.nome_fantasia := null;
  end if;
  return new;
end;
$$;

create trigger clientes_a_normalizar
  before insert or update on public.clientes
  for each row execute function public.trg_clientes_normalizar();

-- Regras: autoria, imutáveis, permissões de edição/arquivamento, versão
create or replace function public.trg_clientes_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_dados_mudaram boolean;
  v_arquivamento_mudou boolean;
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then new.criado_por := v_uid; end if;
    new.atualizado_por := new.criado_por;
    new.atualizado_em := now();
    new.arquivado_em := null;
    new.arquivado_por := null;
    new.versao := 1;
    return new;
  end if;

  if new.id <> old.id or new.loja_id <> old.loja_id or new.criado_em <> old.criado_em
     or new.criado_por is distinct from old.criado_por then
    raise exception 'Alteração não permitida.' using errcode = '42501';
  end if;

  v_dados_mudaram :=
    (new.tipo_pessoa, new.nome, new.documento, new.razao_social, new.nome_fantasia,
     new.email, new.telefone, new.whatsapp, new.observacoes, new.tags)
    is distinct from
    (old.tipo_pessoa, old.nome, old.documento, old.razao_social, old.nome_fantasia,
     old.email, old.telefone, old.whatsapp, old.observacoes, old.tags);
  v_arquivamento_mudou := (new.arquivado_em is null) <> (old.arquivado_em is null);

  if v_uid is not null then
    if v_dados_mudaram and not public.tem_permissao('customers.edit') then
      raise exception 'Sem permissão para editar clientes.' using errcode = '42501';
    end if;
    if v_arquivamento_mudou and not public.tem_permissao('customers.archive') then
      raise exception 'Sem permissão para arquivar clientes.' using errcode = '42501';
    end if;
  end if;

  if v_arquivamento_mudou then
    if new.arquivado_em is null then
      new.arquivado_por := null;
    else
      new.arquivado_em := now();
      new.arquivado_por := v_uid;
    end if;
  else
    new.arquivado_em := old.arquivado_em;
    new.arquivado_por := old.arquivado_por;
  end if;

  new.versao := old.versao + 1;
  new.atualizado_em := now();
  new.atualizado_por := v_uid;
  return new;
end;
$$;

create trigger clientes_b_regras
  before insert or update on public.clientes
  for each row execute function public.trg_clientes_regras();

-- Eventos de alteração / arquivamento
create or replace function public.trg_clientes_log_alteracao()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_campos text[] := '{}';
  v_acao text;
begin
  if (new.arquivado_em is null) <> (old.arquivado_em is null) then
    v_acao := case when new.arquivado_em is null then 'cliente_reativado' else 'cliente_arquivado' end;
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), v_acao, jsonb_build_object('cliente_id', new.id));
    insert into public.logs_auditoria (ator_usuario_id, loja_id, acao, tipo_entidade, entidade_id, metadados)
    values (auth.uid(), new.loja_id, v_acao, 'cliente', new.id, jsonb_build_object('nome', new.nome));
  end if;

  if new.tipo_pessoa is distinct from old.tipo_pessoa then v_campos := v_campos || 'tipo'::text; end if;
  if new.nome is distinct from old.nome then v_campos := v_campos || 'nome'::text; end if;
  if new.documento is distinct from old.documento then v_campos := v_campos || 'documento'::text; end if;
  if new.razao_social is distinct from old.razao_social then v_campos := v_campos || 'razao_social'::text; end if;
  if new.nome_fantasia is distinct from old.nome_fantasia then v_campos := v_campos || 'nome_fantasia'::text; end if;
  if new.email is distinct from old.email then v_campos := v_campos || 'email'::text; end if;
  if new.telefone is distinct from old.telefone then v_campos := v_campos || 'telefone'::text; end if;
  if new.whatsapp is distinct from old.whatsapp then v_campos := v_campos || 'whatsapp'::text; end if;
  if new.observacoes is distinct from old.observacoes then v_campos := v_campos || 'observacoes'::text; end if;
  if new.tags is distinct from old.tags then v_campos := v_campos || 'tags'::text; end if;

  if cardinality(v_campos) > 0 then
    insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
    values (new.loja_id, auth.uid(), 'cliente_atualizado', jsonb_build_object('cliente_id', new.id, 'campos', v_campos));
  end if;
  return null;
end;
$$;

create trigger clientes_log_alteracao
  after update on public.clientes
  for each row execute function public.trg_clientes_log_alteracao();

-- ---------------------------------------------------------------------
-- 4. Endereços dos clientes
-- ---------------------------------------------------------------------
create table public.cliente_enderecos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null,
  rotulo text not null default 'Principal',
  cep text,
  logradouro text not null,
  numero text,
  complemento text,
  bairro text,
  cidade text not null,
  estado text not null,
  referencia text,
  principal boolean not null default false,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cliente_enderecos_cliente_mesma_loja_fkey
    foreign key (loja_id, cliente_id) references public.clientes(loja_id, id) on delete cascade,
  constraint cliente_enderecos_loja_id_id_key unique (loja_id, id),
  constraint cliente_enderecos_rotulo_tamanho check (length(rotulo) between 1 and 60),
  constraint cliente_enderecos_cep_valido check (cep is null or cep ~ '^\d{8}$'),
  constraint cliente_enderecos_logradouro check (length(btrim(logradouro)) between 1 and 200),
  constraint cliente_enderecos_cidade check (length(btrim(cidade)) between 1 and 120),
  constraint cliente_enderecos_estado_valido check (estado in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI',
    'RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  constraint cliente_enderecos_tamanhos check (
    coalesce(length(numero), 0) <= 20 and coalesce(length(complemento), 0) <= 120
    and coalesce(length(bairro), 0) <= 120 and coalesce(length(referencia), 0) <= 300)
);

create index idx_cliente_enderecos_loja_cliente on public.cliente_enderecos(loja_id, cliente_id);
create unique index cliente_enderecos_um_principal on public.cliente_enderecos(cliente_id) where principal;

create or replace function public.trg_cliente_enderecos_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.rotulo := coalesce(nullif(btrim(coalesce(new.rotulo, '')), ''), 'Principal');
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  new.estado := upper(btrim(coalesce(new.estado, '')));
  new.logradouro := btrim(coalesce(new.logradouro, ''));
  new.cidade := btrim(coalesce(new.cidade, ''));
  new.numero := nullif(btrim(coalesce(new.numero, '')), '');
  new.complemento := nullif(btrim(coalesce(new.complemento, '')), '');
  new.bairro := nullif(btrim(coalesce(new.bairro, '')), '');
  new.referencia := nullif(btrim(coalesce(new.referencia, '')), '');

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.loja_id <> old.loja_id or new.cliente_id <> old.cliente_id then
      raise exception 'Alteração não permitida.' using errcode = '42501';
    end if;
    -- desmarcar o principal só é feito pelo próprio sistema ao eleger outro endereço
    if old.principal and not new.principal and pg_trigger_depth() <= 1 then
      raise exception 'Defina outro endereço como principal.' using errcode = '23514';
    end if;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  else
    new.criado_por := coalesce(auth.uid(), new.criado_por);
    if not exists (select 1 from public.cliente_enderecos where cliente_id = new.cliente_id and principal) then
      new.principal := true;
    end if;
  end if;

  if new.principal and (tg_op = 'INSERT' or not old.principal) then
    update public.cliente_enderecos
       set principal = false
     where cliente_id = new.cliente_id and id <> new.id and principal;
  end if;

  return new;
end;
$$;

create trigger cliente_enderecos_regras
  before insert or update on public.cliente_enderecos
  for each row execute function public.trg_cliente_enderecos_regras();

create or replace function public.trg_cliente_enderecos_apos()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_registro public.cliente_enderecos;
begin
  if tg_op = 'DELETE' then
    v_registro := old;
  else
    v_registro := new;
  end if;

  -- exclusão em cascata do cliente/empresa: nada a registrar
  if not exists (select 1 from public.clientes where id = v_registro.cliente_id) then
    return null;
  end if;

  if tg_op = 'DELETE' and old.principal then
    update public.cliente_enderecos
       set principal = true
     where id = (select id from public.cliente_enderecos
                  where cliente_id = old.cliente_id order by criado_em limit 1);
  end if;

  -- mudança automática de "principal" feita por outro trigger não gera evento próprio
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return null;
  end if;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (
    v_registro.loja_id,
    auth.uid(),
    case tg_op when 'INSERT' then 'cliente_endereco_adicionado'
               when 'UPDATE' then 'cliente_endereco_atualizado'
               else 'cliente_endereco_removido' end,
    jsonb_build_object('cliente_id', v_registro.cliente_id, 'endereco_id', v_registro.id, 'rotulo', v_registro.rotulo)
  );
  return null;
end;
$$;

create trigger cliente_enderecos_apos
  after insert or update or delete on public.cliente_enderecos
  for each row execute function public.trg_cliente_enderecos_apos();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
drop policy clientes_select on public.clientes;
drop policy clientes_insert on public.clientes;
drop policy clientes_update on public.clientes;
drop policy clientes_delete on public.clientes;

-- Leitura também para quem vê OS (a OS precisa exibir o cliente)
create policy clientes_select on public.clientes for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and ((select public.tem_permissao('customers.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy clientes_insert on public.clientes for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and (select public.tem_permissao('customers.create'))
  );
-- detalhes de edição x arquivamento são verificados no trigger clientes_b_regras
create policy clientes_update on public.clientes for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and ((select public.tem_permissao('customers.edit')) or (select public.tem_permissao('customers.archive')))
  )
  with check (loja_id = (select public.loja_operacional_id()));
-- sem policy de DELETE: clientes são arquivados, nunca excluídos pela aplicação

alter table public.cliente_enderecos enable row level security;

create policy cliente_enderecos_select on public.cliente_enderecos for select to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and ((select public.tem_permissao('customers.view')) or (select public.tem_permissao('service_orders.view')))
  );
create policy cliente_enderecos_insert on public.cliente_enderecos for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and ((select public.tem_permissao('customers.create')) or (select public.tem_permissao('customers.edit')))
  );
create policy cliente_enderecos_update on public.cliente_enderecos for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and (select public.tem_permissao('customers.edit'))
  )
  with check (loja_id = (select public.loja_operacional_id()));
create policy cliente_enderecos_delete on public.cliente_enderecos for delete to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and (select public.tem_feature('customers'))
    and (select public.tem_permissao('customers.edit'))
  );

create index idx_log_eventos_loja_cliente on public.log_eventos(loja_id, (detalhes->>'cliente_id'));

-- ---------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------
-- Cria cliente + endereço principal na mesma transação (SECURITY INVOKER: RLS e triggers valem)
create or replace function public.criar_cliente(p_cliente jsonb, p_endereco jsonb default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_id uuid;
begin
  if v_loja is null then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  insert into public.clientes (
    loja_id, tipo_pessoa, nome, documento, razao_social, nome_fantasia,
    email, telefone, whatsapp, observacoes, tags
  ) values (
    v_loja,
    coalesce(nullif(p_cliente->>'tipo_pessoa', ''), 'pf')::public.tipo_pessoa,
    coalesce(p_cliente->>'nome', ''),
    p_cliente->>'documento',
    p_cliente->>'razao_social',
    p_cliente->>'nome_fantasia',
    p_cliente->>'email',
    p_cliente->>'telefone',
    p_cliente->>'whatsapp',
    p_cliente->>'observacoes',
    coalesce(array(select jsonb_array_elements_text(
      case when jsonb_typeof(p_cliente->'tags') = 'array' then p_cliente->'tags' else '[]'::jsonb end
    )), '{}')
  )
  returning id into v_id;

  if p_endereco is not null and jsonb_typeof(p_endereco) = 'object' then
    insert into public.cliente_enderecos (
      loja_id, cliente_id, rotulo, cep, logradouro, numero, complemento, bairro, cidade, estado, referencia, principal
    ) values (
      v_loja, v_id,
      p_endereco->>'rotulo', p_endereco->>'cep', p_endereco->>'logradouro', p_endereco->>'numero',
      p_endereco->>'complemento', p_endereco->>'bairro', p_endereco->>'cidade', p_endereco->>'estado',
      p_endereco->>'referencia', true
    );
  end if;

  return v_id;
end;
$$;

-- Tags já usadas pela empresa (sugestões e filtro)
create or replace function public.clientes_tags()
returns setof text
language sql stable security invoker set search_path = public as $$
  select distinct t
  from public.clientes c, unnest(c.tags) as t
  where c.loja_id = public.loja_operacional_id()
  order by t
  limit 300;
$$;

-- Histórico do cliente: eventos do cadastro, endereços e das OS dele
create or replace function public.cliente_historico(p_cliente_id uuid, p_limite int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_ver_os boolean;
  v_resultado jsonb;
begin
  if v_loja is null or not public.tem_feature('customers') or not public.tem_permissao('customers.view') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and loja_id = v_loja) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  v_ver_os := public.tem_feature('service_orders') and public.tem_permissao('service_orders.view');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'acao', t.acao, 'criado_em', t.criado_em, 'usuario', t.usuario,
           'campos', t.campos, 'rotulo', t.rotulo, 'status_novo', t.status_novo)
         order by t.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select e.id, e.acao, e.criado_em, u.nome as usuario,
           e.detalhes->'campos' as campos, e.detalhes->>'rotulo' as rotulo, st.nome as status_novo
    from public.log_eventos e
    left join public.usuarios u on u.id = e.usuario_id and u.loja_id = v_loja
    left join public.ordens_servico os on os.id::text = e.detalhes->>'os_id' and os.loja_id = v_loja
    left join public.status_os st on st.id::text = e.detalhes->>'para' and st.loja_id = v_loja
    where e.loja_id = v_loja
      and (
        e.detalhes->>'cliente_id' = p_cliente_id::text
        or (v_ver_os and e.acao like 'os\_%' and os.cliente_id = p_cliente_id)
      )
    order by e.criado_em desc
    limit v_limite
  ) t;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Dashboard: clientes ativos e feed só com "cliente cadastrado"
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

  v_cards := jsonb_build_object(
    'os_abertas', null, 'os_em_andamento', null, 'os_pausadas', null,
    'os_criadas_periodo', null, 'os_finalizadas_periodo', null,
    'clientes_total', null, 'clientes_novos_periodo', null,
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
      'clientes_total', count(*) filter (where c.arquivado_em is null),
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
           'cliente_id', t.cliente_id,
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
      cli.id as cliente_id,
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
        or (e.acao = 'cliente_cadastrado' and v_ver_clientes)
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
-- Permissões de execução
-- ---------------------------------------------------------------------
revoke execute on function public.trg_clientes_normalizar() from public, anon, authenticated;
revoke execute on function public.trg_clientes_regras() from public, anon, authenticated;
revoke execute on function public.trg_clientes_log_alteracao() from public, anon, authenticated;
revoke execute on function public.trg_cliente_enderecos_regras() from public, anon, authenticated;
revoke execute on function public.trg_cliente_enderecos_apos() from public, anon, authenticated;

revoke execute on function public.criar_cliente(jsonb, jsonb) from public, anon;
revoke execute on function public.clientes_tags() from public, anon;
revoke execute on function public.cliente_historico(uuid, int) from public, anon;
grant execute on function public.criar_cliente(jsonb, jsonb) to authenticated;
grant execute on function public.clientes_tags() to authenticated;
grant execute on function public.cliente_historico(uuid, int) to authenticated;
