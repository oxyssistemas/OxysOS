-- Fase 3 · etapa 19 — revisão de segurança: nada do schema public para anon
-- O app não consulta dados antes do login (o login é do Supabase Auth, fora do
-- PostgREST), e nenhuma política de RLS vale para anon. Ainda assim o papel anon
-- herdava os privilégios padrão do Supabase em todas as tabelas, sequências e
-- funções novas: a RLS barrava, mas uma tabela criada sem RLS ficaria aberta.
-- Defesa em profundidade: anon perde tudo no schema public, inclusive o que for
-- criado daqui em diante por migrations (rodam como postgres).

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- as quatro funções puras que ainda estavam abertas (também via PUBLIC)
revoke all on function public.normalizar_busca(text) from public;
revoke all on function public.cpf_valido(text) from public;
revoke all on function public.cnpj_valido(text) from public;
revoke all on function public.gerar_chave_config(text) from public;
grant execute on function public.normalizar_busca(text) to authenticated;
grant execute on function public.cpf_valido(text) to authenticated;
grant execute on function public.cnpj_valido(text) to authenticated;
grant execute on function public.gerar_chave_config(text) to authenticated;
