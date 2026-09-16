-- =====================================================================
-- Fase 2 · 05 · Cliente arquivado não recebe novas OS
-- OS existentes continuam intactas e visíveis; só a criação (ou troca para
-- um cliente arquivado) é bloqueada.
-- =====================================================================

create or replace function public.trg_ordens_servico_cliente_ativo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.cliente_id = old.cliente_id then
    return new;
  end if;
  if exists (select 1 from public.clientes where id = new.cliente_id and arquivado_em is not null) then
    raise exception 'Cliente arquivado não pode receber novas ordens de serviço.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ordens_servico_cliente_ativo
  before insert or update of cliente_id on public.ordens_servico
  for each row execute function public.trg_ordens_servico_cliente_ativo();

revoke execute on function public.trg_ordens_servico_cliente_ativo() from public, anon, authenticated;
