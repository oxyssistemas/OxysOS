-- Tipos
create type status_assinatura as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled');
create type ciclo_cobranca as enum ('mensal', 'anual');

-- Segmentos de mercado atendidos pelo SaaS
create table public.segmentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Catálogo global de funcionalidades (feature flags)
create table public.funcionalidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  key text not null unique,
  descricao text,
  categoria text not null default 'geral',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Funcionalidades recomendadas por segmento (apenas sugestão, não trava acesso)
create table public.segmento_funcionalidades (
  segmento_id uuid not null references public.segmentos(id) on delete cascade,
  funcionalidade_id uuid not null references public.funcionalidades(id) on delete cascade,
  primary key (segmento_id, funcionalidade_id)
);

-- Planos comerciais
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  preco_mensal numeric(10,2) not null default 0,
  preco_anual numeric(10,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Funcionalidades incluídas em cada plano
create table public.plano_funcionalidades (
  plano_id uuid not null references public.planos(id) on delete cascade,
  funcionalidade_id uuid not null references public.funcionalidades(id) on delete cascade,
  primary key (plano_id, funcionalidade_id)
);

-- Vínculo de segmento à loja (empresa)
alter table public.lojas add column segmento_id uuid references public.segmentos(id);

-- Assinatura de cada empresa (1 assinatura "viva" por loja)
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null unique references public.lojas(id) on delete cascade,
  plano_id uuid not null references public.planos(id),
  status status_assinatura not null default 'trial',
  ciclo_cobranca ciclo_cobranca not null default 'mensal',
  data_inicio timestamptz not null default now(),
  trial_termina_em timestamptz,
  periodo_atual_inicio timestamptz,
  periodo_atual_fim timestamptz,
  cancelada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Liberação/bloqueio manual de uma funcionalidade para uma empresa específica
create table public.empresa_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  funcionalidade_id uuid not null references public.funcionalidades(id) on delete cascade,
  habilitado boolean not null,
  criado_em timestamptz not null default now(),
  unique (loja_id, funcionalidade_id)
);

-- Add-ons contratados avulsos (arquitetura pronta; sem cobrança automática ainda)
create table public.empresa_addons (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id) on delete cascade,
  funcionalidade_id uuid not null references public.funcionalidades(id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (loja_id, funcionalidade_id)
);

-- Auditoria administrativa (ações do super admin)
create table public.logs_auditoria (
  id uuid primary key default gen_random_uuid(),
  ator_usuario_id uuid references public.usuarios(id) on delete set null,
  loja_id uuid references public.lojas(id) on delete set null,
  acao text not null,
  tipo_entidade text not null,
  entidade_id uuid,
  metadados jsonb,
  criado_em timestamptz not null default now()
);

create index idx_assinaturas_loja on public.assinaturas(loja_id);
create index idx_overrides_loja on public.empresa_feature_overrides(loja_id);
create index idx_addons_loja on public.empresa_addons(loja_id);
create index idx_logs_loja on public.logs_auditoria(loja_id);
create index idx_logs_criado_em on public.logs_auditoria(criado_em desc);

-- RLS: todas essas tabelas são de administração da plataforma — só super_admin
alter table public.segmentos enable row level security;
alter table public.funcionalidades enable row level security;
alter table public.segmento_funcionalidades enable row level security;
alter table public.planos enable row level security;
alter table public.plano_funcionalidades enable row level security;
alter table public.assinaturas enable row level security;
alter table public.empresa_feature_overrides enable row level security;
alter table public.empresa_addons enable row level security;
alter table public.logs_auditoria enable row level security;

create policy "segmentos_super_admin" on public.segmentos for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "funcionalidades_super_admin" on public.funcionalidades for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "segmento_funcionalidades_super_admin" on public.segmento_funcionalidades for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "planos_super_admin" on public.planos for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "plano_funcionalidades_super_admin" on public.plano_funcionalidades for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "assinaturas_super_admin" on public.assinaturas for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "overrides_super_admin" on public.empresa_feature_overrides for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "addons_super_admin" on public.empresa_addons for all
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "logs_super_admin" on public.logs_auditoria for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Função central de resolução de acesso a funcionalidade (usada hoje e no futuro portal da empresa)
create function public.empresa_tem_feature(p_loja_id uuid, p_feature_key text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_loja_status status_loja;
  v_assinatura record;
  v_funcionalidade record;
  v_no_plano boolean;
  v_addon_ativo boolean;
  v_override record;
  v_resultado boolean;
begin
  select status into v_loja_status from public.lojas where id = p_loja_id;
  if v_loja_status is null or v_loja_status <> 'ativa' then
    return false;
  end if;

  select * into v_assinatura from public.assinaturas where loja_id = p_loja_id;
  if v_assinatura is null then
    return false;
  end if;
  if v_assinatura.status = 'trial' and v_assinatura.trial_termina_em is not null
     and now() > v_assinatura.trial_termina_em then
    return false;
  end if;
  if v_assinatura.status not in ('trial', 'active') then
    return false;
  end if;

  select * into v_funcionalidade from public.funcionalidades where key = p_feature_key;
  if v_funcionalidade is null or not v_funcionalidade.ativo then
    return false;
  end if;

  select exists(
    select 1 from public.plano_funcionalidades pf
    where pf.plano_id = v_assinatura.plano_id and pf.funcionalidade_id = v_funcionalidade.id
  ) into v_no_plano;

  select exists(
    select 1 from public.empresa_addons ea
    where ea.loja_id = p_loja_id and ea.funcionalidade_id = v_funcionalidade.id and ea.ativo
  ) into v_addon_ativo;

  v_resultado := v_no_plano or v_addon_ativo;

  select * into v_override from public.empresa_feature_overrides
    where loja_id = p_loja_id and funcionalidade_id = v_funcionalidade.id;
  if v_override is not null then
    v_resultado := v_override.habilitado;
  end if;

  return v_resultado;
end;
$$;
