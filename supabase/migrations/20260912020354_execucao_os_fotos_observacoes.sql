-- Rastreabilidade: quem criou a OS, código do aparelho e início da execução
alter table public.ordens_servico
  add column criado_por uuid references public.usuarios(id) on delete set null,
  add column codigo_aparelho text,
  add column iniciado_em timestamptz;

-- Fotos (antes/depois) e observações registradas durante a execução
create table public.os_fotos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  tipo text not null check (tipo in ('antes', 'depois')),
  url text not null,
  observacao text,
  criado_em timestamptz not null default now()
);

create table public.os_observacoes (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  texto text not null,
  criado_em timestamptz not null default now()
);

create index idx_os_fotos_os on public.os_fotos(os_id);
create index idx_os_observacoes_os on public.os_observacoes(os_id);

alter table public.os_fotos enable row level security;
alter table public.os_observacoes enable row level security;

create policy "os_fotos_select" on public.os_fotos for select
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_fotos.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_fotos_insert" on public.os_fotos for insert
  with check (exists (
    select 1 from public.ordens_servico os
    where os.id = os_fotos.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_observacoes_select" on public.os_observacoes for select
  using (exists (
    select 1 from public.ordens_servico os
    where os.id = os_observacoes.os_id and os.loja_id = public.usuario_loja_id()
  ));

create policy "os_observacoes_insert" on public.os_observacoes for insert
  with check (exists (
    select 1 from public.ordens_servico os
    where os.id = os_observacoes.os_id and os.loja_id = public.usuario_loja_id()
  ));

-- Bucket de armazenamento das fotos, isolado por loja no caminho do arquivo
insert into storage.buckets (id, name, public)
values ('os-fotos', 'os-fotos', true)
on conflict (id) do nothing;

create policy "os_fotos_storage_insert" on storage.objects for insert
  with check (
    bucket_id = 'os-fotos'
    and (storage.foldername(name))[1] = public.usuario_loja_id()::text
  );

create policy "os_fotos_storage_select" on storage.objects for select
  using (bucket_id = 'os-fotos');
