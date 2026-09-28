-- Fase 3 · etapa 15 — texto da pendência de fotos sem parênteses
-- (o front só repassa mensagens do banco sem parênteses/aspas/sublinhado)
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
                   else format('envie ao menos %s fotos, faltam %s', v_tipo.fotos_minimas, v_tipo.fotos_minimas - v_fotos) end);
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
