import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Camera, CheckCircle2, ClipboardList, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCompany } from "../../context/CompanyContext";
import {
  aplicarChecklist,
  enviarAnexo,
  listarAnexos,
  listarChecklistsOS,
  listarModelosChecklist,
  removerChecklist,
  responderItem,
  type ValorRespostaChecklist,
} from "../execucaoService";
import { formatarDataHora, type OrdemDetalhe } from "../tipos";
import { FORMATOS_FOTO, ROTULO_MOMENTO, ehFotoArquivo, validarArquivoAnexo, type AnexoOS, type ChecklistOS, type ItemChecklistOS, type ModeloChecklist } from "../tiposExecucao";
import { MiniaturaFoto, useUrlsAnexos } from "./AnexosOrdem";

interface ChecklistOrdemProps {
  ordem: OrdemDetalhe;
  lojaId: string;
  /** edição liberada (permissão e OS não encerrada) */
  podeEditar: boolean;
  encerrada: boolean;
}

const campo =
  "w-full rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent disabled:opacity-60";

interface ItemProps {
  item: ItemChecklistOS;
  podeEditar: boolean;
  fotos: AnexoOS[];
  urls: Map<string, string>;
  salvando: boolean;
  onResponder: (valor: ValorRespostaChecklist) => void;
  onEnviarFoto: (arquivo: File) => void;
}

