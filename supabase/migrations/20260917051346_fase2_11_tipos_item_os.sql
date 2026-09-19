-- Fase 2 · 11 — tipos de item da OS: serviço, produto, peça e material.
-- Separada da migration seguinte: valores novos de enum só podem ser usados após o commit.
alter type public.tipo_item_os add value if not exists 'produto';
alter type public.tipo_item_os add value if not exists 'material';
