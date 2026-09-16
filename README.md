# Oxys OS

SaaS de ordem de serviço (Field Service Management), multi-tenant, sobre Supabase.

```
oxys-os/
├── apps/web/                 App único (React + Vite + react-router)
│   └── src/
│       ├── auth/             Login, sessão, redirecionamento por papel
│       ├── admin/            /admin — Portal Super Admin (dono do SaaS)
│       └── app/              /app   — Portal da Empresa (owner, gerente, equipe)
│           ├── context/      CompanyContext (empresa, assinatura, features, permissões)
│           ├── guards/       GuardaEmpresa (situação da conta) e RotaModulo (feature + permissão)
│           ├── layout/       Sidebar responsiva + Topbar
│           ├── pages/        Páginas do portal novo
│           └── legado/       Telas herdadas do antigo portal da loja (OS, clientes,
│                             configurações) — substituídas módulo a módulo
├── packages/shared/          @oxys/shared: cliente Supabase, máscaras, componentes, CSS
├── supabase/
│   ├── migrations/           Histórico versionado de migrations (espelha o banco)
│   └── tests/                Testes SQL (isolamento multi-tenant etc.)
├── tailwind.preset.js        Tema visual
└── .env                      VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
```

## Como rodar

```bash
npm install
cp .env.example .env   # se ainda não existir
npm run dev            # http://localhost:5173
```

`npm run typecheck` · `npm run build` (gera `apps/web/dist`).

Após o login: `super_admin` → `/admin`; usuários de empresa → `/app`. O papel vem do
banco (tabela `usuarios`), nunca do que o front envia.

## Segurança e multi-tenancy

O tenant é a tabela `lojas` (empresa). Toda regra de acesso é aplicada no Postgres:

| Função (SQL)                 | Uso                                                                  |
| ---------------------------- | -------------------------------------------------------------------- |
| `usuario_loja_id()`          | loja do usuário logado (somente se `ativo`)                          |
| `loja_situacao_acesso(loja)` | `liberado`, `loja_suspensa`, `trial_expirado`, `sem_assinatura`…     |
| `loja_operacional_id()`      | loja do usuário **somente se** usuário ativo e empresa liberada      |
| `tem_feature(key)`           | feature do plano/add-on/override da empresa do usuário               |
| `tem_permissao(chave)`       | permissão do cargo do usuário (cargo `owner` tem todas)              |
| `obter_contexto_empresa()`   | RPC única que alimenta o `CompanyContext`                            |

- **RBAC:** `permissoes` (catálogo), `cargos` (por empresa; 6 cargos de sistema criados
  automaticamente: owner, manager, attendant, technician, finance, inventory),
  `cargo_permissoes` e `usuarios.cargo_id`. Gerente → cargo *Proprietário*; funcionário →
  *Atendente*.
- Tabelas operacionais exigem `loja_operacional_id()` + feature do plano; referências da OS
  usam FKs compostas `(loja_id, id)` para impedir apontar para registros de outra empresa.
- Fotos de OS ficam em bucket **privado** (`os-fotos/<loja_id>/…`), exibidas via URL assinada.
- Empresa suspensa / trial expirado: dados preservados, operação negada no banco e tela
  explicativa no portal.

### Teste de isolamento

`supabase/tests/fase2_01_isolamento_tenant.sql` cria Empresa A e B numa transação,
simula requisições reais (role `authenticated` + JWT) tentando ler, alterar e referenciar
dados da outra empresa, escalar privilégio, acessar empresa suspensa/trial expirado etc.,
e desfaz tudo ao final. Resultado esperado: `TOTAL: 29 ok, 0 falhas`.

| Teste                                   | Verificações |
| --------------------------------------- | ------------ |
| `supabase/tests/fase2_01_isolamento_tenant.sql` | 29 |
| `supabase/tests/fase2_02_dashboard.sql`         | 18 |
| `supabase/tests/fase2_04_clientes.sql`          | 30 |

## Módulos do Portal da Empresa

### Clientes (`/app/customers`, `/app/customers/:id`)

- PF (nome, CPF) e PJ (razão social, nome fantasia, CNPJ — **inclusive alfanumérico**,
  regra da Receita vigente desde 07/2026). CPF/CNPJ validados no navegador e no banco
  (`cpf_valido`, `cnpj_valido`), únicos por empresa.
- Múltiplos endereços em `cliente_enderecos` (sempre exatamente um principal).
- Tags, observações, busca sem acento por nome/documento/e-mail/telefone
  (`clientes.busca` + `pg_trgm`), filtros e paginação no servidor.
- Sem exclusão: clientes são **arquivados** (auditoria em `logs_auditoria`); cliente
  arquivado não recebe novas OS, e as OS existentes continuam intactas.
- Edição com concorrência otimista (`clientes.versao`): não sobrescreve alteração alheia.
- Permissões `customers.view/create/edit/archive` aplicadas por RLS e triggers.

## Código compartilhado (`@oxys/shared`)

| Import                                 | Conteúdo                                          |
| -------------------------------------- | ------------------------------------------------- |
| `@oxys/shared/supabase`                | cliente Supabase + `callEdgeFunction`             |
| `@oxys/shared/masks`                   | máscaras/validações (CNPJ, telefone, e-mail, UFs) |
| `@oxys/shared/components/Toast`        | `ToastProvider`, `useToast`                       |
| `@oxys/shared/components/Field`        | `Field`, `SelectField`, `TextareaField`           |
| `@oxys/shared/components/SidePanel`    | painel lateral (prop `largo` opcional)            |
| `@oxys/shared/components/EstadosLista` | `EmptyState`, `TabelaSkeleton`                    |
| `@oxys/shared/index.css`               | CSS global (Tailwind + estilos base)              |
