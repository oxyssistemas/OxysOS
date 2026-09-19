import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Download, FileText, ImageOff, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { enviarAnexo, gerarUrlsAnexos, listarAnexos, removerAnexo, urlDownloadAnexo } from "../execucaoService";
import { formatarDataHora } from "../tipos";
import {
  ACCEPT_ANEXOS,
  MOMENTOS_FOTO,
  ROTULO_MOMENTO,
  formatarTamanho,
  validarArquivoAnexo,
  type AnexoOS,
  type MomentoFoto,
} from "../tiposExecucao";

interface AnexosOrdemProps {
  osId: string;
  lojaId: string;
  podeEditar: boolean;
}

type FiltroFotos = "todas" | MomentoFoto;

/** URLs assinadas para os caminhos informados (recalcula só quando o conjunto muda). */
export function useUrlsAnexos(caminhos: string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const chave = caminhos.join("|");
  useEffect(() => {
    let cancelado = false;
    gerarUrlsAnexos(chave ? chave.split("|") : []).then((mapa) => !cancelado && setUrls(mapa));
    return () => {
      cancelado = true;
    };
  }, [chave]);
  return urls;
}

export function MiniaturaFoto({ url, nome, className = "" }: { url: string | undefined; nome: string; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!url || falhou) {
    return (
      <div className={`flex items-center justify-center bg-black/20 text-text-muted ${className}`} title={nome}>
        <ImageOff size={18} aria-label={`Pré-visualização indisponível: ${nome}`} />
      </div>
    );
  }
  return <img src={url} alt={nome} loading="lazy" onError={() => setFalhou(true)} className={`object-cover ${className}`} />;
}

