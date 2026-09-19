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
| `supabase/tests/fase2_01_isolamento_tenant.sql` | 31 |
| `supabase/tests/fase2_02_dashboard.sql`         | 18 |
| `supabase/tests/fase2_04_clientes.sql`          | 30 |
| `supabase/tests/fase2_06_tecnicos.sql`          | 25 |
| `supabase/tests/fase2_07_equipamentos.sql`      | 26 |
| `supabase/tests/fase2_08_os_local_atendimento.sql` | 7 |
| `supabase/tests/fase2_10_tipos_servico_workflow.sql` | 38 |
| `supabase/tests/fase2_12_ordens_servico.sql` | 28 |
| `supabase/tests/fase2_16_timeline_anexos_checklist.sql` | 39 |
| `supabase/tests/fase2_19_equipe_permissoes.sql` | 30 |
| `supabase/tests/fase2_20_relatorios.sql` | 17 |

### Auditoria final (fase 2 · etapa 15)

Revisão de ponta a ponta ao fechar a fase, com a bateria de testes inteira reexecutada:

- **RLS em todas as tabelas** de `public`. `os_numeracao` tem RLS sem política de propósito: o
  contador de OS é manipulado só pelo trigger de numeração.
- **Nenhuma função `SECURITY DEFINER` é alcançável pelo anônimo.** As políticas herdadas valiam
  para `public` (o que obrigava a liberar as funções de apoio ao papel `anon`); passaram a valer
  só para `authenticated`, e o execute de `is_super_admin`, `is_gerente`, `usuario_loja_id` e
  `usuario_papel` foi revogado de `PUBLIC`.
- **Regressão corrigida**: desde a fase2_15 (eventos gravados só pelo banco), `salvar_tecnico` —
  que roda como o próprio usuário — não conseguia mais registrar a troca de especialidades e a
  edição do técnico falhava. O evento passou para `registrar_evento_tecnico`, que confere empresa,
  permissão e o técnico antes de gravar.
- Toda escrita sensível está em função de servidor ou trigger com `search_path` fixo; o cliente
  não insere em `log_eventos`, `os_historico` nem `logs_auditoria`.
- **Auditoria (§52)** cobre usuário criado, permissão/cargo alterado, cliente arquivado,
  equipamento alterado e configurações (status, prioridades, tipos, checklists).
- Segredos: só a chave publicável (anon) vai para o cliente; `service_role` existe apenas nas Edge
  Functions, lida de variável de ambiente. Nenhum `any`, `@ts-ignore`, `console.log` ou dado
  fictício no código do portal.
- Pendências conhecidas: excluir uma empresa não apaga os arquivos do Storage (a API SQL não
  remove objetos — precisa de limpeza pela Storage API) e o bucket vazio `os-fotos`, herdado,
  continua no projeto sem nenhuma política.

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

### Equipe e permissões (`/app/team`, `/app/team/roles`)

- **Usuários** (`listar_equipe`): nome, e-mail, cargo, situação e último acesso (lido de
  `auth.users.last_sign_in_at` — o cliente nunca grava esse dado). O Super Admin não aparece
  nem é administrado pela empresa.
- **Cadastro e acesso** pelas Edge Functions `criar-funcionario` e `atualizar-funcionario`
  (`supabase/functions/`), que rodam com service role e autorizam por `team.manage` +
  `loja_operacional_id()`. O usuário criado é sempre `papel = funcionario` — o Owner nunca cria
  Super Admin.
- **Nome, cargo e situação** por RPC: `renomear_usuario_equipe`, `definir_cargo_usuario` e
  `definir_usuario_ativo`. Ninguém altera o próprio cargo nem desativa o próprio acesso; o
  responsável pela empresa (papel `gerente`) só é alterado por quem tem o cargo Proprietário;
  acesso é desativado, nunca excluído. Cada mudança gera evento e registro em `logs_auditoria`.
