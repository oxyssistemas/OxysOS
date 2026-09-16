insert into public.segmentos (nome, slug) values
  ('Segurança Eletrônica', 'seguranca-eletronica'),
  ('Informática / TI', 'ti'),
  ('Assistência Técnica', 'assistencia-tecnica'),
  ('Ar-condicionado', 'ar-condicionado'),
  ('Refrigeração', 'refrigeracao'),
  ('Energia Solar', 'energia-solar'),
  ('Elétrica', 'eletrica'),
  ('Telecom', 'telecom'),
  ('Manutenção Predial', 'manutencao-predial'),
  ('Oficina', 'oficina'),
  ('Automação', 'automacao'),
  ('Prestadores de Serviços', 'prestadores-servicos'),
  ('Outros', 'outros');

insert into public.funcionalidades (nome, key, descricao, categoria) values
  ('Ordens de Serviço', 'service_orders', 'Abertura e gestão de ordens de serviço', 'operacao'),
  ('Clientes', 'customers', 'Cadastro de clientes', 'operacao'),
  ('Técnicos', 'technicians', 'Cadastro e gestão de técnicos/equipe', 'operacao'),
  ('Agenda', 'calendar', 'Agendamento de atendimentos', 'operacao'),
  ('Estoque', 'inventory', 'Controle de peças e produtos', 'gestao'),
  ('Financeiro', 'finance', 'Controle financeiro da empresa', 'gestao'),
  ('Contratos', 'contracts', 'Gestão de contratos recorrentes', 'gestao'),
  ('Equipamentos', 'assets', 'Cadastro de equipamentos/ativos', 'operacao'),
  ('Portal do Cliente', 'customer_portal', 'Acesso do cliente final ao status da OS', 'campo'),
  ('Portal do Técnico', 'technician_portal', 'App/portal para o técnico em campo', 'campo'),
  ('Roteirização', 'routing', 'Otimização de rotas dos técnicos', 'campo'),
  ('Automações', 'automations', 'Automação de fluxos e notificações', 'inteligencia'),
  ('Inteligência Artificial', 'ai', 'Recursos de IA (sugestões, diagnósticos)', 'inteligencia'),
  ('Relatórios Avançados', 'advanced_reports', 'Relatórios e dashboards avançados', 'inteligencia'),
  ('API', 'api', 'Acesso à API para integrações', 'plataforma'),
  ('White Label', 'white_label', 'Marca própria (white label)', 'plataforma');

insert into public.planos (nome, descricao, preco_mensal, preco_anual) values
  ('Start', 'Plano inicial para pequenas operações', 99.90, 999.00),
  ('Pro', 'Plano completo para operações em crescimento', 199.90, 1999.00),
  ('Premium', 'Plano com IA, automação e white label', 399.90, 3999.00);

-- Recursos por plano
insert into public.plano_funcionalidades (plano_id, funcionalidade_id)
select p.id, f.id from public.planos p, public.funcionalidades f
where p.nome = 'Start' and f.key in ('service_orders','customers','technicians','calendar');

insert into public.plano_funcionalidades (plano_id, funcionalidade_id)
select p.id, f.id from public.planos p, public.funcionalidades f
where p.nome = 'Pro' and f.key in ('service_orders','customers','technicians','calendar','inventory','finance','contracts','assets','advanced_reports');

insert into public.plano_funcionalidades (plano_id, funcionalidade_id)
select p.id, f.id from public.planos p, public.funcionalidades f
where p.nome = 'Premium' and f.key in ('service_orders','customers','technicians','calendar','inventory','finance','contracts','assets','advanced_reports','customer_portal','technician_portal','routing','automations','ai','api','white_label');

-- Recomendações de segmento (exemplo do prompt: Segurança Eletrônica)
insert into public.segmento_funcionalidades (segmento_id, funcionalidade_id)
select s.id, f.id from public.segmentos s, public.funcionalidades f
where s.slug = 'seguranca-eletronica' and f.key in ('service_orders','customers','technicians','assets','contracts');