export function AnexosOrdem({ osId, lojaId, podeEditar }: AnexosOrdemProps) {
  const { notificarSucesso, notificarErro } = useToast();
  const [anexos, setAnexos] = useState<AnexoOS[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [momento, setMomento] = useState<MomentoFoto | "">("durante");
  const [envio, setEnvio] = useState<{ atual: number; total: number } | null>(null);
  const [filtro, setFiltro] = useState<FiltroFotos>("todas");
  const [remover, setRemover] = useState<AnexoOS | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const arquivosRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setAnexos(await listarAnexos(osId));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível carregar os arquivos.");
    }
  }, [osId]);

  useEffect(() => {
    setAnexos(null);
    carregar();
  }, [carregar]);

  const fotos = (anexos ?? []).filter((a) => a.tipo === "foto");
  const documentos = (anexos ?? []).filter((a) => a.tipo !== "foto");
  const fotosFiltradas = filtro === "todas" ? fotos : fotos.filter((f) => f.momento === filtro);
  const urls = useUrlsAnexos(fotos.map((f) => f.caminho));

  async function enviar(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length === 0 || envio) return;
    if (arquivos.length > 10) {
      notificarErro("Envie até 10 arquivos por vez.");
      return;
    }
    let enviados = 0;
    const falhas: string[] = [];
    for (const [i, arquivo] of arquivos.entries()) {
      setEnvio({ atual: i + 1, total: arquivos.length });
      const invalido = validarArquivoAnexo(arquivo);
      if (invalido) {
        falhas.push(`${arquivo.name}: ${invalido}`);
        continue;
      }
      try {
        await enviarAnexo({ lojaId, osId, arquivo, momento: momento || null });
        enviados++;
      } catch (err) {
        falhas.push(`${arquivo.name}: ${err instanceof Error ? err.message : "falha no envio."}`);
      }
    }
    setEnvio(null);
    if (arquivosRef.current) arquivosRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    if (enviados > 0) notificarSucesso(enviados === 1 ? "Arquivo anexado." : `${enviados} arquivos anexados.`);
    if (falhas.length > 0) notificarErro(falhas.slice(0, 3).join(" "));
    if (enviados > 0) await carregar();
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    setRemovendo(true);
    try {
      await removerAnexo(remover.id);
      notificarSucesso("Arquivo removido. O registro continua no histórico da OS.");
      setRemover(null);
      await carregar();
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível remover o arquivo.");
    } finally {
      setRemovendo(false);
    }
  }

  async function baixar(anexo: AnexoOS) {
    setBaixando(anexo.id);
    try {
      window.location.assign(await urlDownloadAnexo(anexo.caminho, anexo.nome_arquivo));
    } catch (err) {
      notificarErro(err instanceof Error ? err.message : "Não foi possível baixar o arquivo.");
    } finally {
      setBaixando(null);
    }
  }

  if (erro) {
    return (
      <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
        {erro}{" "}
        <button onClick={carregar} className="font-medium text-accent hover:underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {podeEditar && (
        <section className="rounded-xl border border-border bg-panel p-4" aria-label="Enviar arquivos">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1.5 text-xs text-text-muted" htmlFor="momento-foto">
              Momento das fotos
              <select
                id="momento-foto"
                value={momento}
                onChange={(e) => setMomento(e.target.value as MomentoFoto | "")}
                className="rounded-lg border border-border bg-base px-3 py-2 text-sm text-text-primary focus:border-accent"
              >
                {MOMENTOS_FOTO.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
                <option value="">Não informar</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={envio !== null}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-50 sm:hidden"
              >
                <Camera size={16} aria-hidden="true" /> Tirar foto
              </button>
              <button
                type="button"
                onClick={() => arquivosRef.current?.click()}
                disabled={envio !== null}
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {envio ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
                {envio ? `Enviando ${envio.atual} de ${envio.total}…` : "Enviar arquivos"}
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => enviar(e.target.files)} />
            <input ref={arquivosRef} type="file" multiple accept={ACCEPT_ANEXOS} className="hidden" onChange={(e) => enviar(e.target.files)} />
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Fotos JPG, PNG, WEBP ou HEIC até 10 MB · documentos PDF, Word, Excel, TXT ou CSV até 20 MB · até 10 por envio.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-border bg-panel p-5" aria-labelledby="titulo-fotos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-fotos" className="font-display text-sm font-semibold text-text-primary">
            Fotos {anexos && <span className="font-normal text-text-muted">({fotos.length})</span>}
          </h2>
          {fotos.length > 0 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar fotos por momento">
              {(["todas", ...MOMENTOS_FOTO.map((m) => m.valor)] as FiltroFotos[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  aria-pressed={filtro === f}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    filtro === f ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-white/5"
                  }`}
                >
                  {f === "todas" ? "Todas" : ROTULO_MOMENTO[f]}
                </button>
              ))}
            </div>
          )}
        </div>
        {anexos === null ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : fotosFiltradas.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            {fotos.length === 0 ? "Nenhuma foto anexada." : "Nenhuma foto neste momento."}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotosFiltradas.map((foto) => (
              <li key={foto.id} className="group overflow-hidden rounded-lg border border-border bg-base">
                <a
                  href={urls.get(foto.caminho)}
                  target="_blank"
                  rel="noreferrer"
                  className="block aspect-square"
                  aria-label={`Abrir foto ${foto.nome_arquivo}`}
                >
                  <MiniaturaFoto url={urls.get(foto.caminho)} nome={foto.nome_arquivo} className="h-full w-full" />
                </a>
                <div className="flex items-start justify-between gap-2 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-text-primary" title={foto.nome_arquivo}>
                      {foto.momento ? `${ROTULO_MOMENTO[foto.momento]} · ` : ""}
                      {formatarDataHora(foto.criado_em)}
                    </p>
                    <p className="truncate text-xs text-text-muted">{foto.enviado_por ?? "—"}</p>
                  </div>
                  {podeEditar && (
                    <button
                      onClick={() => setRemover(foto)}
                      className="rounded p-1 text-text-muted hover:bg-white/5 hover:text-danger"
                      aria-label={`Remover foto ${foto.nome_arquivo}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-panel p-5" aria-labelledby="titulo-documentos">
        <h2 id="titulo-documentos" className="font-display text-sm font-semibold text-text-primary">
          Documentos {anexos && <span className="font-normal text-text-muted">({documentos.length})</span>}
        </h2>
        {anexos === null ? (
          <div className="mt-4 h-10 animate-pulse rounded-lg bg-white/5" aria-hidden="true" />
        ) : documentos.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">Nenhum documento anexado.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {documentos.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-2.5">
                <FileText size={18} className="shrink-0 text-text-muted" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary" title={doc.nome_arquivo}>
                    {doc.nome_arquivo}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {formatarTamanho(doc.tamanho_bytes)} · {doc.enviado_por ?? "—"} · {formatarDataHora(doc.criado_em)}
                  </p>
                </div>
                <button
                  onClick={() => baixar(doc)}
                  disabled={baixando === doc.id}
                  className="rounded-lg p-2 text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-50"
                  aria-label={`Baixar ${doc.nome_arquivo}`}
                >
                  {baixando === doc.id ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                </button>
                {podeEditar && (
                  <button
                    onClick={() => setRemover(doc)}
                    className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-danger"
                    aria-label={`Remover ${doc.nome_arquivo}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {anexos !== null && !podeEditar && (
        <p className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <Paperclip size={14} aria-hidden="true" /> Você pode visualizar e baixar os arquivos, mas não anexar nem remover.
        </p>
      )}

      <ConfirmDialog
        aberto={remover !== null}
        titulo="Remover arquivo?"
        descricao={
          <>
            <span className="font-medium text-text-primary">{remover?.nome_arquivo}</span> deixará de aparecer na OS. A remoção fica
            registrada na linha do tempo.
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
