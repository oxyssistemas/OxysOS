import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STATUS_PADRAO = [
  { nome: "Aberta", categoria: "aberto", cor: "#378ADD", ordem: 1 },
  { nome: "Em andamento", categoria: "em_andamento", cor: "#EF9F27", ordem: 2 },
  { nome: "Concluída", categoria: "finalizado_sucesso", cor: "#639922", ordem: 3 },
  { nome: "Cancelada", categoria: "finalizado_cancelado", cor: "#E24B4A", ordem: 4 },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Não autenticado" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Sessão inválida" }, 401);
  }

  // is_super_admin confere papel e ativo: super admin desativado com token ainda válido é barrado
  const { data: ehSuperAdmin, error: papelError } = await userClient.rpc("is_super_admin");

  if (papelError || ehSuperAdmin !== true) {
    return jsonResponse({ error: "Apenas o super admin pode criar empresas" }, 403);
  }

  let body: {
    nome_loja?: string;
    cnpj?: string;
    telefone?: string;
    cidade?: string;
    estado?: string;
    segmento_id?: string;
    plano_id?: string;
    ciclo_cobranca?: "mensal" | "anual";
    eh_trial?: boolean;
    trial_dias?: number;
    nome_gerente?: string;
    email_gerente?: string;
    senha_gerente?: string;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisição inválido" }, 400);
  }

  const {
    nome_loja, cnpj, telefone, cidade, estado, segmento_id, plano_id,
    ciclo_cobranca, eh_trial, trial_dias,
    nome_gerente, email_gerente, senha_gerente,
  } = body;

  if (!nome_loja || !nome_gerente || !email_gerente || !senha_gerente || !plano_id) {
    return jsonResponse(
      { error: "Campos obrigatórios: nome_loja, plano_id, nome_gerente, email_gerente, senha_gerente" },
      400,
    );
  }

  if (senha_gerente.length < 8) {
    return jsonResponse({ error: "A senha do gerente deve ter ao menos 8 caracteres" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: loja, error: lojaError } = await adminClient
    .from("lojas")
    .insert({
      nome: nome_loja,
      cnpj: cnpj ?? null,
      telefone: telefone ?? null,
      cidade: cidade ?? null,
      estado: estado ?? null,
      segmento_id: segmento_id ?? null,
    })
    .select()
    .single();

  if (lojaError || !loja) {
    return jsonResponse({ error: "Erro ao criar empresa", detalhes: lojaError?.message }, 500);
  }

  const { data: authUser, error: authCreateError } = await adminClient.auth.admin.createUser({
    email: email_gerente,
    password: senha_gerente,
    email_confirm: true,
    user_metadata: { nome: nome_gerente, papel: "gerente" },
  });

  if (authCreateError || !authUser?.user) {
    await adminClient.from("lojas").delete().eq("id", loja.id);
    return jsonResponse(
      { error: "Erro ao criar login do responsável", detalhes: authCreateError?.message },
      500,
    );
  }

  const { error: usuarioInsertError } = await adminClient.from("usuarios").insert({
    id: authUser.user.id,
    loja_id: loja.id,
    nome: nome_gerente,
    email: email_gerente,
    papel: "gerente",
  });

  if (usuarioInsertError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    await adminClient.from("lojas").delete().eq("id", loja.id);
    return jsonResponse(
      { error: "Erro ao vincular responsável à empresa", detalhes: usuarioInsertError.message },
      500,
    );
  }

  const statusParaInserir = STATUS_PADRAO.map((s) => ({ ...s, loja_id: loja.id }));
  const { error: statusError } = await adminClient.from("status_os").insert(statusParaInserir);

  const agora = new Date();
  const trialTerminaEm = eh_trial
    ? new Date(agora.getTime() + (trial_dias ?? 14) * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error: assinaturaError } = await adminClient.from("assinaturas").insert({
    loja_id: loja.id,
    plano_id,
    status: eh_trial ? "trial" : "active",
    ciclo_cobranca: ciclo_cobranca ?? "mensal",
    trial_termina_em: trialTerminaEm,
    periodo_atual_inicio: agora.toISOString(),
  });

  await adminClient.from("logs_auditoria").insert({
    ator_usuario_id: userData.user.id,
    loja_id: loja.id,
    acao: "empresa_criada",
    tipo_entidade: "loja",
    entidade_id: loja.id,
    metadados: { nome_loja, plano_id, eh_trial: !!eh_trial, gerente: email_gerente },
  });

  if (statusError || assinaturaError) {
    return jsonResponse(
      {
        aviso: "Empresa e responsável criados, mas houve erro em uma etapa auxiliar",
        detalhes: statusError?.message || assinaturaError?.message,
        loja,
        gerente: { id: authUser.user.id, nome: nome_gerente, email: email_gerente },
      },
      207,
    );
  }

  return jsonResponse({
    sucesso: true,
    loja,
    gerente: { id: authUser.user.id, nome: nome_gerente, email: email_gerente },
  });
});
