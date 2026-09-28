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
| `supabase/tests/fase2_16_timeline_anexos_checklist.sql` | 40 |
| `supabase/tests/fase2_19_equipe_permissoes.sql` | 30 |
| `supabase/tests/fase2_20_relatorios.sql` | 17 |
| `supabase/tests/fase3_01_equipes_disponibilidade.sql` | 24 |
| `supabase/tests/fase3_02_agenda.sql` | 17 |
| `supabase/tests/fase3_03_agendamento_conflitos.sql` | 28 |
| `supabase/tests/fase3_04_central_despacho.sql` | 17 |
| `supabase/tests/fase3_05_portal_tecnico_acesso.sql` | 14 |
| `supabase/tests/fase3_06_agenda_tecnico.sql` | 14 |
| `supabase/tests/fase3_07_fluxo_campo.sql` | 20 |
| `supabase/tests/fase3_08_apontamento_horas.sql` | 30 |
| `supabase/tests/fase3_09_checklist_avancado.sql` | 31 |
| `supabase/tests/fase3_10_evidencias.sql` | 14 |
| `supabase/tests/fase3_11_materiais_servicos.sql` | 20 |
| `supabase/tests/fase3_12_assinatura_cliente.sql` | 21 |
| `supabase/tests/fase3_13_finalizacao_os.sql` | 24 |
| `supabase/tests/fase3_14_relatorio_tecnico.sql` | 17 |
| `supabase/tests/fase3_15_notificacoes.sql` | 15 |
| `supabase/tests/fase3_16_sincronizacao_offline.sql` | 16 |
| `supabase/tests/fase3_17_seguranca.sql` | 19 |

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

## Portal do Técnico (`/technician`, fase 3 · etapa 7)

Portal de campo separado do `/app`: uma coluna, alvos grandes e navegação fixa embaixo
(Início, Agenda, Atendimentos, Perfil). Mesma identidade escura, sem a barra lateral
administrativa.

- **Quem entra é decidido no banco.** `destino_inicial()` devolve `admin`, `technician` ou
  `app` e o `/` redireciona por ela; `contexto_tecnico()` devolve `liberado` ou o motivo do
  bloqueio (`sem_feature`, `sem_tecnico`, `sem_permissao`, `sem_acesso`). Para entrar é
  preciso: feature `technician_portal` (Pro para cima), permissão `technician.jobs.view` e
  estar vinculado a um **técnico ativo** da empresa — técnico desativado ou cargo sem a
  permissão perde o portal na hora.
- Uma chamada monta o portal: técnico, empresa, cargo, especialidades, equipes, jornada,
  permissões de campo e se o mesmo login também abre o `/app`.
- **Home** (`home_tecnico`): saudação, o dia em números (atendimentos, prioridade alta,
  concluídos, aviso de atendimento em andamento), o próximo atendimento com horário,
  cliente, local, tipo, status e prioridade, e quantos vêm nos próximos 7 dias.
- O técnico enxerga **os atendimentos dele e os das equipes de que participa** — nunca os de
  outro técnico (decisão do usuário, aplicada dentro das funções).
- Perfil: dados de acesso, especialidades, equipes, jornada (leitura — quem ajusta é a
  empresa), atalho para o `/app` quando o cargo permite, e sair.
### Agenda e atendimento no portal (fase 3 · etapa 8)

- **Agenda** (`agenda_tecnico`): abas **Hoje**, **Próximos** e **Concluídos** (30 dias). Cada
  cartão traz horário, cliente, endereço, tipo de serviço, prioridade e status, mais a marca
  de quando o atendimento veio pela equipe.
- **Atendimento** (`atendimento_tecnico`, rota `/technician/jobs/:id`): OS e número, o que o
  cliente relatou, objeto, contato com botão de ligar, endereço completo com **Ver rota**
  (abre o app de mapas do celular — a fase não tem roteirização própria) e o equipamento com
  marca, modelo, número de série e localização. A observação do agendamento ("levar escada")
  aparece no topo.
- **Nada de dinheiro no campo**: valor, desconto e itens da OS não são enviados ao portal.
  Telefone e e-mail do cliente só vão para quem tem `customers.view`.
- A aba **Atendimentos** abre direto o que está em andamento (ou o próximo da fila) por
  `atendimento_atual_tecnico`.
- Cada função confere de novo que o atendimento é do técnico ou de uma equipe dele; de outro
  técnico ou de outra empresa devolve "não encontrado".
### Fluxo de campo (fase 3 · etapa 9)