- **Cargos** (`cargos` + `cargo_permissoes`): seis cargos padrão por empresa (Proprietário,
  Gerente, Atendente, Técnico, Financeiro, Estoque) e cargos personalizados criados pela empresa
  (ex.: "Supervisor técnico"). `salvar_cargo` (com `versao` para edição concorrente),
  `definir_cargo_ativo` e `excluir_cargo` — cargo padrão desativa mas não exclui, cargo em uso não
  é excluído e o cargo Proprietário (acesso total) não é alterado nem desativado.
- Ninguém consegue remover `team.manage` do próprio cargo, e a empresa nunca fica sem um
  proprietário ativo (trigger `usuarios_garantir_proprietario`).
- **Permissões granulares** (catálogo `permissoes`): dashboard, clientes, equipamentos, OS
  (ver/criar/editar/atribuir/finalizar/cancelar), técnicos, equipe, relatórios e configurações.
  O construtor mostra as permissões agrupadas por módulo e marca as que estão fora do plano — elas
  ficam guardadas e passam a valer se a funcionalidade for contratada.
- Escrita direta em `usuarios`, `cargos` e `cargo_permissoes` está fechada por RLS: tudo passa
  pelas funções acima (ou pelo servidor), inclusive para o Super Admin do portal `/admin`.

### Relatórios (`/app/reports`)

- Um período (presets ou intervalo até 1 ano), filtros opcionais por técnico e tipo de serviço, e
  exportação em CSV do que está na tela. Acesso com `reports.view` + módulo de OS.
- `relatorio_os` calcula tudo no banco, sempre só da empresa do usuário: OS criadas, em aberto,
  finalizadas e canceladas; série por dia (até 62 dias) ou por mês; OS por status, por prioridade e
  por técnico (incluindo "sem técnico"); clientes com mais OS; equipamentos com mais chamados.
- **Tempo médio de atendimento** (abertura → conclusão) e tempo médio de execução (início →
  conclusão) só aparecem com ao menos 3 OS finalizadas no período — abaixo disso a função devolve
  `null` e a tela diz quantas OS faltam, em vez de mostrar um número sem base.
- **Cumprimento de prazo** considera apenas as OS finalizadas que tinham prazo definido.
- As listas de clientes e de equipamentos vêm `null` quando a empresa não tem o módulo (ou o
  usuário não tem a permissão) — a tela simplesmente não mostra a seção.
- Nenhum indicador é inventado: tudo sai de dados que a fase 2 já registra.

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

### Técnicos (`/app/technicians`)

- Cadastro com nome, sobrenome, e-mail, telefone, CPF (opcional), observações e vínculo
  opcional com um usuário da equipe (base do futuro Portal do Técnico).
- Especialidades configuráveis por empresa (`especialidades` + `tecnico_especialidades`),
  com criação rápida no próprio formulário; desativadas não são atribuídas, e em uso não
  são excluídas.
- Técnicos são desativados, nunca excluídos; técnico inativo não pode receber OS
  (`ordens_servico.tecnico_id`, preenchido pelo módulo de OS).
- Listagem paginada com busca, filtro por especialidade e contadores reais de OS em
  andamento/pausadas e concluídas (`listar_tecnicos`).
- Permissões `technicians.view` / `technicians.manage`; quem vê OS lê os nomes dos técnicos.
- Preparação futura: foto, região de atendimento, horário, comissão, localização e estoque
  próprio serão tabelas próprias ligadas a `tecnicos(loja_id, id)`.

### Equipamentos (`/app/assets`, `/app/assets/:id`)

- Cada equipamento pertence à empresa e a um cliente e, opcionalmente, a um endereço do
  cliente (FK garante que o endereço é do mesmo cliente).
- Nome, categoria (configurável por empresa, `categorias_equipamento`), marca, modelo,
  nº de série, instalação, garantia, localização, observações e situação
  (em operação / em manutenção / fora de operação). Arquivados, nunca excluídos.
- Listagem com busca (inclusive pelo nome do cliente), filtros de situação, categoria,
  garantia (vigente, vencendo em 30 dias, vencida, sem) e contagem de OS.
