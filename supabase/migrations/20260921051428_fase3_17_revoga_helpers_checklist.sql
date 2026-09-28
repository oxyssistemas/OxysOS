-- =====================================================================
-- Fase 3 · 17 — Helpers do checklist fora da API (etapa 11)
-- `item_checklist_visivel` e `item_checklist_pendente` só são chamados de
-- dentro de funções SECURITY DEFINER (checklists_os, responder_item_checklist
-- e alterar_status_os), onde o usuário efetivo é o dono. Não há motivo para
-- expô-las em /rest/v1/rpc.
-- =====================================================================

revoke execute on function public.item_checklist_visivel(public.os_checklist_itens) from authenticated;
revoke execute on function public.item_checklist_pendente(public.os_checklist_itens) from authenticated;
revoke execute on function public.item_checklist_fora_faixa(public.os_checklist_itens) from authenticated;