function ItemChecklist({ item, podeEditar, fotos, urls, salvando, onResponder, onEnviarFoto }: ItemProps) {
  const id = `item-${item.id}`;
  const [texto, setTexto] = useState(item.valor_texto ?? "");
  const [numero, setNumero] = useState(item.valor_numero != null ? String(item.valor_numero) : "");
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto(item.valor_texto ?? "");
    setNumero(item.valor_numero != null ? String(item.valor_numero) : "");
  }, [item.valor_texto, item.valor_numero]);

  const bloqueado = !podeEditar || salvando;

  function salvarTexto() {
    const limpo = texto.trim();
    if (limpo === (item.valor_texto ?? "")) return;
    onResponder(limpo || null);
  }

  function salvarNumero() {
    const bruto = numero.trim().replace(",", ".");
    const atual = item.valor_numero != null ? String(item.valor_numero) : "";
    if (bruto === atual) return;
    if (bruto === "") return onResponder(null);
    const n = Number(bruto);
    if (!Number.isFinite(n)) {
      setNumero(atual);
      return;
    }
    onResponder(n);
  }

  const rotulo = (
    <span className="text-sm text-text-primary">
      {item.rotulo}
      {item.obrigatorio && (
        <span className="ml-1 text-danger" aria-label="obrigatório">
          *
        </span>
      )}
    </span>
  );

  let controle: ReactNode;
  switch (item.tipo) {
    case "checkbox":
      controle = null;
      break;
    case "texto":
      controle = (
        <textarea
          id={id}
          value={texto}
          maxLength={2000}
          rows={2}
          disabled={bloqueado}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvarTexto}
          className={`${campo} resize-y`}
        />
      );
      break;
    case "numero":
      controle = (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={numero}
          disabled={bloqueado}
          onChange={(e) => setNumero(e.target.value)}
          onBlur={salvarNumero}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className={`${campo} sm:max-w-[12rem]`}
        />
      );
      break;
    case "data":
      controle = (
        <input
          id={id}
          type="date"
          value={item.valor_data ?? ""}
          disabled={bloqueado}
          onChange={(e) => onResponder(e.target.value || null)}
          className={`${campo} sm:max-w-[12rem]`}
        />
      );
      break;
    case "selecao":
      controle = (
        <select id={id} value={item.valor_opcao ?? ""} disabled={bloqueado} onChange={(e) => onResponder(e.target.value || null)} className={`${campo} sm:max-w-xs`}>
          <option value="">Selecione…</option>
          {item.opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case "foto":
      controle = (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {item.anexo && (
            <a
              href={urls.get(item.anexo.caminho)}
              target="_blank"
              rel="noreferrer"
              className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border"
              aria-label={`Abrir foto ${item.anexo.nome_arquivo}`}
            >
              <MiniaturaFoto url={urls.get(item.anexo.caminho)} nome={item.anexo.nome_arquivo} className="h-full w-full" />
            </a>
          )}
          {podeEditar && (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <select
                id={id}
                value={item.anexo?.id ?? ""}
                disabled={bloqueado}
                onChange={(e) => onResponder(e.target.value || null)}
                className={`${campo} sm:max-w-xs`}
              >
                <option value="">{fotos.length === 0 ? "Nenhuma foto na OS" : "Escolher foto da OS…"}</option>
                {fotos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.momento ? `${ROTULO_MOMENTO[f.momento]} · ` : ""}
                    {f.nome_arquivo} ({formatarDataHora(f.criado_em)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={bloqueado}
                onClick={() => fotoRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-50"
              >
                <Camera size={16} aria-hidden="true" /> Enviar foto
              </button>
              <input
                ref={fotoRef}
                type="file"
                accept={[...FORMATOS_FOTO, ".heic", ".heif"].join(",")}
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = "";
                  if (arquivo) onEnviarFoto(arquivo);
                }}
              />
            </div>
          )}
          {!podeEditar && !item.anexo && <span className="text-sm text-text-muted">Sem foto</span>}
        </div>
      );
      break;
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start gap-3">
        {item.tipo === "checkbox" ? (
          <input
            id={id}
            type="checkbox"
            checked={item.valor_booleano === true}
            disabled={bloqueado}
            onChange={(e) => onResponder(e.target.checked ? true : null)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#1565FF]"
          />
        ) : (
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.respondido ? "bg-success" : item.obrigatorio ? "bg-warning" : "bg-white/15"}`}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block">
            {rotulo}
          </label>
          {item.ajuda && <p className="text-xs text-text-muted">{item.ajuda}</p>}
          {controle && <div className="mt-2">{controle}</div>}
          {item.respondido_em && (
            <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
              {salvando && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              {item.respondido ? "Respondido" : "Alterado"} por {item.respondido_por ?? "—"} em {formatarDataHora(item.respondido_em)}
            </p>
          )}
          {!item.respondido_em && salvando && <Loader2 size={12} className="mt-1 animate-spin text-text-muted" aria-label="Salvando" />}
          {item.anexo?.removido && <p className="mt-1 text-xs text-warning">A foto vinculada foi removida dos arquivos da OS.</p>}
        </div>
      </div>
    </li>
  );
}

export function ChecklistOrdem({ ordem, lojaId, podeEditar, encerrada }: ChecklistOrdemProps) {
  const { can } = useCompany();
  const { notificarSucesso, notificarErro } = useToast();
  const [checklists, setChecklists] = useState<ChecklistOS[] | null>(null);
  const [modelos, setModelos] = useState<ModeloChecklist[]>([]);
  const [fotos, setFotos] = useState<AnexoOS[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [modeloEscolhido, setModeloEscolhido] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [salvandoItem, setSalvandoItem] = useState<string | null>(null);
  const [remover, setRemover] = useState<ChecklistOS | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [lista, anexos] = await Promise.all([listarChecklistsOS(ordem.id), listarAnexos(ordem.id)]);
      setChecklists(lista);
      setFotos(anexos.filter((a) => a.tipo === "foto"));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar os checklists.");
    }
  }, [ordem.id]);

  useEffect(() => {
    setChecklists(null);
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!podeEditar) return;
    listarModelosChecklist()
      .then((m) => setModelos(m.filter((x) => x.ativo)))
      .catch(() => setModelos([]));
  }, [podeEditar]);

  const caminhosFotos = [
    ...fotos.map((f) => f.caminho),
    ...(checklists ?? []).flatMap((c) => c.itens.map((i) => i.anexo?.caminho).filter((x): x is string => !!x)),
  ];
  const urls = useUrlsAnexos(Array.from(new Set(caminhosFotos)));

  const aplicados = new Set((checklists ?? []).map((c) => c.modelo_id));
  const disponiveis = modelos
    .filter((m) => !aplicados.has(m.id))
    .sort((a, b) => {
      const sa = a.tipo_servico?.id === ordem.tipo_servico?.id && !!ordem.tipo_servico ? 0 : a.tipo_servico ? 2 : 1;
      const sb = b.tipo_servico?.id === ordem.tipo_servico?.id && !!ordem.tipo_servico ? 0 : b.tipo_servico ? 2 : 1;
      return sa - sb || a.nome.localeCompare(b.nome, "pt-BR");
    });
  const sugerido = (m: ModeloChecklist) => !!ordem.tipo_servico && m.tipo_servico?.id === ordem.tipo_servico.id;

  async function aplicar() {
    if (!modeloEscolhido || aplicando) return;
    setAplicando(true);
    try {
      await aplicarChecklist(ordem.id, modeloEscolhido);
      notificarSucesso("Checklist aplicado.");
      setModeloEscolhido("");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível aplicar o checklist.");
    } finally {
      setAplicando(false);
    }
  }

  async function responder(item: ItemChecklistOS, valor: ValorRespostaChecklist) {
    setSalvandoItem(item.id);
    try {
      const r = await responderItem(item.id, valor);
      if (r.checklist_completo) {
        const checklist = checklists?.find((c) => c.itens.some((i) => i.id === item.id));
        const estavaCompleto = checklist?.itens.every((i) => i.respondido);
        if (!estavaCompleto) notificarSucesso("Checklist completo.");
      }
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível salvar a resposta.");
      // devolve os controles ao valor salvo
      await carregar();
    } finally {
      setSalvandoItem(null);
    }
  }

  async function enviarFoto(item: ItemChecklistOS, arquivo: File) {
    const invalido = validarArquivoAnexo(arquivo);
    if (invalido || !ehFotoArquivo(arquivo)) {
      notificarErro(invalido ?? "Envie uma foto.");
      return;
    }
    setSalvandoItem(item.id);
    try {
      const anexoId = await enviarAnexo({ lojaId, osId: ordem.id, arquivo, momento: "durante", descricao: item.rotulo });
      await responderItem(item.id, anexoId);
      notificarSucesso("Foto anexada ao item.");
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
      await carregar();
    } finally {
      setSalvandoItem(null);
    }
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    setRemovendo(true);
    try {
      await removerChecklist(remover.id);
      notificarSucesso("Checklist removido.");
      setRemover(null);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível remover o checklist.");
    } finally {
      setRemovendo(false);
    }
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
        {erro}{" "}
        <button onClick={carregar} className="font-medium text-accent hover:underline">
          Tentar novamente
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {encerrada && (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-panel px-4 py-3 text-sm text-text-secondary">
          <Lock size={16} aria-hidden="true" /> OS encerrada: os checklists ficam somente para consulta. Reabra a OS para alterar.
        </p>
      )}

      {podeEditar && (
        <section className="rounded-xl border border-border bg-panel p-4" aria-label="Aplicar checklist">
          {modelos.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nenhum modelo de checklist ativo.{" "}
              {can("settings.manage") ? (
                <Link to="/app/settings/checklists" className="font-medium text-accent hover:underline">
                  Criar modelo
                </Link>
              ) : (
                "Peça a um gestor para criar modelos em Configurações."
              )}
            </p>
          ) : disponiveis.length === 0 ? (
            <p className="text-sm text-text-secondary">Todos os modelos ativos já foram aplicados nesta OS.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label htmlFor="modelo-checklist" className="flex flex-1 flex-col gap-1.5 text-xs text-text-muted">
                Aplicar modelo
                <select id="modelo-checklist" value={modeloEscolhido} onChange={(e) => setModeloEscolhido(e.target.value)} className={campo}>
                  <option value="">Selecione um modelo…</option>
                  {disponiveis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} ({m.itens.length} {m.itens.length === 1 ? "item" : "itens"}){sugerido(m) ? " · sugerido para este tipo de serviço" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={aplicar}
                disabled={!modeloEscolhido || aplicando}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {aplicando ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                Aplicar
              </button>
            </div>
          )}
        </section>
      )}

      {checklists === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
      ) : checklists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-panel/50 px-4 py-12 text-center">
          <ClipboardList size={22} className="mx-auto text-text-muted" aria-hidden="true" />
          <p className="mt-2 font-display text-sm font-medium text-text-primary">Nenhum checklist nesta OS</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
            {podeEditar ? "Aplique um modelo para registrar as verificações do atendimento." : "Nenhuma verificação foi registrada."}
          </p>
        </div>
      ) : (
        checklists.map((c) => {
          const respondidos = c.itens.filter((i) => i.respondido).length;
          const pendentesObrigatorios = c.itens.filter((i) => i.obrigatorio && !i.respondido).length;
          const semRespostas = c.itens.every((i) => !i.respondido_em);
          const pct = c.itens.length ? Math.round((respondidos / c.itens.length) * 100) : 0;
          return (
            <section key={c.id} className="rounded-xl border border-border bg-panel p-5" aria-labelledby={`checklist-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={`checklist-${c.id}`} className="flex items-center gap-2 font-display text-sm font-semibold text-text-primary">
                    {c.nome}
                    {respondidos === c.itens.length && <CheckCircle2 size={16} className="text-success" aria-label="Completo" />}
                  </h2>
                  <p className="text-xs text-text-muted">
                    Aplicado por {c.aplicado_por ?? "—"} em {formatarDataHora(c.aplicado_em)}
                  </p>
                </div>
                {podeEditar && semRespostas && (
                  <button
                    onClick={() => setRemover(c)}
                    className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-danger"
                    aria-label={`Remover checklist ${c.nome}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>
                    {respondidos} de {c.itens.length} respondidos
                  </span>
                  {pendentesObrigatorios > 0 && (
                    <span className="text-warning">
                      {pendentesObrigatorios} obrigatório{pendentesObrigatorios > 1 ? "s" : ""} pendente{pendentesObrigatorios > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progresso do checklist ${c.nome}`}
                >
                  <div className={`h-full rounded-full ${pct === 100 ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <ul className="mt-2 divide-y divide-border">
                {c.itens.map((item) => (
                  <ItemChecklist
                    key={item.id}
                    item={item}
                    podeEditar={podeEditar}
                    fotos={fotos}
                    urls={urls}
                    salvando={salvandoItem === item.id}
                    onResponder={(valor) => responder(item, valor)}
                    onEnviarFoto={(arquivo) => enviarFoto(item, arquivo)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <ConfirmDialog
        aberto={remover !== null}
        titulo="Remover checklist?"
        descricao={
          <>
            O checklist <span className="font-medium text-text-primary">{remover?.nome}</span> ainda não tem respostas e será retirado desta OS.
          </>
        }
        textoConfirmar="Remover"
        tom="perigo"
        processando={removendo}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}