- Detalhe com abas Visão geral, Ordens de serviço, Histórico e Arquivos (em breve).
- **QR Code:** `equipamentos.codigo_publico` tem 22 caracteres aleatórios gerados pelo
  banco (nunca sequencial nem enviado pelo cliente). O QR aponta para
  `/app/assets/qr/<código>`, resolvido por `equipamento_por_codigo` apenas para usuários
  logados da mesma empresa. Etiqueta imprimível, PNG e regeneração auditada do código.
- `ordens_servico.equipamento_id` preparado para o módulo de OS: só aceita equipamento do
  cliente da OS e bloqueia equipamento arquivado.
- Auditoria (`logs_auditoria`) de alteração, arquivamento e regeneração de código.
- Futuro: categorias sugeridas por segmento e consulta pública do QR (Portal do Cliente).

### Local do atendimento da OS

- `ordens_servico.local_atendimento`: `loja` (cliente traz o aparelho, ex.: reparo de
  celular — padrão) ou `externo` (técnico vai ao cliente, ex.: instalação de câmeras).
- OS externa pode apontar `cliente_endereco_id`; FK garante endereço do mesmo cliente e um
  CHECK impede endereço em OS na loja. Endereço usado em OS não pode ser excluído.
- Escolhido ao abrir a OS, exibido/filtrável na listagem, editável no detalhe
  (`service_orders.edit`), visível na Execução e no PDF. Mudança gera evento
  `os_local_alterado`.

### Workflow, prioridades e tipos de serviço (`/app/settings`)

- Configurações em abas: Status da OS, Prioridades, Tipos de serviço e Checklists (exigem o módulo
  de OS). Acesso com `settings.manage`. A equipe tem módulo próprio em `/app/team`.
- **Status** (`status_os`): nome e cor livres, `chave` estável gerada pelo banco, ordem do
  fluxo, ativo e um status **inicial** (categoria Aberta) aplicado às OS novas. Categorias
  internas: `aberto`, `agendado`, `em_andamento`, `pausado`, `finalizado_sucesso`,
  `finalizado_cancelado` — dashboards e regras usam só a categoria, então renomear não quebra nada.
  Empresas novas recebem 11 status padrão; as existentes mantiveram os nomes que já usavam.
- A categoria de um status já usado em OS não muda; a empresa sempre mantém um status ativo em
  Aberta, Em andamento, Finalizada e Cancelada. Status/prioridade/tipo usados são desativados,
  não excluídos.
- **Prioridades** (`prioridades_os`): nome e cor livres, nível interno (baixa/normal/alta/urgente)
  e uma padrão. OS sempre têm prioridade (`ordens_servico.prioridade_id`).
- **Tipos de serviço** (`tipos_servico`): cadastro da empresa com local sugerido (loja/externo);
  sugestões só são criadas quando o usuário clica.
- **Troca de status** só por `alterar_status_os()`: finalizar exige `service_orders.finish`,
  cancelar exige `service_orders.cancel`, as demais `service_orders.edit`; reabrir exige a mesma
  permissão. Histórico e evento gravados na mesma transação; UPDATE direto do status é negado.
- Reordenação atômica (`reordenar_status_os`, `reordenar_prioridades_os`), troca de
  inicial/padrão por função própria e auditoria em `logs_auditoria`.
- Dashboard: card de OS agendadas e gráfico de OS por prioridade.

### Modelos de checklist (`/app/settings/checklists`)

- **Modelos** (`checklist_modelos` + `checklist_modelo_itens`): nome, descrição, tipo de serviço
  sugerido, ativo e itens ordenados. Tipos de item: caixa de seleção, texto, número, foto, lista
  de opções (2 a 30, sem repetição) e data. Itens podem ser obrigatórios e ter texto de ajuda.
- Escrita só por `salvar_checklist_modelo` (`settings.manage`, com `versao` para edição
  concorrente), `definir_checklist_modelo_ativo` e `excluir_checklist_modelo` (modelo já usado
  em OS é desativado, não excluído). Tudo auditado em `logs_auditoria`.
- Editar um modelo **não** altera checklists já aplicados: a OS guarda uma cópia dos itens.

### Ordens de Serviço (`/app/service-orders`, `/new`, `/:id`)

