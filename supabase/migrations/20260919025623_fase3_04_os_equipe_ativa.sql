-- =====================================================================
-- Fase 3 · 04 — OS não vai para equipe inativa (etapa 3)
-- Mesma regra já aplicada a cliente, equipamento e técnico: desativar
-- uma equipe exige OS zeradas, então atribuir OS a equipe inativa
-- deixaria a base inconsistente.
-- =====================================================================
create or replace function public.trg_ordens_servico_equipe_ativa()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.equipe_id is null or (tg_op = 'UPDATE' and new.equipe_id is not distinct from old.equipe_id) then
    return new;
  end if;
  if exists (select 1 from public.equipes where id = new.equipe_id and not ativo) then
    raise exception 'Equipe inativa não pode ser atribuída a ordens de serviço.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ordens_servico_equipe_ativa
  before insert or update of equipe_id on public.ordens_servico
  for each row execute function public.trg_ordens_servico_equipe_ativa();
