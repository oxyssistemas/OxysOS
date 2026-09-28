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
    return jsonResponse({ error: "Apenas o super admin pode cadastrar gerentes" }, 403);
  }

  let body: { loja_id?: string; nome_gerente?: string; email_gerente?: string; senha_gerente?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisição inválido" }, 400);
  }

  const { loja_id, nome_gerente, email_gerente, senha_gerente } = body;

  if (!loja_id || !nome_gerente || !email_gerente || !senha_gerente) {
    return jsonResponse(
      { error: "Campos obrigatórios: loja_id, nome_gerente, email_gerente, senha_gerente" },
      400,
    );
  }

  if (senha_gerente.length < 8) {
    return jsonResponse({ error: "A senha deve ter ao menos 8 caracteres" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: loja, error: lojaError } = await adminClient
    .from("lojas")
    .select("id")
    .eq("id", loja_id)
    .single();

  if (lojaError || !loja) {
    return jsonResponse({ error: "Loja não encontrada" }, 404);
  }

  const { data: authUser, error: authCreateError } = await adminClient.auth.admin.createUser({
    email: email_gerente,
    password: senha_gerente,
    email_confirm: true,
    user_metadata: { nome: nome_gerente, papel: "gerente" },
  });

  if (authCreateError || !authUser?.user) {
    return jsonResponse(
      { error: "Erro ao criar login do gerente", detalhes: authCreateError?.message },
      500,
    );
  }

  const { error: usuarioInsertError } = await adminClient.from("usuarios").insert({
    id: authUser.user.id,
    loja_id,
    nome: nome_gerente,
    email: email_gerente,
    papel: "gerente",
  });

  if (usuarioInsertError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    return jsonResponse(
      { error: "Erro ao vincular gerente à loja", detalhes: usuarioInsertError.message },
      500,
    );
  }

  return jsonResponse({
    sucesso: true,
    gerente: { id: authUser.user.id, nome: nome_gerente, email: email_gerente, loja_id },
  });
});