- `agendamentos.estado_campo` guarda onde o atendimento está: `nao_iniciado` →
  `em_deslocamento` → `no_local` → `em_atendimento` ⇄ `pausado` → `finalizado` (etapa 15).
- **Máquina de estados no servidor** (`registrar_passo_campo`, função interna sem execute para
  ninguém; o portal chama `iniciar_deslocamento`, `registrar_chegada`,
  `iniciar_atendimento_campo`, `pausar_atendimento` e `retomar_atendimento`). Cada passo
  confere permissão do cargo (`technician.jobs.start` / `technician.jobs.pause`), se o
  atendimento é do técnico (ou de uma equipe dele) e se a transição é válida — pausar sem ter
  começado, retomar sem estar pausado ou repetir o deslocamento são recusados.
- **Apontamentos de tempo** (`os_apontamentos`, §26) com tipo `deslocamento`, `atendimento` e
  `pausa`, motivo da pausa (almoço, aguardando cliente, aguardando peça, problema técnico,
  outro) e observação. O relógio é o do banco: cada passo fecha o anterior e abre o próximo, e
  um índice único garante **um único apontamento aberto por técnico**. Pausar fecha o trecho
  de trabalho e retomar abre outro, então o tempo efetivo é a soma dos trechos de atendimento.
- Tudo entra na linha do tempo da OS: `os_deslocamento_iniciado`, `os_tecnico_chegou`,
  `os_atendimento_iniciado`, `os_atendimento_pausado` e `os_atendimento_retomado`.
- A **central de despacho** passou a mostrar *Em deslocamento* e *Pausa* de verdade: a situação
  do técnico é lida do que ele registrou em campo, com as regras anteriores (ausência, agenda,
  jornada) como segundo critério.
- No portal: botões grandes com o próximo passo possível, cronômetro do relógio aberto
  ("Atendendo há 42 min"), folha de motivos ao pausar e os tempos somados por tipo. O botão
  "Finalizar atendimento" leva à tela de finalização (etapa 15).

### Apontamento de horas (fase 3 · etapa 10)

- `os_apontamentos` ganhou `duracao_min` (coluna gerada, nula enquanto o trecho está aberto),
  `origem` (`automatico` = relógio de campo, `manual` = lançado ou corrigido por alguém) e a
  auditoria `atualizado_em` / `atualizado_por`.
- **Nada de tempo sobreposto**: uma constraint de exclusão (`gist` sobre técnico +
  `tstzrange(inicio_em, fim_em)`) impede que o mesmo técnico tenha dois trechos no mesmo
  instante, inclusive por INSERT direto. Dois técnicos no mesmo horário continuam válidos.
- Escrita só pelas funções `lancar_apontamento`, `lancar_apontamento_tecnico`,
  `ajustar_apontamento` e `excluir_apontamento`. Elas conferem: **gestor** com a permissão nova
  `service_orders.manage_time` (cargos Proprietário e Gerente) **ou** o **próprio técnico** com
  `technician.jobs.start` no apontamento dele — ninguém mexe na hora de outro técnico. OS
  encerrada não recebe nem corrige hora (reabra a OS).
- Regras do intervalo, todas no servidor (§26 — o navegador nunca informa duração): fim depois
  do início, nada no futuro, no máximo 24 horas, nada com mais de 180 dias, motivo obrigatório
  só em pausa e nenhuma sobreposição. Corrigir o apontamento que está correndo com o fim em
  branco mantém o relógio aberto.
- Consulta: `horas_os(os)` devolve totais (deslocamento, atendimento, pausa e trabalhado),
  rateio por técnico e a lista de trechos (`service_orders.view`); `horas_atendimento(agendamento)`
  faz o mesmo para o portal do técnico. O trecho aberto conta até agora.
- Interface: aba **Horas** no detalhe da OS (totais, rateio por técnico, lista com
  "correndo agora" / "lançamento manual" / "corrigido", painel para lançar e corrigir) e a tela
  **Minhas horas** no portal do técnico (`/technician/jobs/:id/horas`), para lançar o tempo
  esquecido e ajustar o próprio.
- Linha do tempo: `os_hora_lancada`, `os_hora_ajustada` e `os_hora_removida`, com tipo, período
  e duração. Os passos de campo da etapa 9 também ganharam texto próprio (antes caíam no
  genérico "registrou uma alteração") e há o filtro **Campo e horas**.

### Checklist avançado (fase 3 · etapa 11)

- Três tipos novos de item, do plano Pro para cima (feature `advanced_checklists`): **hora**,
  **medição** (com unidade e faixa esperada) e **assinatura**. Os seis tipos antigos seguem em
  qualquer plano.
