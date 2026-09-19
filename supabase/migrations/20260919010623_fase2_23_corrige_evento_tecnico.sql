-- =====================================================================
-- Fase 2 · 23 — Auditoria final: evento de técnico (etapa 15)
-- Regressão encontrada na auditoria: desde a fase2_15 (eventos só pelo
-- banco), salvar_tecnico — que roda como o próprio usuário — não
-- conseguia mais gravar o evento de troca de especialidades e a edição
-- do técnico quebrava. O evento passa a ser gravado por uma função de
-- servidor que confere empresa, permissão e o próprio técnico.
-- =====================================================================

create or replace function public.registrar_evento_tecnico(p_tecnico_id uuid, p_campos text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.manage') then
    raise exception 'Sem permissão para gerenciar técnicos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tecnicos where id = p_tecnico_id and loja_id = v_loja) then
    raise exception 'Técnico não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (v_loja, auth.uid(), 'tecnico_atualizado',
          jsonb_build_object('tecnico_id', p_tecnico_id, 'campos', coalesce(p_campos, '{}')));
end;
$$;

revoke execute on function public.registrar_evento_tecnico(uuid, text[]) from public, anon;
grant execute on function public.registrar_evento_tecnico(uuid, text[]) to authenticated;

create or replace function public.salvar_tecnico(
  p_id uuid,
  p_versao integer,
  p_dados jsonb,
  p_especialidades uuid[]
)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_loja uuid := public.loja_operacional_id();
  v_id uuid;
  v_antes uuid[];
  v_depois uuid[];
begin
  if v_loja is null or not public.tem_feature('technicians') or not public.tem_permissao('technicians.manage') then
    raise exception 'Sem permissão para gerenciar técnicos.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.tecnicos (loja_id, usuario_id, nome, sobrenome, email, telefone, documento, observacoes)
    values (
      v_loja,
      nullif(p_dados->>'usuario_id', '')::uuid,
      coalesce(p_dados->>'nome', ''),
      p_dados->>'sobrenome',
      p_dados->>'email',
      p_dados->>'telefone',
      p_dados->>'documento',
      p_dados->>'observacoes'
    )
    returning id into v_id;
  else
    update public.tecnicos
       set usuario_id = nullif(p_dados->>'usuario_id', '')::uuid,
           nome = coalesce(p_dados->>'nome', ''),
           sobrenome = p_dados->>'sobrenome',
           email = p_dados->>'email',
           telefone = p_dados->>'telefone',
           documento = p_dados->>'documento',
           observacoes = p_dados->>'observacoes'
     where id = p_id and versao = p_versao
    returning id into v_id;

    if v_id is null then
      if exists (select 1 from public.tecnicos where id = p_id) then
        raise exception 'Este técnico foi alterado por outra pessoa. Recarregue os dados antes de salvar novamente.'
          using errcode = '40001';
      end if;
      raise exception 'Técnico não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  if p_especialidades is not null then
    select coalesce(array_agg(especialidade_id order by especialidade_id), '{}')
      into v_antes from public.tecnico_especialidades where tecnico_id = v_id;

    delete from public.tecnico_especialidades
     where tecnico_id = v_id and not (especialidade_id = any (p_especialidades));

    insert into public.tecnico_especialidades (loja_id, tecnico_id, especialidade_id)
    select v_loja, v_id, e from unnest(p_especialidades) as e
    on conflict do nothing;

    select coalesce(array_agg(especialidade_id order by especialidade_id), '{}')
      into v_depois from public.tecnico_especialidades where tecnico_id = v_id;

    -- o evento é gravado pelo servidor (log_eventos não aceita escrita do usuário)
    if p_id is not null and v_antes is distinct from v_depois then
      perform public.registrar_evento_tecnico(v_id, array['especialidades']);
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.salvar_tecnico(uuid, integer, jsonb, uuid[]) from public, anon;
grant execute on function public.salvar_tecnico(uuid, integer, jsonb, uuid[]) to authenticated;
