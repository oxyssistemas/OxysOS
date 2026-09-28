-- =====================================================================
-- Fase 3 · 19 — Evidências: permissão de campo e autoria (etapa 12)
-- * `attachments.upload` passa a valer para enviar e para remover o que
--   a própria pessoa enviou (é a permissão do cargo de campo).
-- * O anexo guarda o técnico que registrou — preenchido pelo servidor a
--   partir do login, nunca pelo cliente.
-- * `anexos_os` devolve categoria, técnico e autor para a galeria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage: quem tem attachments.upload também envia arquivo da OS
-- ---------------------------------------------------------------------
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
    when 'enviar' then public.tem_permissao('service_orders.edit') or public.tem_permissao('attachments.upload')
    else false
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Regras do anexo: permissão de campo, autoria do técnico e imutabilidade
-- ---------------------------------------------------------------------
create or replace function public.trg_os_anexos_regras()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_metadados jsonb;
begin
  if tg_op = 'INSERT' then
    if v_uid is not null
       and not (public.tem_permissao('service_orders.edit') or public.tem_permissao('attachments.upload')) then
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
    -- a autoria de campo sai do login, não do que o cliente mandou (§32)
    new.tecnico_id := case when v_uid is null then new.tecnico_id else public.tecnico_do_usuario() end;
    new.criado_em := now();
    new.removido_em := null;
    new.removido_por := null;
    return new;
  end if;

  -- UPDATE: só a remoção (lógica) é permitida
  if (new.id, new.loja_id, new.os_id, new.tipo, new.momento, new.nome_arquivo, new.caminho, new.mime_type,
      new.tamanho_bytes, new.descricao, new.enviado_por, new.tecnico_id, new.criado_em)
     is distinct from
     (old.id, old.loja_id, old.os_id, old.tipo, old.momento, old.nome_arquivo, old.caminho, old.mime_type,
      old.tamanho_bytes, old.descricao, old.enviado_por, old.tecnico_id, old.criado_em) then
    raise exception 'Anexos não podem ser alterados; envie um novo arquivo.' using errcode = '42501';
  end if;
  if old.removido_em is not null then
    raise exception 'Este anexo já foi removido.' using errcode = '23514';
  end if;
  if new.removido_em is not null then
    -- quem edita a OS remove qualquer anexo; quem só anexa remove o que enviou
    if v_uid is not null and not (
         public.tem_permissao('service_orders.edit')
         or (public.tem_permissao('attachments.upload') and old.enviado_por = v_uid)
       ) then
      raise exception 'Sem permissão para remover anexos.' using errcode = '42501';
    end if;
    new.removido_em := now();
    new.removido_por := coalesce(v_uid, new.removido_por);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS: a mesma regra nas políticas da tabela
-- ---------------------------------------------------------------------
drop policy if exists os_anexos_insert on public.os_anexos;
create policy os_anexos_insert on public.os_anexos for insert to authenticated
  with check (
    loja_id = (select public.loja_operacional_id())
    and ((select public.tem_permissao('service_orders.edit'))
         or (select public.tem_permissao('attachments.upload')))
    and exists (select 1 from public.ordens_servico os where os.id = os_anexos.os_id)
  );

drop policy if exists os_anexos_update on public.os_anexos;
create policy os_anexos_update on public.os_anexos for update to authenticated
  using (
    loja_id = (select public.loja_operacional_id())
    and ((select public.tem_permissao('service_orders.edit'))
         or ((select public.tem_permissao('attachments.upload')) and enviado_por = (select auth.uid())))
  )
  with check (loja_id = (select public.loja_operacional_id()));

-- ---------------------------------------------------------------------
-- Galeria: categoria, técnico e autor
-- ---------------------------------------------------------------------
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
             'descricao', a.descricao, 'criado_em', a.criado_em, 'enviado_por', u.nome,
             'tecnico', nullif(btrim(coalesce(t.nome, '') || ' ' || coalesce(t.sobrenome, '')), ''),
             'meu', a.enviado_por = auth.uid())
           order by a.criado_em desc, a.id), '[]'::jsonb)
    from public.os_anexos a
    left join public.usuarios u on u.id = a.enviado_por and u.loja_id = v_loja
    left join public.tecnicos t on t.id = a.tecnico_id and t.loja_id = v_loja
    where a.os_id = p_os_id and a.loja_id = v_loja and a.removido_em is null
  );
end;
$$;