- **Medição**: a leitura é sempre gravada; fora da faixa o item volta com `fora_faixa` e a tela
  avisa — não bloqueia, porque a medição real é o dado.
- **Item condicional** (§28): `depende_de_ordem` + `condicao_valor` no item. Ele aparece só
  quando o item anterior (caixa de seleção ou lista) responder o valor combinado. Como a
  condição olha a resposta do irmão, um item que depende de outro escondido também some — o
  encadeamento sai de graça, sem engine. Item escondido **não é exigido na finalização**, não
  aceita resposta e **perde a resposta** se a condição deixar de valer.
- O banco valida a condição ao salvar o modelo: só aponta para um item **acima**, só sobre
  caixa de seleção ou lista, e só com um valor que aquele item possa ter.
- Responder o checklist passa a aceitar **`checklists.fill`** além de `service_orders.edit` —
  é a permissão que o cargo de campo usa (aplicar e remover checklist seguem com
  `service_orders.edit`).
- `checklists_os` devolve `visivel`, `fora_faixa` e `pendentes` (obrigatórios visíveis em
  aberto); `item_checklist_visivel`, `item_checklist_pendente` e `item_checklist_fora_faixa`
  ficam fora da API (só são chamadas de dentro das funções `security definer`).
- Configurações › Checklists: campos de unidade e faixa na medição, seletor
  "Mostrar só quando … for …" por item, e **modelos prontos por segmento** (§29 e §30) — CFTV,
  alarme, controle de acesso, split, higienização, preventiva, computador, rede, servidor e
  visita técnica. Nada é criado sozinho: a sugestão só entra no banco quando alguém clica.
- Portal do técnico: tela **Checklist** do atendimento (`/technician/jobs/:id/checklist`) com
  os controles em alvo grande, foto pela câmera do aparelho e o mesmo cálculo de pendências.
- O item de assinatura grava uma imagem anexada à OS; desde a etapa 14 ela é colhida na
  própria tela (ver "Assinatura e confirmação do cliente").

### Fotos e evidências (fase 3 · etapa 12)

- As categorias de foto passaram de três para as seis do §31: **antes, durante, depois,
  problema, equipamento e outros**. A coluna continua se chamando `momento` (o enum é
  `momento_foto_os`); na interface ela aparece como *Categoria*.
- Cada evidência guarda OS, **técnico**, data/hora, categoria e descrição (§32). O
  `os_anexos.tecnico_id` é preenchido pelo servidor a partir do login (`tecnico_do_usuario()`)
  — o que o cliente mandar nesse campo é ignorado, e quem não é técnico fica sem autoria de
  campo.
- **`attachments.upload`** passou a valer de verdade: com ela o cargo de campo envia arquivo
  (no Storage e na tabela) sem precisar de `service_orders.edit`, e remove **o que ele mesmo
  enviou**. Quem edita a OS remove qualquer evidência; a remoção continua lógica.
- **Compressão no aparelho** (§33, `apps/web/src/lib/imagem.ts`): foto acima de 700 KB é
  redesenhada até 2048 px no lado maior com qualidade 0,85 antes de subir — o suficiente para
  ler etiqueta, número de série e dano. O arquivo original é mantido quando o formato não abre
  no navegador (HEIC), quando já é pequeno ou quando a compressão não reduziria nada.
- `anexos_os` devolve categoria, técnico, autor e `meu` (enviado pelo usuário logado), que é o
  que a galeria usa para decidir o botão de remover.
- Portal do técnico: tela **Fotos e evidências** (`/technician/jobs/:id/fotos`) com *Tirar
  foto* (câmera do aparelho) e *Enviar*, categoria em botões grandes, descrição opcional e a
  galeria agrupada por categoria. Na aba Arquivos da OS entraram as categorias novas, a
  descrição no envio e a autoria de campo em cada foto.

### Materiais e serviços (fase 3 · etapa 13)

- **Catálogo da empresa** (`catalogo_itens`, Configurações › Materiais e serviços): tipo, nome,
  unidade, valor padrão, código opcional e observação. É o "catálogo existente" do §35 — **não
  é estoque**: não tem saldo, entrada nem baixa (§65). Nome único por tipo (acento e caixa não
  contam) e código único na empresa. Item já usado em OS é desativado, não excluído.
- O item da OS ganhou `unidade`, `observacao` e `catalogo_item_id`. Escolher do catálogo faz o
  banco copiar tipo, nome e unidade para a linha — o que o cliente mandar nesses campos é
  ignorado, e o item continua coerente mesmo que o catálogo mude depois. Esse vínculo é o
  ponto de encaixe da futura baixa de estoque (§34).
