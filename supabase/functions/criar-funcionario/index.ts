// Cria o login de um usuário da empresa (papel funcionario) com um cargo.
// Autorização: quem chama precisa de team.manage na própria empresa; o cargo
// precisa ser da mesma empresa e estar ativo, e só um Proprietário cria outro.
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  // permissão e empresa resolvidas pelo banco (mesmas regras das telas)
  const [{ data: podeGerenciar }, { data: lojaId }, { data: ehProprietario }] = await Promise.all([
    userClient.rpc("tem_permissao", { p_chave: "team.manage" }),
    userClient.rpc("loja_operacional_id"),
    userClient.rpc("eh_proprietario"),
  ]);

  if (!podeGerenciar || !lojaId) {
    return jsonResponse({ error: "Sem permissão para gerenciar a equipe." }, 403);
  }

  let body: { nome?: string; email?: string; senha?: string; cargo_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisição inválido" }, 400);
  }

  const nome = (body.nome ?? "").replace(/\s+/g, " ").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const senha = body.senha ?? "";
  const cargoId = body.cargo_id ?? "";

  if (nome.length < 2 || nome.length > 80) {
    return jsonResponse({ error: "O nome deve ter de 2 a 80 caracteres." }, 400);
  }
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return jsonResponse({ error: "Informe um e-mail válido." }, 400);
  }
  if (senha.length < 8) {
    return jsonResponse({ error: "A senha deve ter ao menos 8 caracteres." }, 400);
  }
  if (!cargoId) {
    return jsonResponse({ error: "Escolha o cargo do usuário." }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: cargo } = await adminClient
    .from("cargos")
    .select("id, nome, chave, ativo, loja_id")
    .eq("id", cargoId)
    .eq("loja_id", lojaId)
    .maybeSingle();

  if (!cargo) return jsonResponse({ error: "Cargo não encontrado nesta empresa." }, 404);
  if (!cargo.ativo) return jsonResponse({ error: "Este cargo está desativado." }, 400);
  if (cargo.chave === "owner" && !ehProprietario) {
    return jsonResponse({ error: "Somente um Proprietário pode dar o cargo Proprietário." }, 403);
  }

  const { data: authUser, error: authCreateError } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, papel: "funcionario" },
  });

  if (authCreateError || !authUser?.user) {
    const jaExiste = /already|exists|registered/i.test(authCreateError?.message ?? "");
    return jsonResponse(
      { error: jaExiste ? "Já existe um login com este e-mail." : "Não foi possível criar o login." },
      jaExiste ? 409 : 500,
    );
  }

  const { error: usuarioInsertError } = await adminClient.from("usuarios").insert({
    id: authUser.user.id,
    loja_id: lojaId,
    nome,
    email,
    papel: "funcionario",
    cargo_id: cargo.id,
  });

  if (usuarioInsertError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    console.error("[criar-funcionario] vínculo", usuarioInsertError);
    return jsonResponse({ error: "Não foi possível vincular o usuário à empresa." }, 500);
  }

  await adminClient.from("log_eventos").insert({
    loja_id: lojaId,
    usuario_id: userData.user.id,
    acao: "funcionario_criado",
    detalhes: { funcionario_id: authUser.user.id, nome, email, cargo: cargo.nome },
  });
  await adminClient.from("logs_auditoria").insert({
    ator_usuario_id: userData.user.id,
    loja_id: lojaId,
    acao: "usuario_criado",
    tipo_entidade: "usuario",
    entidade_id: authUser.user.id,
    metadados: { nome, email, cargo: cargo.nome },
  });

  return jsonResponse({ sucesso: true, usuario: { id: authUser.user.id, nome, email } });
});
