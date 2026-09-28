import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, ClipboardList, Loader2, PenLine, RefreshCw } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { AssinaturaDialog } from "@/components/AssinaturaDialog";
import { TelaCarregando } from "@/components/TelaCarregando";
import {
  enviarAnexo,
  gerarUrlsAnexos,
  responderItem,
  type ValorRespostaChecklist,
} from "@/app/ordens/execucaoService";
import {
  FORMATOS_FOTO,
  arquivoDeDataUrl,
  ehFotoArquivo,
  faixaEsperada,
  validarArquivoAnexo,
  type ChecklistOS,
  type ItemChecklistOS,
} from "@/app/ordens/tiposExecucao";
import { ehErroRede } from "@/lib/erros";
import { useTecnico } from "../TecnicoContext";
import { listarChecklistsCampo, obterAtendimento } from "../tecnicoService";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { enfileirarChecklist } from "../offline/fila";

const campo =
  "min-h-[48px] w-full rounded-lg border border-border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-60";

interface ItemProps {
  item: ItemChecklistOS;
  url: string | undefined;
  podeResponder: boolean;
  salvando: boolean;
  onResponder: (valor: ValorRespostaChecklist) => void;
  onEnviarImagem: (arquivo: File) => void;
}

/** Um item do checklist no celular: alvo grande e o controle certo por tipo. */
function ItemCampo({ item, url, podeResponder, salvando, onResponder, onEnviarImagem }: ItemProps) {
  const id = `item-${item.id}`;
  const [texto, setTexto] = useState(item.valor_texto ?? "");
  const [numero, setNumero] = useState(item.valor_numero != null ? String(item.valor_numero) : "");
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [assinando, setAssinando] = useState(false);

  useEffect(() => {
    setTexto(item.valor_texto ?? "");
    setNumero(item.valor_numero != null ? String(item.valor_numero) : "");
  }, [item.valor_texto, item.valor_numero]);

  const bloqueado = !podeResponder || salvando;
  const assinatura = item.tipo === "assinatura";
  const faixa = item.tipo === "medicao" ? faixaEsperada(item) : null;

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

  let controle: ReactNode = null;
  switch (item.tipo) {
    case "texto":
      controle = (
        <textarea
          id={id}
          value={texto}
          rows={3}
          maxLength={2000}
          disabled={bloqueado}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => texto.trim() !== (item.valor_texto ?? "") && onResponder(texto.trim() || null)}
          className={`${campo} py-2`}
        />
      );
      break;
    case "numero":
    case "medicao":
      controle = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={numero}
            disabled={bloqueado}
            onChange={(e) => setNumero(e.target.value)}
            onBlur={salvarNumero}
            className={`${campo} max-w-[10rem]`}
          />
          {item.unidade && <span className="text-sm text-text-secondary">{item.unidade}</span>}
        </div>
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
          className={campo}
        />
      );
      break;
    case "hora":
      controle = (
        <input
          id={id}
          type="time"
          value={item.valor_hora ? item.valor_hora.slice(0, 5) : ""}
          disabled={bloqueado}
          onChange={(e) => onResponder(e.target.value || null)}
          className={campo}
        />
      );
      break;
    case "selecao":
      controle = (
        <div className="flex flex-col gap-2">
          {item.opcoes.map((o) => (
            <button
              key={o}
              type="button"
              disabled={bloqueado}
              aria-pressed={item.valor_opcao === o}
              onClick={() => onResponder(item.valor_opcao === o ? null : o)}
              className={`min-h-[44px] rounded-lg border px-3 text-left text-sm font-medium disabled:opacity-60 ${
                item.valor_opcao === o ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      );
      break;
    case "foto":
    case "assinatura":
      controle = (
        <div className="flex flex-col gap-2">
          {item.anexo && url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className={`block overflow-hidden rounded-lg border border-border ${assinatura ? "bg-white p-2" : ""}`}
            >
              <img
                src={url}
                alt={assinatura ? `Assinatura: ${item.rotulo}` : item.anexo.nome_arquivo}
                className={`h-40 w-full ${assinatura ? "object-contain" : "object-cover"}`}
              />
            </a>
          )}
          {podeResponder && (
            <>
              <button
                type="button"
                disabled={bloqueado}
                onClick={() => (assinatura ? setAssinando(true) : arquivoRef.current?.click())}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-text-secondary disabled:opacity-60"
              >
                {salvando ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : assinatura ? (
                  <PenLine size={16} aria-hidden="true" />
                ) : (
                  <Camera size={16} aria-hidden="true" />
                )}
                {assinatura ? (item.anexo ? "Assinar de novo" : "Assinar na tela") : item.anexo ? "Trocar foto" : "Tirar ou enviar foto"}
              </button>
              <input
                ref={arquivoRef}
                type="file"
                accept={[...FORMATOS_FOTO, ".heic", ".heif"].join(",")}
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = "";
                  if (arquivo) onEnviarImagem(arquivo);
                }}
              />
            </>
          )}
          {!podeResponder && !item.anexo && (
            <span className="text-sm text-text-muted">{assinatura ? "Sem assinatura" : "Sem foto"}</span>
          )}
          {assinatura && (
            <AssinaturaDialog
              aberto={assinando}
              titulo={item.rotulo}
              onCancelar={() => setAssinando(false)}
              onConfirmar={(png) => {
                setAssinando(false);
                onEnviarImagem(arquivoDeDataUrl(png, `assinatura-${Date.now()}.png`));
              }}
            />
          )}
        </div>
      );
      break;
  }

  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        {item.tipo === "checkbox" ? (
          <input
            id={id}
            type="checkbox"
            checked={item.valor_booleano === true}
            disabled={bloqueado}
            onChange={(e) => onResponder(e.target.checked ? true : null)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#1565FF]"
          />
        ) : (
          <span
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              item.respondido ? "bg-success" : item.obrigatorio ? "bg-amber-400" : "bg-white/15"
            }`}
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-sm text-text-primary">
            {item.rotulo}
            {item.obrigatorio && (
              <span className="ml-1 text-danger" aria-label="obrigatório">
                *
              </span>
            )}
          </label>
          {item.ajuda && <p className="text-xs text-text-muted">{item.ajuda}</p>}
          {faixa && <p className="text-xs text-text-muted">Esperado: {faixa}</p>}
          {controle && <div className="mt-2">{controle}</div>}
          {item.fora_faixa && (
            <p className="mt-1 flex items-center gap-1 text-xs text-amber-300">
              <AlertTriangle size={12} aria-hidden="true" /> Fora da faixa esperada.
            </p>
          )}
          {salvando && !item.anexo && <Loader2 size={12} className="mt-1 animate-spin text-text-muted" aria-label="Salvando" />}
        </div>
      </div>
    </li>
  );
}

/** Checklists da OS do atendimento, preenchidos em campo (§27 a §29). */
export function ChecklistAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { dados, pode } = useTecnico();
  const { notificarSucesso, notificarErro } = useToast();
  const { ativo: offlineAtivo } = useSincronizacao();
  const [osId, setOsId] = useState<string | null>(null);
  const [osNumero, setOsNumero] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<ChecklistOS[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoItem, setSalvandoItem] = useState<string | null>(null);

  const lojaId = dados?.empresa?.id ?? "";
  const podeResponder = pode("checklists.fill");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const atendimento = await obterAtendimento(id);
      setOsId(atendimento.os.id);
      setOsNumero(atendimento.os.numero);
      const lista = await listarChecklistsCampo(atendimento.os.id);
      setChecklists(lista);
      const caminhos = lista.flatMap((c) => c.itens.map((i) => i.anexo?.caminho).filter((x): x is string => !!x));
      setUrls(caminhos.length > 0 ? await gerarUrlsAnexos(Array.from(new Set(caminhos))) : new Map());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o checklist.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function responder(item: ItemChecklistOS, valor: ValorRespostaChecklist) {
    setSalvandoItem(item.id);
    // sem internet (plano com modo offline): guarda no aparelho e envia quando voltar
    const guardar = () => (osId ? enfileirarChecklist({ osId, item, valor, osNumero }) : Promise.resolve());
    try {
      if (offlineAtivo && !navigator.onLine) {
        await guardar();
      } else {
        const r = await responderItem(item.id, valor);
        if (r.checklist_completo) notificarSucesso("Checklist completo.");
      }
      await carregar();
    } catch (e) {
      if (offlineAtivo && ehErroRede(e)) {
        await guardar();
        notificarSucesso("Sem internet: resposta guardada no aparelho.");
      } else {
        notificarErro(e instanceof Error ? e.message : "Não foi possível salvar a resposta.");
      }
      await carregar();
    } finally {
      setSalvandoItem(null);
    }
  }

  async function enviarImagem(item: ItemChecklistOS, arquivo: File) {
    const invalido = validarArquivoAnexo(arquivo);
    if (invalido || !ehFotoArquivo(arquivo)) {
      notificarErro(invalido ?? "Envie uma imagem.");
      return;
    }
    if (!osId || !lojaId) return;
    if (!navigator.onLine) {
      notificarErro("Sem internet: fotos e assinaturas do checklist precisam de conexão.");
      return;
    }
    setSalvandoItem(item.id);
    try {
      const anexoId = await enviarAnexo({ lojaId, osId, arquivo, momento: "durante", descricao: item.rotulo });
      await responderItem(item.id, anexoId);
      notificarSucesso("Imagem anexada.");
      await carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
      await carregar();
    } finally {
      setSalvandoItem(null);
    }
  }

  if (!checklists && !erro) return <TelaCarregando />;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>

      <h1 className="font-display text-xl font-semibold text-text-primary">Checklist</h1>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {checklists?.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <ClipboardList size={20} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Nenhum checklist aplicado nesta OS.</p>
          <p className="text-xs text-text-muted">A empresa aplica o modelo pelo portal antes do atendimento.</p>
        </div>
      )}

      {checklists?.map((c) => {
        const visiveis = c.itens.filter((i) => i.visivel);
        const respondidos = visiveis.filter((i) => i.respondido).length;
        const pct = visiveis.length ? Math.round((respondidos / visiveis.length) * 100) : 0;
        return (
          <section key={c.id} className="rounded-xl border border-border bg-panel p-4" aria-labelledby={`chk-${c.id}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 id={`chk-${c.id}`} className="flex items-center gap-2 font-display text-sm font-semibold text-text-primary">
                {c.nome}
                {pct === 100 && <CheckCircle2 size={15} className="text-success" aria-label="Completo" />}
              </h2>
              <span className="shrink-0 text-xs text-text-muted">
                {respondidos}/{visiveis.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${pct === 100 ? "bg-success" : "bg-accent"}`} style={{ width: `${pct}%` }} />
            </div>
            {c.pendentes > 0 && (
              <p className="mt-2 text-xs text-amber-300">
                {c.pendentes} obrigatório{c.pendentes > 1 ? "s" : ""} pendente{c.pendentes > 1 ? "s" : ""} para finalizar.
              </p>
            )}
            <ul className="mt-1">
              {visiveis.map((item) => (
                <ItemCampo
                  key={item.id}
                  item={item}
                  url={item.anexo ? urls.get(item.anexo.caminho) : undefined}
                  podeResponder={podeResponder}
                  salvando={salvandoItem === item.id}
                  onResponder={(valor) => responder(item, valor)}
                  onEnviarImagem={(arquivo) => enviarImagem(item, arquivo)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {!podeResponder && (checklists?.length ?? 0) > 0 && (
        <p className="text-center text-[11px] text-text-muted">Seu cargo não permite responder o checklist.</p>
      )}
    </div>
  );
}
