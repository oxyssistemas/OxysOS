-- =====================================================================
-- Fase 2 · 13 — Exclusão de empresa (Super Admin) com dados operacionais
--
-- A exclusão em cascata a partir de lojas não garante ordem: status,
-- clientes ou categorias podiam ser apagados antes das OS/equipamentos que
-- os referenciam (FKs imediatas), bloqueando a exclusão de empresas com OS.
-- Antes de excluir a empresa, removemos na ordem certa os registros que
-- apontam para outros cadastros da própria empresa. As FKs continuam
-- imediatas para o uso normal do sistema.
-- =====================================================================
create or replace function public.trg_lojas_excluir_dependencias()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- itens, histórico, fotos e observações saem em cascata com a OS
  delete from public.ordens_servico where loja_id = old.id;
  delete from public.equipamentos where loja_id = old.id;
  delete from public.tecnico_especialidades where loja_id = old.id;
  return old;
end;
$$;

create trigger lojas_excluir_dependencias
  before delete on public.lojas
  for each row execute function public.trg_lojas_excluir_dependencias();

revoke execute on function public.trg_lojas_excluir_dependencias() from public, anon, authenticated;