- **`service_orders.add_material`** passou a valer: com ela o cargo de campo lança item e
  ajusta/remove **o que ele mesmo registrou**, sem `service_orders.edit`. E quem não edita a OS
  **não define preço**: o valor vem do catálogo, ou fica zero no item avulso.
- `itens_os(os)` devolve a lista com `pode_lancar` e `mostra_valores` — o técnico vê o que usou,
  com unidade e observação, mas sem preço, que é assunto de quem edita a OS.
- Na OS: seletor do catálogo no painel de item (com tipo/descrição/unidade travados quando vem
  de lá), coluna de quantidade com unidade e a observação abaixo da descrição. No portal do
  técnico, a tela **Materiais e serviços** (`/technician/jobs/:id/materiais`).
- A linha do tempo do item agora leva unidade e observação junto de quantidade e subtotal.

### Assinatura e confirmação do cliente (fase 3 · etapa 14)

- **Quadro de assinatura por toque** (`components/AssinaturaTouch.tsx`): Pointer Events (dedo,
  caneta e mouse), `touch-action: none` para a página não rolar enquanto assina, traço nítido
  em tela retina e fundo branco. Traço curto (< 40 px) conta como toque sem querer. A imagem
  é recortada na tinta e limitada a 900 px de largura antes de sair do aparelho.