- **Número** `OS-AAAA-000001` por empresa e ano, gerado pelo banco em `os_numeracao`
  (linha de contador bloqueada na transação: sem duplicidade nem corrida). Número, total e
  datas enviados pelo cliente são ignorados.
- **Listagem** por `listar_ordens_servico`: abas Em aberto / Finalizadas / Canceladas / Todas,
  busca (número, título, descrição, cliente, equipamento), filtros de status, prioridade,
  técnico (inclusive "sem técnico"), tipo e prazo, ordenação por recentes, prazo ou agendamento.
- **Nova OS**: cliente (ou cadastro rápido), título, descrição, local e endereço, equipamento do
  cliente, tipo (sugere o local), prioridade, técnico (`service_orders.assign`), data/horário,
  prazo (SLA da prioridade, horas ou data limite) e observações internas. Aceita `?cliente=` e
  `?equipamento=`.
- **Detalhe** (`obter_ordem_servico`): cabeçalho com status, prioridade e prazo; ações Editar,
  Atribuir técnico, Alterar status, Finalizar, Cancelar (motivo obrigatório) e Reabrir; PDF da OS
  e recibo. Abas Resumo, Atendimento (diagnóstico, serviço executado, solução, observações
  técnicas), Itens (serviço/produto/peça/material, desconto, total), Checklist, Arquivos e
  Linha do tempo.
- **SLA** (`situacao_sla_os`): no prazo, vence em breve (últimos 20% do prazo, mínimo 2 h),
  atrasada, concluída no prazo/com atraso. Prioridades podem sugerir o SLA em horas.
- **Regras no banco**: permissões por ação (criar, editar, atribuir técnico, finalizar, cancelar),
  cliente da OS imutável, versão para edição concorrente, total = itens − desconto calculado pelo
  banco, OS encerrada só aceita registro do atendimento, OS nunca é excluída, histórico de status
  e eventos (criação, técnico, alterações, itens) gravados pelo banco.
- A exclusão de uma empresa pelo Super Admin remove antes OS e equipamentos
  (`lojas_excluir_dependencias`), evitando bloqueio por ordem de cascata.
- "Em execução" (`/app/service-orders/execution`) usa as mesmas abas de arquivos e linha do tempo.

### Anexos, checklist e linha do tempo da OS

- **Arquivos** (`os_anexos` + bucket privado `os-anexos`): caminho `<empresa>/<os>/<arquivo>`
  validado por `pode_acessar_arquivo_os` — ver exige `service_orders.view`, enviar exige
  `service_orders.edit`, e nunca se alcança a pasta de outra empresa ou de uma OS inexistente.
  Fotos (JPG, PNG, WEBP, HEIC) até 10 MB com momento antes/durante/depois; documentos (PDF,
  Word, Excel, TXT, CSV) até 20 MB. Tipo e tamanho vêm do que foi realmente gravado no Storage,
  não do que o cliente informa; vídeo já existe no enum, mas ainda é recusado.
- Anexo não pode ser alterado nem apagado: só **remoção lógica** (`removido_em`), registrada em
  evento. Arquivo enviado sem registro (upload interrompido) pode ser apagado do Storage pelo
  próprio autor; se o registro falha, o app remove o arquivo órfão.
- **Checklists da OS** (`os_checklists` + `os_checklist_itens`): `aplicar_checklist_os` copia os
  itens do modelo; `responder_item_checklist` valida por tipo (texto, número, data, opção da
  lista, foto que seja anexo ativo da própria OS) e grava autor e data; `remover_checklist_os` só
  enquanto não houver resposta. Finalizar a OS exige os itens obrigatórios respondidos, e OS
  encerrada não aceita mais respostas.
- **Linha do tempo** (`timeline_os`): abertura, status, prioridade, tipo, local, técnico, edições
  de campos, itens, anexos, checklists e comentários, com usuário, data/hora e dados do evento.
  Eventos são gravados só pelo banco (a política de INSERT em `log_eventos` foi removida) e
  comentários (`os_observacoes`) não podem ser editados nem apagados — atualizar a OS nunca
  destrói o histórico.
- A atividade recente do dashboard também mostra anexos e checklists.
