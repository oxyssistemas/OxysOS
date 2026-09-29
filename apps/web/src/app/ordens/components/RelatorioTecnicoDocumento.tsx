import type { ReactNode } from "react";
import { useUrlsAnexos } from "../abas/AnexosOrdem";
import { formatarDataHora } from "../tipos";
import {
  CAMPOS_ATENDIMENTO,
  ROTULO_MOMENTO,
  duracaoEmHoras,
  valorItemChecklist,
  type LeituraRelatorio,
  type RelatorioTecnico,
} from "../tiposExecucao";

/** Na impressão só o papel aparece (o resto da tela some). */
const CSS_IMPRESSAO = `
@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  .relatorio-impressao, .relatorio-impressao * { visibility: visible !important; }
  .relatorio-impressao { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0; box-shadow: none; border: 0; }
  .relatorio-quebra { break-inside: avoid; }
  html, body { background: #fff !important; }
}`;

function hora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function quantidade(q: number, unidade: string | null): string {
  const n = Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade ? `${n} ${unidade}` : n;
}

function endereco(e: NonNullable<RelatorioTecnico["endereco"]>): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const cidade = [e.cidade, e.estado].filter(Boolean).join("/");
  return [rua, e.complemento, e.bairro, cidade, e.cep && `CEP ${e.cep}`].filter(Boolean).join(" · ");
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="relatorio-quebra mt-6">
      <h2 className="mb-2 border-b border-slate-300 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{rotulo}</dt>
      <dd className="text-[13px] text-slate-900">{children}</dd>
    </div>
  );
}

const nada = <span className="text-slate-400">—</span>;

interface Props {
  leitura: LeituraRelatorio;
}

