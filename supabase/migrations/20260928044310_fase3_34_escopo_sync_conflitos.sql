-- Fase 3 · etapa 19 — revisão de segurança: duas funções que escaparam da fase3_32
-- 1. sincronizar_resposta_checklist (modo offline) localizava o item só pela
--    empresa: um técnico chegava ao caminho de conflito de um item de OS de outro
--    técnico e recebia o valor gravado e o nome de quem respondeu.
-- 2. conflitos_agendamento devolve número e id das OS na agenda de qualquer
--    técnico. É ferramenta de quem agenda (agendar_os, reagendar_agendamento,
--    sugerir_tecnicos), como a central de despacho: negada ao técnico restrito.

create function pg_temp.remendar(p_funcao text, p_de text, p_para text, p_vezes int default 1)
 returns void
 language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_funcao::regprocedure);
  v_n int := (length(v_def) - length(replace(v_def, p_de, ''))) / length(p_de);
begin
  if v_def like '%exigir_os_visivel%' or v_def like '%escopo_os_restrito%' then
    return; -- já tem o escopo
  end if;
  if v_n <> p_vezes then
    raise exception 'Trecho esperado % vez(es) em %, encontrado %', p_vezes, p_funcao, v_n;
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.remendar('public.sincronizar_resposta_checklist(uuid, uuid, jsonb, timestamptz)',
  E'    raise exception ''Item do checklist não encontrado.'' using errcode = ''P0002'';\n  end if;\n',
  E'    raise exception ''Item do checklist não encontrado.'' using errcode = ''P0002'';\n  end if;\n  perform public.exigir_os_visivel((select c.os_id from public.os_checklists c where c.id = v_item.checklist_id));\n');

select pg_temp.remendar('public.conflitos_agendamento(uuid, uuid, timestamptz, timestamptz, uuid, text)', E'\nbegin\n',
  E'\nbegin\n  if public.escopo_os_restrito() then\n    raise exception ''A verificação de conflitos mostra a agenda de todos os técnicos; seu cargo vê só as suas OS.'' using errcode = ''42501'';\n  end if;\n');
