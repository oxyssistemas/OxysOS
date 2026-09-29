import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@oxys/shared/supabase";
import { ehErroRede, erroAmigavel } from "@/lib/erros";
import { enviarAnexo, type ValorRespostaChecklist } from "@/app/ordens/execucaoService";
import type {
  CampoAtendimento,
  ChecklistOS,
  ItemChecklistOS,
  MomentoFoto,
  TipoItemChecklist,
} from "@/app/ordens/tiposExecucao";
import type { FinalizacaoAtendimento } from "../tipos";
import { apagar, gravar, listar } from "./armazem";

/**
 * Fila do que foi feito sem internet (§46). Cada operação leva uma chave
 * (idempotência, §48) e a versão que o técnico viu (conflito, §47). Só entram
 * na fila checklist, diagnóstico e fotos; passos do atendimento, finalização e
 * assinatura usam o relógio do servidor e exigem conexão.
 */

type Estado = "pendente" | "conflito" | "erro";

interface Base {
  chave: string;
  criada_em: string;
  estado: Estado;
  tentativas: number;
  mensagem?: string;
  /** para a tela de sincronização: "Checklist · Testou o equipamento?" */
  rotulo: string;
  os_numero: string | null;
}

export interface ServidorChecklist {
  valor_booleano: boolean | null;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_data: string | null;
  valor_hora: string | null;
  valor_opcao: string | null;
  respondido_em: string | null;
  respondido_por: string | null;
}

export interface OpChecklist extends Base {
  tipo: "checklist";
  osId: string;
  itemId: string;
  tipoItem: TipoItemChecklist;
  valor: ValorRespostaChecklist;
  /** respondido_em que o técnico viu (texto do servidor, sem arredondar) */
  base: string | null;
  servidor?: ServidorChecklist;
}

export interface OpAtendimento extends Base {
  tipo: "atendimento";
  agendamentoId: string;
  dados: Partial<Record<CampoAtendimento, string>>;
  base: Partial<Record<CampoAtendimento, string | null>>;
  conflitos?: { campo: CampoAtendimento; servidor: string | null; seu: string }[];
}

export interface OpFoto extends Base {
  tipo: "foto";
  anexoId: string;
  osId: string;
  lojaId: string;
  momento: MomentoFoto;
  descricao: string;
  nome: string;
  mime: string;
  arquivo: Blob;
}

export type OperacaoFila = OpChecklist | OpAtendimento | OpFoto;

// ---------------------------------------------------------------------------
// avisos de mudança (indicador, tela de sincronização)
// ---------------------------------------------------------------------------
const eventos = new EventTarget();
export function aoMudarFila(fn: () => void): () => void {
  eventos.addEventListener("mudou", fn);
  return () => eventos.removeEventListener("mudou", fn);
}
const avisar = () => eventos.dispatchEvent(new Event("mudou"));

export async function listarFila(): Promise<OperacaoFila[]> {
  const itens = await listar<OperacaoFila>("fila").catch(() => [] as OperacaoFila[]);
  return itens.sort((a, b) => a.criada_em.localeCompare(b.criada_em));
}

async function salvar(op: OperacaoFila) {
  await gravar("fila", op);
  avisar();
}

function nova<T extends OperacaoFila>(dados: Omit<T, "chave" | "criada_em" | "estado" | "tentativas">): T {
  return { ...dados, chave: crypto.randomUUID(), criada_em: new Date().toISOString(), estado: "pendente", tentativas: 0 } as T;
}

// ---------------------------------------------------------------------------
// entrada na fila (a mesma alteração repetida antes de enviar vira uma só)
// ---------------------------------------------------------------------------
export async function enfileirarChecklist(dados: {
  osId: string;
  item: Pick<ItemChecklistOS, "id" | "tipo" | "rotulo" | "respondido_em">;
  valor: ValorRespostaChecklist;
  osNumero: string | null;
}) {
  const fila = await listarFila();
  const anterior = fila.find(
    (o): o is OpChecklist => o.tipo === "checklist" && o.itemId === dados.item.id && o.estado === "pendente" && o.tentativas === 0,
  );
  if (anterior) {
    await salvar({ ...anterior, valor: dados.valor });
  } else {
    await salvar(
      nova<OpChecklist>({
        tipo: "checklist",
        osId: dados.osId,
        itemId: dados.item.id,
        tipoItem: dados.item.tipo,
        valor: dados.valor,
        base: dados.item.respondido_em,
        rotulo: `Checklist · ${dados.item.rotulo}`,
        os_numero: dados.osNumero,
      }),
    );
  }
}

