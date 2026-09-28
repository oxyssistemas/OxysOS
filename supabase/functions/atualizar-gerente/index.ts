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
    return jsonResponse({ error: "Apenas o super admin pode editar gerentes" }, 403);
  }

  let body: { gerente_id?: string; nome?: string; email?: string; loja_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisição inválido" }, 400);
  }

  const { gerente_id, nome, email, loja_id } = body;

  if (!gerente_id) {
    return jsonResponse({ error: "Campo obrigatório: gerente_id" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: gerenteAtual, error: gerenteError } = await adminClient
    .from("usuarios")
    .select("id, email, papel")
    .eq("id", gerente_id)
    .eq("papel", "gerente")
    .single();

  if (gerenteError || !gerenteAtual) {
    return jsonResponse({ error: "Gerente não encontrado" }, 404);
  }

  if (email && email !== gerenteAtual.email) {
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(gerente_id, { email });
    if (authUpdateError) {
      return jsonResponse({ error: "Erro ao atualizar e-mail", detalhes: authUpdateError.message }, 500);
    }
  }

  const camposParaAtualizar: Record<string, string> = {};
  if (nome) camposParaAtualizar.nome = nome;
  if (email) camposParaAtualizar.email = email;
  if (loja_id) camposParaAtualizar.loja_id = loja_id;

  if (Object.keys(camposParaAtualizar).length > 0) {
    const { error: updateError } = await adminClient
      .from("usuarios")
      .update(camposParaAtualizar)
      .eq("id", gerente_id);

    if (updateError) {
      return jsonResponse({ error: "Erro ao atualizar gerente", detalhes: updateError.message }, 500);
    }
  }

  return jsonResponse({ sucesso: true });
});
