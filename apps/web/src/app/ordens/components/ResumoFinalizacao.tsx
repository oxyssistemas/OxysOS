import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatarDataHora } from "../tipos";
import { duracaoEmHoras, type ResumoFinalizacao as Resumo } from "../tiposExecucao";

interface ResumoFinalizacaoProps {
  resumo: Resumo;
  /** layout de uma coluna, com texto maior (portal do técnico) */
  campo?: boolean;
}

function quantidade(q: number, unidade: string | null): string {
  const n = Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade ? `${n} ${unidade}` : `${n}×`;
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{rotulo}</dt>
      <dd className="text-sm text-text-primary">{children}</dd>
    </div>
  );
}

const vazio = <span className="text-text-muted">Não registrado</span>;

/** O que falta para finalizar (§39) e o resumo do atendimento (§40). */
export function ResumoFinalizacao({ resumo, campo }: ResumoFinalizacaoProps) {
  const { tempos, checklist, atendimento } = resumo;
  const pendentes = resumo.requisitos.filter((r) => !r.ok);

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="titulo-requisitos"
        className={`rounded-xl border p-4 ${pendentes.length ? "border-amber-400/30 bg-amber-400/5" : "border-success/30 bg-success/5"}`}
      >
        <h3 id="titulo-requisitos" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {pendentes.length ? (
            <AlertTriangle size={16} className="text-amber-300" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
          )}
          {pendentes.length === 0
            ? "Tudo pronto para finalizar"
            : pendentes.length === 1
              ? "Falta 1 item para finalizar"
              : `Faltam ${pendentes.length} itens para finalizar`}
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {resumo.requisitos.map((r) => (
            <li key={r.chave} className="flex items-start gap-2 text-sm">
              {r.ok ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" aria-label="Cumprido" />
              ) : (
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" aria-label="Pendente" />
              )}
              <span className="flex-1">
                <span className={r.ok ? "text-text-secondary" : "font-medium text-text-primary"}>{r.rotulo}</span>
                <span className="block text-xs text-text-muted">{r.detalhe}</span>
              </span>
            </li>
          ))}
        </ul>
        {resumo.tipo_servico ? (
          <p className="mt-3 text-[11px] text-text-muted">Regras do tipo de serviço “{resumo.tipo_servico.nome}”.</p>
        ) : (
          <p className="mt-3 text-[11px] text-text-muted">OS sem tipo de serviço: só o checklist obrigatório é exigido.</p>
        )}
      </section>

      <dl className={`grid gap-4 rounded-xl border border-border bg-panel p-4 ${campo ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"}`}>
        <Linha rotulo="Deslocamento">{duracaoEmHoras(tempos.deslocamento_min)}</Linha>
        <Linha rotulo="Atendimento">
          {duracaoEmHoras(tempos.atendimento_min)}
          {tempos.pausa_min > 0 && <span className="text-text-muted"> · pausas {duracaoEmHoras(tempos.pausa_min)}</span>}
        </Linha>
        <Linha rotulo="Checklist">
          {checklist.checklists === 0 ? (
            <span className="text-text-muted">Nenhum aplicado</span>
          ) : (
            <>
              {checklist.respondidos} de {checklist.itens} respondidos
              {checklist.pendentes > 0 && (
                <span className="text-amber-300">
                  {" "}
                  · {checklist.pendentes === 1 ? "falta 1 obrigatório" : `faltam ${checklist.pendentes} obrigatórios`}
                </span>
              )}
            </>
          )}
        </Linha>
        <Linha rotulo="Fotos">{resumo.fotos === 0 ? <span className="text-text-muted">Nenhuma</span> : resumo.fotos}</Linha>
      </dl>

      <dl className={`grid gap-4 rounded-xl border border-border bg-panel p-4 ${campo ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        <Linha rotulo="Materiais">
          {resumo.materiais.length === 0 ? (
            vazio
          ) : (
            <ul className="flex flex-col gap-0.5">
              {resumo.materiais.map((m, i) => (
                <li key={i}>
                  {m.descricao} <span className="text-text-muted">· {quantidade(m.quantidade, m.unidade)}</span>
                </li>
              ))}
            </ul>
          )}
        </Linha>
        <Linha rotulo="Serviços">
          {resumo.servicos.length === 0 ? (
            vazio
          ) : (
            <ul className="flex flex-col gap-0.5">
              {resumo.servicos.map((m, i) => (
                <li key={i}>
                  {m.descricao} <span className="text-text-muted">· {quantidade(m.quantidade, m.unidade)}</span>
                </li>
              ))}
            </ul>
          )}
        </Linha>
        <Linha rotulo="Diagnóstico">
          <span className="whitespace-pre-wrap">{atendimento.diagnostico ?? vazio}</span>
        </Linha>
        <Linha rotulo="Solução">
          <span className="whitespace-pre-wrap">{atendimento.solucao ?? vazio}</span>
        </Linha>
        <Linha rotulo="Responsável">{resumo.assinatura?.nome_responsavel ?? vazio}</Linha>
        <Linha rotulo="Assinatura">
          {resumo.assinatura ? `Colhida em ${formatarDataHora(resumo.assinatura.assinado_em)}` : <span className="text-text-muted">Não colhida</span>}
        </Linha>
      </dl>
    </div>
  );
}
