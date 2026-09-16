-- Tipos enumerados
create type papel_usuario as enum ('super_admin', 'gerente', 'funcionario');
create type tipo_item_os as enum ('peca', 'servico');
create type categoria_status as enum ('aberto', 'em_andamento', 'pausado', 'finalizado_sucesso', 'finalizado_cancelado');
create type status_loja as enum ('ativa', 'suspensa', 'cancelada');

-- Tabela de lojas (gerenciada exclusivamente pelo super admin)
create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  status status_loja not null default 'ativa',
  plano text,
  criado_em timestamptz not null default now()
);

-- Usuários (super_admin, gerente, funcionario) - vinculados ao auth.users
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  loja_id uuid references public.lojas(id) on delete cascade,
  nome text not null,
  email text not null,
  papel papel_usuario not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint loja_obrigatoria_exceto_super_admin check (
    (papel = 'super_admin' and loja_id is null) or
    (papel != 'super_admin' and loja_id is not null)
  )
);

-- Código de autorização isolado em tabela própria (só gerente acessa)
create table public.usuarios_seguranca (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  codigo_autorizacao text,
  atualizado_em timestamptz not null default now()
);

-- Clientes cadastrados por loja
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  criado_em timestamptz not null default now()
);

-- Status de OS customizáveis por loja
create table public.status_os (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  nome text not null,
  categoria categoria_status not null,
  cor text,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

-- Ordens de serviço
create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  status_id uuid not null references public.status_os(id) on delete restrict,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  objeto_atendimento text,
  descricao text not null,
  valor_total numeric(12,2) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Itens da OS (peças e mão de obra)
create table public.os_itens (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  tipo tipo_item_os not null,
  descricao text not null,
  quantidade numeric(10,2) not null default 1,
  valor_unitario numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);

-- Histórico de mudanças de status (auditoria da OS)
create table public.os_historico (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  status_anterior_id uuid references public.status_os(id),
  status_novo_id uuid references public.status_os(id),
  criado_em timestamptz not null default now()
);

-- Log geral de eventos do sistema por loja
create table public.log_eventos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete set null,
  acao text not null,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

-- Índices para as consultas mais comuns
create index idx_usuarios_loja on public.usuarios(loja_id);
create index idx_clientes_loja on public.clientes(loja_id);
create index idx_status_os_loja on public.status_os(loja_id);
create index idx_os_loja on public.ordens_servico(loja_id);
create index idx_os_cliente on public.ordens_servico(cliente_id);
create index idx_os_status on public.ordens_servico(status_id);
create index idx_os_itens_os on public.os_itens(os_id);
create index idx_os_historico_os on public.os_historico(os_id);
create index idx_log_eventos_loja on public.log_eventos(loja_id);

-- Funções auxiliares (security definer para evitar recursão de RLS)
create function public.usuario_papel()
returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from public.usuarios where id = auth.uid();
$$;

create function public.usuario_loja_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select loja_id from public.usuarios where id = auth.uid();
$$;

create function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from public.usuarios where id = auth.uid()) = 'super_admin', false);
$$;

create function public.is_gerente()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from public.usuarios where id = auth.uid()) = 'gerente', false);
$$;
