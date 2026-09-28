-- Fase 3 · etapa 14 — índices das FKs de os_assinaturas (advisor unindexed_foreign_keys)
create index if not exists idx_os_assinaturas_agendamento
  on public.os_assinaturas (loja_id, agendamento_id);
create index if not exists idx_os_assinaturas_registrado_por
  on public.os_assinaturas (registrado_por);
create index if not exists idx_os_assinaturas_substituida_por
  on public.os_assinaturas (substituida_por);