- **Confirmação do cliente** (`os_assinaturas`, §37/§38): nome de quem acompanhou, documento
  e observações opcionais e o PNG. Só se grava por `registrar_assinatura_os`, que exige
  `service_orders.sign`, trava a OS, recusa OS encerrada ("a assinatura é colhida antes de
  finalizar"), confere que o atendimento é daquela OS e que a imagem é **PNG de verdade**
  (assinatura dos bytes, não só o prefixo), calcula o **SHA-256** no servidor e usa o relógio
  do banco. A tabela não tem política de escrita: nem o dono grava direto.
- Uma assinatura válida por OS (índice único parcial). Colher de novo marca a anterior como
  substituída (quem e quando) — ela fica no histórico, sem imagem na listagem.
- `assinatura_os(os)` devolve a atual, o histórico e `pode_assinar`; a linha do tempo mostra
  "colheu a assinatura de …" (filtro "Campo e horas").
- Na OS, aba Atendimento: cartão **Confirmação do cliente** com a assinatura, a impressão
  digital e o botão para colher no balcão. No portal do técnico, a tela **Assinatura do
  cliente** (`/technician/jobs/:id/assinatura`), pensada para entregar o aparelho ao cliente.
- O item de checklist do tipo **assinatura** passou a abrir o mesmo quadro (janela
  `AssinaturaDialog`); o PNG vira anexo da OS e é vinculado ao item, como uma foto.

### Finalização da OS (fase 3 · etapa 15)

- **Requisitos configurados por tipo de serviço** (§39, Configurações › Tipos de serviço →
  "Para finalizar a OS"): diagnóstico preenchido, assinatura do cliente, materiais registrados
  e um mínimo de fotos (0–20). O checklist obrigatório vale sempre; OS sem tipo só exige o
  checklist. Tudo desligado por padrão, então as empresas existentes não mudam de comportamento.
- **Uma regra só** (§20): `requisitos_finalizacao_os` decide o que falta e `efetivar_status_os`
  troca o status. Os dois caminhos passam por elas — "Alterar status/Finalizar" no Portal da
  Empresa (`alterar_status_os`) e "Finalizar atendimento" no portal do técnico
  (`finalizar_atendimento_campo`). A recusa diz exatamente o que falta ("Antes de finalizar:
  preencha o diagnóstico; colha a assinatura do cliente."). Os helpers ficam fora da API.
- **Finalizar em campo** exige `technician.jobs.complete`, o atendimento do próprio técnico (ou da
  equipe) e que ele tenha começado: não se finaliza o que está "não iniciado", "em deslocamento"
  ou "no local". Duas saídas: **Serviço concluído** (valida os requisitos e leva a OS ao status
  de finalização da empresa) ou **Volto outro dia** (fecha só a visita e o relógio; a OS segue
  aberta — o retorno é um novo agendamento).
- Ao finalizar a OS por qualquer caminho, relógios ainda abertos dela são fechados e visitas
  pendentes são concluídas; cancelar fecha os relógios.
- **Diagnóstico em campo** (§36): a OS ganhou `causa` e `recomendacao`, e o técnico preenche
  diagnóstico, causa, serviço executado, solução, recomendação e observações pela tela
  **Diagnóstico e solução** (`/technician/jobs/:id/diagnostico`). A função
  `registrar_atendimento_campo` só aceita esses campos e o gatilho da OS, avisado por ela,
  libera apenas o registro do atendimento — um cargo de campo sem `service_orders.edit`
  continua sem editar a OS pela tabela.
- **Resumo antes de finalizar** (§40, componente `ResumoFinalizacao`): tempos de deslocamento e
  atendimento, checklist, materiais, serviços, fotos, diagnóstico, solução, responsável e
  assinatura, sem valores. Aparece no painel "Finalizar" da OS (que bloqueia o botão enquanto
  falta algo) e na tela **Finalizar atendimento** do portal
  (`/technician/jobs/:id/finalizar`), com atalhos para resolver cada pendência.
- A linha do tempo mostra "finalizou o atendimento em campo e encerrou a OS" ou "concluiu a
  visita sem encerrar a OS".

### Relatório técnico (fase 3 · etapa 16)

- **Estrutura única no banco** (`montar_relatorio_os`, interna): empresa, OS, cliente, endereço,
  equipamento, técnico/equipe, problema, diagnóstico/causa/serviço/solução/recomendação,
  checklist (só itens visíveis, com "fora da faixa"), materiais e serviços **sem valores**, fotos
  (caminho, categoria, descrição, autor), horários por visita (saída, chegada, início, término),
  tempos somados e assinatura (nome, documento, data, SHA-256 e imagem). O campo `estrutura`
  versiona o formato — é a entrada pronta para um PDF gerado no servidor no futuro (§41).
- **Congelado na finalização** (`os_relatorios`): `efetivar_status_os` grava uma versão sempre
  que a OS vai para "finalizada", por qualquer caminho. Reabrir e finalizar de novo gera a
  versão 2; a 1 continua lá. Editar a OS depois não muda a versão. Ninguém grava na tabela
  direto (RLS só com leitura); cancelar não gera relatório.
- **Leitura**: `relatorio_tecnico_os(os, versao?)` (Portal da Empresa, `service_orders.view`) e
  `relatorio_tecnico_atendimento(agendamento)` (portal do técnico, só o próprio atendimento).
  OS aberta → prévia com os dados atuais; OS finalizada → última versão. Telefone, documento e
  e-mail do cliente só vão para quem tem `customers.view` (o endereço sempre vai).
- **Telas**: botão **Relatório técnico** no detalhe da OS (`/app/service-orders/:id/report`),
  com seletor de versões, e **Relatório do atendimento** no portal
  (`/technician/jobs/:id/relatorio`). O documento é branco, em A4, e **Imprimir ou salvar PDF**
  usa a impressão do navegador (o CSS de impressão esconde o resto da tela).
- O PDF da OS e o recibo (com valores) continuam como estavam.

### Notificações internas (fase 3 · etapa 17)

- **In-app** (§43), na tabela `notificacoes`: cada usuário lê só as suas (RLS) e ninguém grava
  direto — gerar e marcar como lida passam pelo banco.
- **Geradas por um gatilho em `log_eventos`** (`trg_log_eventos_notificar`): os eventos que as
  funções de agenda, campo e status já registram viram avisos, sem chamadas espalhadas pelo
  código. Quem fez a ação não é avisado, e uma falha ao gerar aviso nunca derruba a operação
  (vira só um *warning* no log do banco).
- **Quem recebe**
  - Dono e quem tem `dispatch.view`: técnico iniciou o atendimento, atendimento pausado (com o
    motivo), OS finalizada e **OS urgente atrasada**.
  - Técnico (e membros da equipe, quando o agendamento/OS é da equipe): nova OS atribuída, novo
    atendimento agendado (com dia e hora), horário alterado, atendimento cancelado e OS
    cancelada (com o motivo). Atribuir e agendar no mesmo passo gera **um** aviso só.
- **OS urgente atrasada** não tem evento: `minhas_notificacoes` gera o aviso na primeira consulta
  de qualquer pessoa da empresa depois que o prazo passa, uma vez por prazo (chave única).
- Avisos com mais de 90 dias são descartados. Os horários nas mensagens usam o fuso de Brasília.
- **Telas**: sino com contagem no topo do Portal da Empresa (painel com "Marcar todos como
  lidos"; clicar abre a OS) e, no portal do técnico, sino no cabeçalho e a tela **Avisos**
  (`/technician/notifications`; clicar abre o atendimento). A caixa é atualizada a cada minuto
  com a aba visível e ao voltar para a aba.

### PWA e modo offline do técnico (fase 3 · etapa 18)

- **Instalável** (§44): `public/manifest-tecnico.webmanifest` ("Oxys Campo", início e escopo em
  `/technician`), ícones em `public/icons` e `public/sw.js`. O manifest e o service worker só são
  ligados dentro do portal do técnico (`usePwaTecnico`); `/app` e `/admin` não mudam. O service
  worker (só no build de produção) guarda **apenas a casca** do app — `index.html` (rede primeiro)
  e `/assets/*` com hash (cache primeiro, limitado) — e **nunca** respostas da API.
- **Dados no aparelho** (§45, §50), só com a feature `offline_mode` do plano (o contexto do portal
  traz `offline`): IndexedDB `oxys-campo` com cópias da agenda, dos atendimentos de hoje e dos
  próximos dias (OS, cliente, endereço, equipamento), checklists e diagnóstico. Pré-carga ao abrir
  e a cada 15 min com internet. As cópias são do usuário logado: trocar de usuário/empresa, sair
  do app (qualquer portal) ou perder a feature apaga tudo; validade de 7 dias.
- **Fila offline** (§46): sem internet, **checklist**, **fotos** (já reduzidas, guardadas no
  aparelho) e **diagnóstico** continuam funcionando e aparecem na tela como feitos. Sobem sozinhos
  quando a rede volta (evento `online`, reenvio a cada 30 s e botão "Sincronizar agora"), na ordem
  em que foram feitos. Passos do atendimento, finalização, assinatura, materiais e horas usam o
  relógio/validação do servidor na hora e mostram "Sem internet: … precisa de conexão".
- **Conflitos** (§47): nada de "último vence". A resposta de checklist leva o `respondido_em` que o
  técnico viu; o diagnóstico leva o valor visto de cada campo. Se o escritório mudou o mesmo dado,
  a operação volta como **conflito** (o diagnóstico aplica os campos livres e devolve só os
  conflitantes) e o técnico decide na tela **Sincronização** (`/technician/sync`): "Manter a do
  servidor" ou "Usar a minha" (reenvia com a versão atual como base — decisão explícita).
- **Idempotência** (§48): cada operação tem uma chave (`sync_operacoes`, por usuário): reenviar
  depois de uma resposta perdida devolve o resultado guardado, sem aplicar de novo nem repetir
  evento na linha do tempo. A foto usa o id gerado no aparelho (caminho e registro fixos): o
  reenvio não duplica arquivo nem anexo. Finalizar/apontar continuam só online (transições do
  servidor já barram a repetição).
- **Indicador** (§49) abaixo do cabeçalho do portal: "Online"/"Offline" e "N alterações aguardando
  sincronização" ou "N alterações precisam de atenção" (link para a tela de sincronização). Sair
  com alterações não enviadas pede confirmação.
- Funções `sincronizar_resposta_checklist` e `sincronizar_atendimento_campo` (exigem portal do
  técnico e `offline_mode`, validam por dentro com as funções de sempre). A sincronização do
  cliente foi testada no navegador contra um servidor simulado (21 cenários: queda de rede no
  meio, resposta perdida, conflito, recusa, troca de usuário, sair, plano sem a feature).

### Revisão de segurança (fase 3 · etapa 19)

- **Escopo do técnico** (§55, migrations `fase3_32` e `fase3_34`): o cargo Técnico tinha
  `service_orders.view` e, trocando o id na URL, lia (e com `service_orders.edit`, alterava) qualquer
  OS da empresa. Agora quem está vinculado a um técnico e **não** tem a nova permissão
  `service_orders.view_all` só enxerga as OS **atribuídas a ele**, **à equipe dele** ou **com visita
  marcada para ele/equipe**. A regra mora em `os_no_meu_escopo_id` e vale na RLS (`ordens_servico`,
  `agendamentos`, apontamentos, assinaturas, relatórios, anexos, jornada/indisponibilidade), nas
  funções por id (OS de fora → "Ordem de serviço não encontrada."), nas listas e agregados (lista de
  OS, agenda, dashboard, relatórios, históricos de cliente/equipamento), no Storage e na sincronização
  offline. Central de despacho e verificação de conflitos (que mostram a agenda de todos) são negadas
  ao técnico restrito — para agendar, dê `service_orders.view_all` ao cargo.
- `service_orders.view_all` foi dada a todos os cargos que já viam OS, **menos o Técnico**, e entra no
  seed de empresas novas (Gerente, Atendente, Financeiro). Owner e quem não é técnico não mudam; um
  "supervisor de campo" é um cargo personalizado com a permissão.
- **anon** (`fase3_33`): perdeu todo privilégio no schema `public` (tabelas, sequências, funções),
  inclusive nos objetos criados daqui em diante. Antes a RLS barrava; agora nem o grant existe.
- **Edge functions de admin** (`criar-loja-gerente`, `criar-gerente`, `atualizar-gerente`): o fonte
  agora está em `supabase/functions/` e a checagem usa `is_super_admin()` (papel **e** `ativo`) —
  super admin desativado com token ainda válido é barrado (as três publicadas em 2026-09-28). `criar-funcionario`/`atualizar-funcionario` já validavam `team.manage`,
  empresa e o dono.
- Conferido: service role só nas edge functions; `.env` fora do git; `usuarios` sem política de
  escrita (papel não se autopromove); toda tabela com RLS.
- Teste consolidado `supabase/tests/fase3_17_seguranca.sql` (19 cenários do §68 e do §55: técnico A →
  OS da empresa B, owner A → agenda da B, técnico trocando a empresa da OS, técnico → função de owner,
  plano sem dispatch, empresa suspensa, escopo por tabela/função/lista/agenda/dashboard/Storage,
  equipe e `view_all`).
- **Pendências do dono do projeto**: ligar a proteção contra senhas vazadas no Supabase Auth
  (Authentication → Providers → Email → *Leaked password protection*); o CPF do técnico continua
  legível para quem tem `service_orders.view` (necessário no cadastro; avaliar mascarar).

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
- Preparação futura: foto, região de atendimento, comissão, localização e estoque próprio
  serão tabelas próprias ligadas a `tecnicos(loja_id, id)`.

### Equipes e disponibilidade (fase 3 · etapa 3)

- **Equipes** (`equipes` + `equipe_membros`) agrupam técnicos ativos da mesma empresa, com
  cor para a agenda e um líder opcional. Uma OS pode ir para um técnico, para uma equipe
  (`ordens_servico.equipe_id`) ou para os dois; atribuir ou trocar a equipe entra na linha
  do tempo (`os_equipe_atribuida` / `os_equipe_removida`).
- Equipe com OS em aberto não é desativada, equipe já usada em OS não é excluída (só
  desativada) e equipe inativa não recebe OS — mesma regra já aplicada a cliente,
  equipamento e técnico.
- **Jornada semanal** (`tecnico_jornada`): turnos por dia da semana, vários por dia, sem
  sobreposição (gatilho). Sem jornada cadastrada o técnico é tratado como disponível.
- **Ausências** (`tecnico_indisponibilidade`): folga, férias, atestado, treinamento,
  bloqueio ou outro. O banco recusa períodos sobrepostos do mesmo técnico por uma
  constraint de exclusão (`gist`, com `btree_gist`).
- `tecnico_disponivel_em(tecnico, inicio, fim, fuso)` é a base dos conflitos do
  agendamento: confere técnico ativo, ausências e se um turno cobre o intervalo inteiro.
- Escrita só pelas funções de servidor (`salvar_equipe`, `definir_equipe_ativa`,
  `excluir_equipe`, `salvar_jornada_tecnico`, `registrar_indisponibilidade`,
  `remover_indisponibilidade`), todas exigindo `technicians.manage`; leitura para quem tem
  `technicians.view`. As tabelas têm RLS só de `select`.
- Interface: botão **Equipes** e ação **Disponibilidade** em `/app/technicians`.
- Catálogo de permissões ganhou agenda, despacho e ações de campo
  (`calendar.*`, `dispatch.*`, `technician.jobs.*`, `checklists.fill`, `attachments.upload`,
  `service_orders.add_material`, `service_orders.sign`), aplicadas aos cargos padrão das
  empresas que já existem e ao seed das novas. As features `dispatch`,
  `advanced_checklists`, `offline_mode` e `technician_portal` valem do plano Pro para cima.

### Agenda (`/app/calendar`, fase 3 · etapa 4)

- Tabela própria `agendamentos` (`os_id`, `tecnico_id`, `equipe_id`, `inicio_em`, `fim_em`,
  `status`, `versao`): uma OS pode ter mais de uma visita, e o horário de campo passa a ser
  independente de `ordens_servico.data_agendada/hora_agendada`, que seguem como a data
  combinada com o cliente. As OS que já tinham data entraram na agenda pela migration.
- `agenda_periodo(inicio, fim, tecnico, equipe, incluir_cancelados)` devolve os eventos do
  intervalo com cliente, tipo de serviço, técnico, equipe, status e prioridade, mais as
  listas de técnicos e equipes ativos (colunas das visões por responsável). A janela é
  limitada a dois meses por consulta — a agenda pode ter milhares de registros e nunca é
  carregada inteira. O nome do cliente só vem para quem tem `customers.view`.
- Visões Dia, Semana, Mês, Técnicos e Equipes; a grade de horários posiciona o evento pelo
  horário real e divide a largura entre atendimentos sobrepostos, com marcador da hora atual.
  Filtros de técnico, equipe e cancelados ficam na URL.
- As cores são as configuradas pela empresa: faixa lateral = prioridade, ponto = status da OS.
  Nada de regra de cor fixa no componente.
- Leitura exige feature `calendar` + permissão `calendar.view` (na RPC e na política de RLS);
  a tabela não aceita escrita direta do cliente.

### Agendamento e conflitos (fase 3 · etapa 5)

- Escrita só pelas funções `agendar_os`, `reagendar_agendamento` e
  `definir_status_agendamento` (`calendar.manage`). Elas conferem a OS (não agendam OS
  finalizada), técnico/equipe ativos da empresa, duração de até 24 horas e sincronizam
  `ordens_servico.data_agendada/hora_agendada` com o próximo atendimento ativo.
- `conflitos_agendamento(tecnico, equipe, inicio, fim, ignorar, fuso)` devolve a lista com
  mensagem pronta: **técnico ocupado**, **equipe ocupada**, **técnico ausente** (com o
  motivo) e **fora da jornada**. O painel consulta enquanto o usuário preenche, e o banco
  recalcula tudo de novo dentro da transação — a checagem do navegador nunca é a única.
- Passar por cima de um conflito exige a permissão nova **`calendar.override`** (cargos
  Proprietário e Gerente); sem ela, a operação é recusada mesmo com `p_forcar`. O evento
  gravado marca `forcado`.
- Concorrência (§60): `agendar_os` e `reagendar_agendamento` tomam `pg_advisory_xact_lock`
  por técnico e por equipe antes de checar conflito, então duas pessoas agendando o mesmo
  técnico ao mesmo tempo são serializadas. Reagendar também usa `versao` (conflito 40001).
- Na agenda: botão **Agendar OS** (busca a OS em aberto), clique no evento abre o painel
  (reagendar, confirmar com o cliente, cancelar com motivo), **arrastar e soltar** move o
  atendimento na grade de Dia/Semana com confirmação ("passa para 19/09 às 12:00"), e dois
  cliques num horário vazio abrem um agendamento já naquele horário.
- Tudo entra na linha do tempo da OS: `os_agendada`, `os_reagendada` (de/para),
  `os_agendamento_confirmado`, `os_agendamento_cancelado` e `os_agendamento_reaberto`,
  além de `os_equipe_atribuida`/`os_equipe_removida`, que agora aparecem com nome e horário.

### Central de Despacho (`/app/dispatch`, fase 3 · etapa 6)

- Tela dividida: **OS não atribuídas** (em aberto, sem técnico e sem equipe) de um lado e os
  **técnicos com a agenda do dia** do outro. A fila traz cliente, local, tipo de serviço,
  prioridade, SLA (`situacao_sla_os`, a mesma regra da lista de OS) e há quanto tempo a OS
  espera.
- A **situação do técnico** sai de dados reais, nunca do frontend: `em_atendimento` (o
  atendimento em campo está em curso), `ausente` (ausência registrada agora), `ocupado`
  (agendamento cobrindo o instante), `fora_jornada` (tem jornada e o horário não está nela),
  `offline` (técnico sem login vinculado ou inativo) e `disponivel` no resto. *Deslocamento*
  e *pausa* entram quando o fluxo de campo existir (etapa 9).
- **Sugestão de técnico** (`sugerir_tecnicos`) é determinística, sem IA: pontua
  disponibilidade (sem conflito no horário, o que já considera jornada e ausência),
  especialidade exigida pelo tipo de serviço e carga do dia, e devolve os motivos em texto.
  Região ainda não entra — não existe região de atendimento cadastrada por técnico.
- As especialidades exigidas por tipo de serviço ficam em `tipo_servico_especialidades` e são
  configuradas em **Configurações › Tipos de serviço** (exige `settings.manage`).
- Distribuir: arrastar a OS até o técnico abre o agendamento já com técnico e horário
  sugerido; "Só atribuir" usa `atribuir_os`, que exige a feature `dispatch` e a permissão
  `dispatch.assign` (ver a central pede só `dispatch.view`). Os eventos de atribuição saem
  do gatilho da própria OS e aparecem na linha do tempo.

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
