-- =====================================================================
-- Fase 3 · 15 — Estrutura do checklist avançado (etapa 11)
-- Três tipos novos de item (hora, medição e assinatura) e o suporte a
-- item condicional ("mostrar só se o item X responder Y"). As funções e
-- as travas por tipo ficam na fase3_16: valor novo de enum não pode ser
-- usado na mesma transação que o cria.
-- =====================================================================

alter type public.tipo_item_checklist add value if not exists 'hora' after 'data';
alter type public.tipo_item_checklist add value if not exists 'medicao' after 'numero';
alter type public.tipo_item_checklist add value if not exists 'assinatura' after 'foto';

-- ---------------------------------------------------------------------
-- Modelo: medição (unidade e faixa esperada) e condição de exibição
-- ---------------------------------------------------------------------
alter table public.checklist_modelo_itens
  add column unidade text,
  add column valor_min numeric,
  add column valor_max numeric,
  add column depende_de_ordem int,
  add column condicao_valor text;

comment on column public.checklist_modelo_itens.unidade is
  'Unidade da medição (V, A, °C, bar, psi...).';
comment on column public.checklist_modelo_itens.depende_de_ordem is
  'Ordem do item de que este depende. O item só aparece quando aquele responder condicao_valor.';

alter table public.checklist_modelo_itens
  add constraint checklist_modelo_itens_unidade_tamanho
    check (unidade is null or length(btrim(unidade)) between 1 and 12),
  add constraint checklist_modelo_itens_faixa
    check (valor_min is null or valor_max is null or valor_max >= valor_min),
  add constraint checklist_modelo_itens_condicao
    check (
      (depende_de_ordem is null and condicao_valor is null)
      or (depende_de_ordem is not null and condicao_valor is not null
          and depende_de_ordem >= 1 and depende_de_ordem < ordem
          and length(btrim(condicao_valor)) between 1 and 100)
    );

-- ---------------------------------------------------------------------
-- Item da OS: a cópia carrega as mesmas regras e ganha o valor de hora
-- ---------------------------------------------------------------------
alter table public.os_checklist_itens
  add column unidade text,
  add column valor_min numeric,
  add column valor_max numeric,
  add column depende_de_ordem int,
  add column condicao_valor text,
  add column valor_hora time;

alter table public.os_checklist_itens
  add constraint os_checklist_itens_unidade_tamanho
    check (unidade is null or length(btrim(unidade)) between 1 and 12),
  add constraint os_checklist_itens_faixa
    check (valor_min is null or valor_max is null or valor_max >= valor_min),
  add constraint os_checklist_itens_condicao
    check (
      (depende_de_ordem is null and condicao_valor is null)
      or (depende_de_ordem is not null and condicao_valor is not null
          and depende_de_ordem >= 1 and depende_de_ordem < ordem
          and length(btrim(condicao_valor)) between 1 and 100)
    );

-- a condição olha o item irmão pela ordem dentro do mesmo checklist
create index idx_os_checklist_itens_ordem on public.os_checklist_itens(checklist_id, ordem);