export async function enfileirarAtendimento(dados: {
  agendamentoId: string;
  campos: Partial<Record<CampoAtendimento, string>>;
  vistos: Partial<Record<CampoAtendimento, string | null>>;
  osNumero: string | null;
}) {
  const fila = await listarFila();
  const anterior = fila.find(
    (o): o is OpAtendimento =>
      o.tipo === "atendimento" && o.agendamentoId === dados.agendamentoId && o.estado === "pendente" && o.tentativas === 0,
  );
  if (anterior) {
    // a versão vista de cada campo é a de antes da primeira edição offline
    await salvar({
      ...anterior,
      dados: { ...anterior.dados, ...dados.campos },
      base: { ...dados.vistos, ...anterior.base },
    });
  } else {
    await salvar(
      nova<OpAtendimento>({
        tipo: "atendimento",
        agendamentoId: dados.agendamentoId,
        dados: dados.campos,
        base: dados.vistos,
        rotulo: "Diagnóstico e solução",
        os_numero: dados.osNumero,
      }),
    );
  }
}

export async function enfileirarFoto(dados: Omit<OpFoto, keyof Base | "tipo" | "anexoId"> & { osNumero: string | null; rotulo: string }) {
  const { osNumero, rotulo, ...resto } = dados;
  await salvar(nova<OpFoto>({ tipo: "foto", anexoId: crypto.randomUUID(), ...resto, rotulo, os_numero: osNumero }));
}

// ---------------------------------------------------------------------------
// o que ainda não subiu aparece na tela como se já estivesse feito
// ---------------------------------------------------------------------------
const CAMPO_VALOR: Partial<Record<TipoItemChecklist, keyof ItemChecklistOS>> = {
  checkbox: "valor_booleano",
  texto: "valor_texto",
  numero: "valor_numero",
  medicao: "valor_numero",
  selecao: "valor_opcao",
  data: "valor_data",
  hora: "valor_hora",
};

export async function sobreporChecklists(osId: string, checklists: ChecklistOS[]): Promise<ChecklistOS[]> {
  const ops = (await listarFila()).filter((o): o is OpChecklist => o.tipo === "checklist" && o.osId === osId && o.estado !== "erro");
  if (ops.length === 0) return checklists;
  return checklists.map((c) => {
    const itens = c.itens.map((i) => {
      const op = [...ops].reverse().find((o) => o.itemId === i.id);
      const campo = CAMPO_VALOR[i.tipo];
      if (!op || !campo) return i;
      const vazio = op.valor === null || op.valor === "" || op.valor === false;
      return { ...i, [campo]: op.valor, respondido: !vazio };
    });
    // visibilidade condicional e pendências com as respostas locais
    const visivel = (i: ItemChecklistOS) => {
      if (i.depende_de_ordem == null) return true;
      const pai = itens.find((p) => p.ordem === i.depende_de_ordem);
      if (!pai) return false;
      if (pai.tipo === "checkbox") return String(pai.valor_booleano === true) === i.condicao_valor;
      if (pai.tipo === "selecao") return pai.valor_opcao === i.condicao_valor;
      return false;
    };
    const ajustados = itens.map((i) => ({ ...i, visivel: visivel(i) }));
    return { ...c, itens: ajustados, pendentes: ajustados.filter((i) => i.obrigatorio && i.visivel && !i.respondido).length };
  });
}

export async function sobreporFinalizacao(agendamentoId: string, dados: FinalizacaoAtendimento): Promise<FinalizacaoAtendimento> {
  const ops = (await listarFila()).filter(
    (o): o is OpAtendimento => o.tipo === "atendimento" && o.agendamentoId === agendamentoId && o.estado === "pendente",
  );
  if (ops.length === 0) return dados;
  const atendimento = { ...dados.atendimento };
  for (const op of ops) Object.assign(atendimento, op.dados);
  return { ...dados, atendimento };
}

export async function fotosPendentes(osId: string): Promise<OpFoto[]> {
  return (await listarFila()).filter((o): o is OpFoto => o.tipo === "foto" && o.osId === osId);
}

// ---------------------------------------------------------------------------
// envio
// ---------------------------------------------------------------------------
function falha(error: PostgrestError, padrao: string): Error {
  return erroAmigavel("sincronizacao", error, {}, padrao);
}

