-- =====================================================================
-- Fase 2 · 18 — Ajustes de anexos/checklists
-- * Opções de lista do checklist: cada uma com 1 a 100 caracteres.
-- * Atividade recente: nome do arquivo e do checklist nos eventos da OS.
-- =====================================================================

create or replace function public.opcoes_checklist_validas(p_opcoes text[])
returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(length(btrim(o)) between 1 and 100), true) from unnest(p_opcoes) as o;
$$;

alter table public.checklist_modelo_itens
  add constraint checklist_modelo_itens_opcoes_tamanho check (public.opcoes_checklist_validas(opcoes));

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
           'item', t.item,
           'arquivo', t.arquivo,
           'checklist', t.checklist)
         order by t.criado_em desc), '[]'::jsonb)
  into v_resultado
  from (
    select
      e.id, e.acao, e.criado_em,
      u.nome as usuario_nome,
      os.id as os_id,
      os.numero as os_numero,
      e.detalhes->>'item' as item,
      case when e.acao like 'os\_anexo\_%' then e.detalhes->>'nome' end as arquivo,
      e.detalhes->>'checklist' as checklist,
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

revoke execute on function public.opcoes_checklist_validas(text[]) from public, anon;
grant execute on function public.opcoes_checklist_validas(text[]) to authenticated;
