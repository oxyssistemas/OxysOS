-- =====================================================================
-- Fase 3 · 18 — Estrutura das evidências (etapa 12)
-- As categorias de foto passam de três para as seis do §31 e o anexo
-- guarda o técnico que registrou (§32). As funções ficam na fase3_19:
-- valor novo de enum não pode ser usado na transação que o cria.
-- =====================================================================

alter type public.momento_foto_os add value if not exists 'problema' after 'depois';
alter type public.momento_foto_os add value if not exists 'equipamento' after 'problema';
alter type public.momento_foto_os add value if not exists 'outros' after 'equipamento';

-- quem registrou em campo (o gatilho preenche; o cliente não escolhe)
alter table public.os_anexos
  add column tecnico_id uuid,
  add constraint os_anexos_tecnico_mesma_loja_fkey foreign key (loja_id, tecnico_id)
    references public.tecnicos(loja_id, id) on delete set null (tecnico_id);

comment on column public.os_anexos.tecnico_id is
  'Técnico que enviou a evidência, quando o envio veio do portal do técnico.';
comment on column public.os_anexos.momento is
  'Categoria da evidência (§31): antes, durante, depois, problema, equipamento, outros.';

create index idx_os_anexos_tecnico on public.os_anexos(loja_id, tecnico_id) where tecnico_id is not null;
create index idx_os_anexos_categoria on public.os_anexos(os_id, momento) where removido_em is null;