async function enviar(op: OperacaoFila): Promise<OperacaoFila | null> {
  if (op.tipo === "checklist") {
    const { data, error } = await supabase.rpc("sincronizar_resposta_checklist", {
      p_chave: op.chave,
      p_item_id: op.itemId,
      p_resposta: { valor: op.valor },
      p_base: op.base,
    });
    if (error) throw falha(error, "Não foi possível enviar a resposta do checklist.");
    const r = data as { status: "aplicado" | "conflito"; servidor?: ServidorChecklist };
    if (r.status === "aplicado") return null;
    return { ...op, estado: "conflito", servidor: r.servidor, mensagem: "O item foi alterado por outra pessoa enquanto você estava offline." };
  }

  if (op.tipo === "atendimento") {
    const { data, error } = await supabase.rpc("sincronizar_atendimento_campo", {
      p_chave: op.chave,
      p_agendamento_id: op.agendamentoId,
      p_dados: op.dados,
      p_base: op.base,
    });
    if (error) throw falha(error, "Não foi possível enviar o diagnóstico.");
    const r = data as { status: "aplicado" | "parcial" | "conflito"; conflitos: OpAtendimento["conflitos"] };
    if (r.status === "aplicado") return null;
    // o que não conflitou já foi aplicado; fica na fila só o que precisa de decisão
    const campos = new Set((r.conflitos ?? []).map((c) => c.campo));
    const resto = <T,>(o: Partial<Record<CampoAtendimento, T>>) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => campos.has(k as CampoAtendimento))) as Partial<Record<CampoAtendimento, T>>;
    return {
      ...op,
      estado: "conflito",
      dados: resto(op.dados),
      base: resto(op.base),
      conflitos: r.conflitos,
      mensagem: "Estes campos foram alterados no escritório enquanto você estava offline.",
    };
  }

  // foto: o id gerado no aparelho torna o reenvio seguro (mesmo caminho, mesmo registro)
  await enviarAnexo({
    lojaId: op.lojaId,
    osId: op.osId,
    arquivo: new File([op.arquivo], op.nome, { type: op.mime }),
    momento: op.momento,
    descricao: op.descricao,
    id: op.anexoId,
  });
  return null;
}

let processando: Promise<{ enviadas: number }> | null = null;

/** Envia na ordem em que foi feito; para na primeira falha de rede. */
export function processarFila(): Promise<{ enviadas: number }> {
  if (processando) return processando;
  processando = (async () => {
    let enviadas = 0;
    try {
      for (const op of await listarFila()) {
        if (op.estado !== "pendente") continue;
        if (typeof navigator !== "undefined" && !navigator.onLine) break;
        try {
          const resultado = await enviar({ ...op, tentativas: op.tentativas + 1 });
          if (resultado) await salvar({ ...resultado, tentativas: op.tentativas + 1 });
          else {
            await apagar("fila", op.chave);
            enviadas++;
            avisar();
          }
        } catch (e) {
          if (ehErroRede(e)) {
            await salvar({ ...op, tentativas: op.tentativas + 1 });
            break;
          }
          await salvar({
            ...op,
            tentativas: op.tentativas + 1,
            estado: "erro",
            mensagem: e instanceof Error ? e.message : "O servidor recusou esta alteração.",
          });
        }
      }
    } finally {
      processando = null;
    }
    return { enviadas };
  })();
  return processando;
}

// ---------------------------------------------------------------------------
// decisões do técnico
// ---------------------------------------------------------------------------
export async function descartarOperacao(chave: string) {
  await apagar("fila", chave);
  avisar();
}

/** Conflito: "usar a minha" reenvia com a versão atual do servidor como base (decisão explícita). */
export async function usarMinhaVersao(op: OperacaoFila) {
  await apagar("fila", op.chave);
  if (op.tipo === "checklist") {
    await salvar(nova<OpChecklist>({ ...op, base: op.servidor?.respondido_em ?? null, servidor: undefined, mensagem: undefined }));
  } else if (op.tipo === "atendimento") {
    const base = Object.fromEntries((op.conflitos ?? []).map((c) => [c.campo, c.servidor])) as OpAtendimento["base"];
    await salvar(nova<OpAtendimento>({ ...op, base, conflitos: undefined, mensagem: undefined }));
  } else {
    await salvar({ ...op, estado: "pendente", mensagem: undefined });
  }
}

/** Erro: tentar de novo como está. */
export async function tentarDeNovo(op: OperacaoFila) {
  await salvar({ ...op, estado: "pendente", mensagem: undefined });
}

