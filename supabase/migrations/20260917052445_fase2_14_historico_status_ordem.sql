-- =====================================================================
-- Fase 2 · 14 — Ordem estável do histórico de status
-- Registros na mesma transação têm o mesmo horário; o registro de criação
-- (sem status anterior) fica sempre por último na lista (mais antigo).
-- =====================================================================
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
           order by h.criado_em desc, (h.status_anterior_id is null), h.id), '[]'::jsonb)
    from public.os_historico h
    left join public.usuarios u on u.id = h.usuario_id and u.loja_id = v_loja
    left join public.status_os sa on sa.id = h.status_anterior_id and sa.loja_id = v_loja
    left join public.status_os sn on sn.id = h.status_novo_id and sn.loja_id = v_loja
    where h.os_id = p_os_id
  );
end;
$$;
