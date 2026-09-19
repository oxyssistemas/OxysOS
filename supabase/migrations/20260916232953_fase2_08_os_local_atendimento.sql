-- =====================================================================
-- Fase 2 · 08 · Local do atendimento na OS
--
-- loja    → atendimento presencial na loja/balcão (ex.: reparo de celular)
-- externo → atendimento no cliente (ex.: instalação de câmeras), com
--           endereço opcional do próprio cliente da OS
--
-- OS existentes ficam como "loja" (fluxo de balcão do portal atual).
-- Mudança de local/endereço gera evento no histórico da empresa.
-- =====================================================================

create type public.local_atendimento_os as enum ('loja', 'externo');

alter table public.ordens_servico
  add column local_atendimento public.local_atendimento_os not null default 'loja',
  add column cliente_endereco_id uuid;

-- o endereço precisa ser do cliente da OS; e só faz sentido em atendimento externo
alter table public.ordens_servico
  add constraint ordens_servico_endereco_do_cliente_fkey
    foreign key (cliente_id, cliente_endereco_id) references public.cliente_enderecos(cliente_id, id),
  add constraint ordens_servico_endereco_somente_externo
    check (local_atendimento = 'externo' or cliente_endereco_id is null);

create index idx_os_cliente_endereco on public.ordens_servico(cliente_id, cliente_endereco_id);
create index idx_os_loja_local on public.ordens_servico(loja_id, local_atendimento);

create or replace function public.trg_ordens_servico_log_local()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.log_eventos (loja_id, usuario_id, acao, detalhes)
  values (
    new.loja_id,
    auth.uid(),
    'os_local_alterado',
    jsonb_build_object(
      'os_id', new.id,
      'cliente_id', new.cliente_id,
      'de', old.local_atendimento,
      'para_local', new.local_atendimento,
      'endereco_id', new.cliente_endereco_id
    )
  );
  return null;
end;
$$;

create trigger ordens_servico_log_local
  after update of local_atendimento, cliente_endereco_id on public.ordens_servico
  for each row
  when (old.local_atendimento is distinct from new.local_atendimento
        or old.cliente_endereco_id is distinct from new.cliente_endereco_id)
  execute function public.trg_ordens_servico_log_local();

revoke execute on function public.trg_ordens_servico_log_local() from public, anon, authenticated;
