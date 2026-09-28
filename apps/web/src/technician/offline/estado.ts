import { ehErroRede } from "@/lib/erros";
import { apagar, esvaziar, gravar, ler } from "./armazem";

/**
 * Regras do que fica no aparelho (§50): só com a feature offline_mode, só do
 * usuário logado (trocou de usuário ou empresa → apaga tudo), só o que o
 * atendimento precisa, e com validade.
 */
const CHAVE_DONO = "oxys-campo:dono";
const CHAVE_CONTEXTO = "oxys-campo:contexto";
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

let ativo = false;

export interface Guardado<T> {
  valor: T;
  salvo_em: string;
}

export function offlineAtivo(): boolean {
  return ativo;
}

function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // armazenamento bloqueado: segue sem cópia local
  }
}

/** Chamado quando o contexto do portal chega do servidor. */
export async function configurarOffline(opcoes: { ativo: boolean; dono: string }) {
  if (lerLocal(CHAVE_DONO) !== opcoes.dono) {
    await apagarDadosDoAparelho();
    gravarLocal(CHAVE_DONO, opcoes.dono);
  }
  ativo = opcoes.ativo;
  if (!ativo) {
    gravarLocal(CHAVE_CONTEXTO, null);
    await esvaziar("dados").catch(() => undefined);
  }
}

/** Sair, trocar de usuário ou perder a feature: nada do atendimento fica no aparelho. */
export async function apagarDadosDoAparelho() {
  ativo = false;
  gravarLocal(CHAVE_CONTEXTO, null);
  gravarLocal(CHAVE_DONO, null);
  await Promise.all([esvaziar("dados"), esvaziar("fila")]).catch(() => undefined);
}

/** Contexto do portal (quem é, permissões) para abrir sem internet. */
export function guardarContexto(usuarioId: string, contexto: unknown) {
  gravarLocal(CHAVE_CONTEXTO, JSON.stringify({ usuarioId, contexto, salvo_em: new Date().toISOString() }));
}

export function contextoGuardado<T>(usuarioId: string): T | null {
  const bruto = lerLocal(CHAVE_CONTEXTO);
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto) as { usuarioId: string; contexto: T; salvo_em: string };
    if (dados.usuarioId !== usuarioId || Date.now() - new Date(dados.salvo_em).getTime() > VALIDADE_MS) return null;
    return dados.contexto;
  } catch {
    return null;
  }
}

export async function lerCopia<T>(chave: string): Promise<Guardado<T> | null> {
  const g = await ler<Guardado<T>>("dados", chave).catch(() => undefined);
  if (!g) return null;
  if (Date.now() - new Date(g.salvo_em).getTime() > VALIDADE_MS) {
    await apagar("dados", chave).catch(() => undefined);
    return null;
  }
  return g;
}

export function gravarCopia<T>(chave: string, valor: T) {
  return gravar("dados", { valor, salvo_em: new Date().toISOString() } satisfies Guardado<T>, chave).catch(() => undefined);
}

/** Ajusta a cópia local (ex.: resposta feita offline aparece ao reabrir a tela). */
export async function ajustarCopia<T>(chave: string, ajuste: (valor: T) => T) {
  const g = await lerCopia<T>(chave);
  if (g) await gravar("dados", { valor: ajuste(g.valor), salvo_em: g.salvo_em }, chave).catch(() => undefined);
}

export class SemCopiaOffline extends Error {
  constructor() {
    super("Sem internet e sem cópia deste atendimento no aparelho. Abra-o uma vez com conexão.");
    this.name = "SemCopiaOffline";
  }
}

/**
 * Leitura com cópia: online busca e guarda; sem internet (ou se a rede cair
 * no meio) devolve a última cópia. Sem a feature, é só a busca normal.
 */
export async function lerComCopia<T>(chave: string, buscar: () => Promise<T>, ajustar?: (valor: T) => Promise<T>): Promise<T> {
  if (!ativo) return buscar();
  const deCopia = async () => {
    const g = await lerCopia<T>(chave);
    if (!g) throw new SemCopiaOffline();
    return ajustar ? ajustar(g.valor) : g.valor;
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return deCopia();
  try {
    const valor = await buscar();
    await gravarCopia(chave, valor);
    return ajustar ? ajustar(valor) : valor;
  } catch (e) {
    if (ehErroRede(e)) return deCopia();
    throw e;
  }
}
