// Altera o acesso (e-mail e senha) de um usuário da empresa.
// Nome, cargo e situação são alterados pelas funções do banco
// (renomear_usuario_equipe, definir_cargo_usuario, definir_usuario_ativo).
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

  const [{ data: podeGerenciar }, { data: lojaId }, { data: ehProprietario }] = await Promise.all([
    userClient.rpc("tem_permissao", { p_chave: "team.manage" }),
    userClient.rpc("loja_operacional_id"),
    userClient.rpc("eh_proprietario"),
  ]);

  if (!podeGerenciar || !lojaId) {
    return jsonResponse({ error: "Sem permissão para gerenciar a equipe." }, 403);
  }

  let body: { usuario_id?: string; email?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Corpo da requisição inválido" }, 400);
  }

  const usuarioId = body.usuario_id ?? "";
  const email = body.email?.trim().toLowerCase();
  const senha = body.senha;

  if (!usuarioId) return jsonResponse({ error: "Campo obrigatório: usuario_id" }, 400);
  if (email !== undefined && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return jsonResponse({ error: "Informe um e-mail válido." }, 400);
  }
  if (senha !== undefined && senha.length < 8) {
    return jsonResponse({ error: "A senha deve ter ao menos 8 caracteres." }, 400);
  }
  if (email === undefined && senha === undefined) {
    return jsonResponse({ error: "Informe o novo e-mail ou a nova senha." }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: alvo } = await adminClient
    .from("usuarios")
    .select("id, email, papel, loja_id")
    .eq("id", usuarioId)
    .eq("loja_id", lojaId)
    .maybeSingle();

  if (!alvo) return jsonResponse({ error: "Usuário não encontrado nesta empresa." }, 404);
  if (alvo.papel === "super_admin") {
    return jsonResponse({ error: "Este usuário não é administrado pela empresa." }, 403);
  }
  if (alvo.papel === "gerente" && !ehProprietario) {
    return jsonResponse({ error: "O responsável pela empresa só pode ser alterado por um Proprietário." }, 403);
  }

  const alteracoes: { email?: string; password?: string } = {};
  if (email !== undefined && email !== alvo.email) alteracoes.email = email;
  if (senha !== undefined) alteracoes.password = senha;

  if (Object.keys(alteracoes).length > 0) {
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(usuarioId, {
      ...alteracoes,
      ...(alteracoes.email ? { email_confirm: true } : {}),
    });
    if (authUpdateError) {
      const jaExiste = /already|exists|registered/i.test(authUpdateError.message);
      console.error("[atualizar-funcionario] auth", authUpdateError);
      return jsonResponse(
        { error: jaExiste ? "Já existe um login com este e-mail." : "Não foi possível alterar o acesso." },
        jaExiste ? 409 : 500,
      );
    }
  }

  if (alteracoes.email) {
    const { error: updateError } = await adminClient
      .from("usuarios")
      .update({ email: alteracoes.email })
      .eq("id", usuarioId);
    if (updateError) {
      console.error("[atualizar-funcionario] usuarios", updateError);
      return jsonResponse({ error: "E-mail alterado no login, mas não no cadastro. Tente novamente." }, 500);
    }
  }

  await adminClient.from("logs_auditoria").insert({
    ator_usuario_id: userData.user.id,
    loja_id: lojaId,
    acao: "usuario_acesso_alterado",
    tipo_entidade: "usuario",
    entidade_id: usuarioId,
    metadados: { email_alterado: !!alteracoes.email, senha_alterada: !!alteracoes.password },
  });

  return jsonResponse({ sucesso: true });
});
