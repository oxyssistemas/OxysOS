-- =====================================================================
-- Fase 3 · 21 — Correção do gatilho de exclusão da empresa (etapa 13)
-- A fase3_20 reescreveu `trg_lojas_excluir_dependencias` e perdeu os
-- deletes de `equipes` e `tecnico_especialidades`. Aqui volta a lista
-- completa, agora com o catálogo (que sai depois das OS, porque
-- `os_itens.catalogo_item_id` aponta para ele).
-- =====================================================================

create or replace function public.trg_lojas_excluir_dependencias()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- itens, histórico, anexos, checklists e observações saem em cascata com a OS
  delete from public.ordens_servico where loja_id = old.id;
  delete from public.catalogo_itens where loja_id = old.id;
  delete from public.equipes where loja_id = old.id;
  delete from public.equipamentos where loja_id = old.id;
  delete from public.tecnico_especialidades where loja_id = old.id;
  delete from public.checklist_modelos where loja_id = old.id;
  return old;
end;
$$;
