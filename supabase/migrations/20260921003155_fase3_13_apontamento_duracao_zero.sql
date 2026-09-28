-- =====================================================================
-- Fase 3 · 13 — Apontamento de duração zero é válido (etapa 9)
-- Encontrado ao testar a máquina de estados: dois passos no mesmo
-- instante (chegar assim que o deslocamento começa) fechavam o relógio
-- com fim_em = inicio_em e batiam na constraint. Duração zero é um
-- registro legítimo; o que não pode é terminar antes de começar.
-- =====================================================================
alter table public.os_apontamentos drop constraint os_apontamentos_intervalo;

alter table public.os_apontamentos
  add constraint os_apontamentos_intervalo check (fim_em is null or fim_em >= inicio_em);
