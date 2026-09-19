-- Fase 2 · 09 — categoria interna "agendado" (SCHEDULED).
-- Separada da migration seguinte: um valor novo de enum só pode ser usado após o commit.
alter type public.categoria_status add value if not exists 'agendado' after 'aberto';