/** Relatório técnico da OS (§41) em formato de documento. Sem valores. */
export function RelatorioTecnicoDocumento({ leitura }: Props) {
  const r = leitura.relatorio;
  const urls = useUrlsAnexos(r.fotos.map((f) => f.caminho));
  const registros = CAMPOS_ATENDIMENTO.filter(({ campo }) => r.atendimento[campo]);

  return (
    <article className="relatorio-impressao mx-auto w-full max-w-[820px] rounded-lg bg-white p-6 text-slate-900 shadow-sm sm:p-10">
      <style>{CSS_IMPRESSAO}</style>

      <header className="flex flex-col gap-4 border-b-2 border-slate-900 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-bold">{r.empresa.nome}</p>
          <p className="text-[12px] text-slate-600">
            {[r.empresa.cnpj && `CNPJ ${r.empresa.cnpj}`, r.empresa.telefone, [r.empresa.cidade, r.empresa.estado].filter(Boolean).join("/")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Relatório técnico</p>
          <p className="text-lg font-bold">{r.os.numero ?? "OS"}</p>
          <p className="text-[12px] text-slate-600">
            {leitura.origem === "finalizacao"
              ? `Versão ${leitura.versao} · ${leitura.gerado_em ? formatarDataHora(leitura.gerado_em) : ""}`
              : "Prévia — a OS ainda não foi finalizada"}
          </p>
        </div>
      </header>

      <Secao titulo="Dados do atendimento">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Campo rotulo="Cliente">
            {r.cliente.nome}
            {r.cliente.documento && <span className="text-slate-600"> · {r.cliente.documento}</span>}
          </Campo>
          {r.cliente.telefone && <Campo rotulo="Contato">{[r.cliente.telefone, r.cliente.email].filter(Boolean).join(" · ")}</Campo>}
          <Campo rotulo="Local">
            {r.os.local_atendimento === "externo" && r.endereco
              ? `${r.endereco.rotulo ? `${r.endereco.rotulo}: ` : ""}${endereco(r.endereco)}`
              : r.os.local_atendimento === "externo"
                ? "Externo"
                : "Na loja (balcão)"}
          </Campo>
          <Campo rotulo="Equipamento">
            {r.equipamento
              ? [r.equipamento.nome, [r.equipamento.marca, r.equipamento.modelo].filter(Boolean).join(" "), r.equipamento.numero_serie && `S/N ${r.equipamento.numero_serie}`]
                  .filter(Boolean)
                  .join(" · ")
              : (r.os.objeto_atendimento ?? nada)}
          </Campo>
          <Campo rotulo="Técnico responsável">{[r.tecnico, r.equipe && `equipe ${r.equipe}`].filter(Boolean).join(" · ") || nada}</Campo>
          <Campo rotulo="Tipo de serviço">{r.os.tipo_servico ?? nada}</Campo>
          <Campo rotulo="Aberta em">{formatarDataHora(r.os.aberta_em)}</Campo>
          <Campo rotulo="Concluída em">{r.os.concluida_em ? formatarDataHora(r.os.concluida_em) : nada}</Campo>
        </dl>
      </Secao>

      <Secao titulo="Problema relatado">
        <p className="whitespace-pre-wrap text-[13px]">{r.problema}</p>
      </Secao>

      <Secao titulo="Diagnóstico e serviço realizado">
        {registros.length === 0 ? (
          <p className="text-[13px] text-slate-400">Não registrado.</p>
        ) : (
          <dl className="flex flex-col gap-2">
            {registros.map(({ campo, rotulo }) => (
              <Campo key={campo} rotulo={rotulo}>
                <span className="whitespace-pre-wrap">{r.atendimento[campo]}</span>
              </Campo>
            ))}
          </dl>
        )}
      </Secao>

      <Secao titulo="Horários">
        {r.visitas.length === 0 ? (
          <p className="text-[13px] text-slate-400">Sem visitas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Visita</th>
                  <th className="py-1 pr-3 font-medium">Técnico</th>
                  <th className="py-1 pr-3 font-medium">Saída</th>
                  <th className="py-1 pr-3 font-medium">Chegada</th>
                  <th className="py-1 pr-3 font-medium">Início</th>
                  <th className="py-1 font-medium">Término</th>
                </tr>
              </thead>
              <tbody>
                {r.visitas.map((v, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="py-1 pr-3">{new Date(v.inicio_previsto).toLocaleDateString("pt-BR")}</td>
                    <td className="py-1 pr-3">{v.tecnico ?? v.equipe ?? "—"}</td>
                    <td className="py-1 pr-3 tabular-nums">{hora(v.saida_em)}</td>
                    <td className="py-1 pr-3 tabular-nums">{hora(v.chegada_em)}</td>
                    <td className="py-1 pr-3 tabular-nums">{hora(v.inicio_atendimento_em)}</td>
                    <td className="py-1 tabular-nums">{hora(v.termino_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[12px] text-slate-600">
          Deslocamento {duracaoEmHoras(r.tempos.deslocamento_min)} · Atendimento {duracaoEmHoras(r.tempos.atendimento_min)}
          {r.tempos.pausa_min > 0 && ` · Pausas ${duracaoEmHoras(r.tempos.pausa_min)}`}
        </p>
      </Secao>

      {r.checklists.length > 0 && (
        <Secao titulo="Checklist">
          <div className="flex flex-col gap-3">
            {r.checklists.map((c, i) => (
              <div key={i}>
                <p className="mb-1 text-[12px] font-semibold">{c.nome}</p>
                <table className="w-full text-[12px]">
                  <tbody>
                    {c.itens.map((item) => (
                      <tr key={item.ordem} className="border-t border-slate-200 align-top">
                        <td className="py-1 pr-3">{item.rotulo}</td>
                        <td className="w-2/5 py-1 text-right">
                          {valorItemChecklist(item) ?? <span className="text-slate-400">Sem resposta</span>}
                          {item.fora_faixa && <span className="ml-1 font-semibold text-amber-700">(fora da faixa)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {(r.materiais.length > 0 || r.servicos.length > 0) && (
        <Secao titulo="Materiais e serviços">
          <table className="w-full text-[12px]">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Descrição</th>
                <th className="py-1 pr-3 font-medium">Tipo</th>
                <th className="py-1 text-right font-medium">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {[...r.materiais.map((m) => ({ ...m, rotuloTipo: "Material" })), ...r.servicos.map((s) => ({ ...s, rotuloTipo: "Serviço" }))].map(
                (m, i) => (
                  <tr key={i} className="border-t border-slate-200 align-top">
                    <td className="py-1 pr-3">
                      {m.descricao}
                      {m.observacao && <span className="block text-slate-500">{m.observacao}</span>}
                    </td>
                    <td className="py-1 pr-3">{m.rotuloTipo}</td>
                    <td className="py-1 text-right tabular-nums">{quantidade(m.quantidade, m.unidade)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </Secao>
      )}

      {r.fotos.length > 0 && (
        <Secao titulo="Fotos">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {r.fotos.map((f) => (
              <figure key={f.caminho} className="relatorio-quebra">
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                  {urls.get(f.caminho) ? (
                    <img src={urls.get(f.caminho)} alt={f.descricao ?? f.nome_arquivo} className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-2 text-center text-[11px] text-slate-400">Imagem indisponível</span>
                  )}
                </div>
                <figcaption className="mt-1 text-[11px] text-slate-600">
                  {[f.momento && ROTULO_MOMENTO[f.momento], f.descricao].filter(Boolean).join(" · ") || f.nome_arquivo}
                  <span className="block text-slate-400">
                    {formatarDataHora(f.enviado_em)}
                    {f.tecnico && ` · ${f.tecnico}`}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="Confirmação do cliente">
        {r.assinatura ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <img src={r.assinatura.imagem_png} alt={`Assinatura de ${r.assinatura.nome_responsavel}`} className="h-24 max-w-[280px] border-b border-slate-400 object-contain" />
            <div className="text-[12px]">
              <p className="font-semibold">{r.assinatura.nome_responsavel}</p>
              {r.assinatura.documento && <p className="text-slate-600">Documento {r.assinatura.documento}</p>}
              <p className="text-slate-600">Assinado em {formatarDataHora(r.assinatura.assinado_em)}</p>
              {r.assinatura.observacao && <p className="text-slate-600">“{r.assinatura.observacao}”</p>}
              <p className="mt-1 break-all font-mono text-[9px] text-slate-400">SHA-256 {r.assinatura.hash_sha256}</p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-slate-400">Sem assinatura do cliente.</p>
        )}
      </Secao>

      <footer className="mt-8 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
        {r.os.numero} · {leitura.origem === "finalizacao" ? `versão ${leitura.versao} congelada na finalização` : "prévia"} · Oxys OS
      </footer>
    </article>
  );
}
