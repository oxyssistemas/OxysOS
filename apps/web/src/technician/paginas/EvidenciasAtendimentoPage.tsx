import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Camera, CloudOff, ImageOff, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@oxys/shared/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TelaCarregando } from "@/components/TelaCarregando";
import { enviarAnexo, gerarUrlsAnexos, removerAnexo } from "@/app/ordens/execucaoService";
import { ehErroRede } from "@/lib/erros";
import { comprimirImagem } from "@/lib/imagem";
import {
  FORMATOS_FOTO,
  MOMENTOS_FOTO,
  ROTULO_MOMENTO,
  ehFotoArquivo,
  formatarTamanho,
  validarArquivoAnexo,
  type AnexoOS,
  type MomentoFoto,
} from "@/app/ordens/tiposExecucao";
import { useTecnico } from "../TecnicoContext";
import { listarFotosCampo, obterAtendimento } from "../tecnicoService";
import { useSincronizacao } from "../offline/SincronizacaoContext";
import { enfileirarFoto, fotosPendentes, type OpFoto } from "../offline/fila";

const ACEITA_FOTO = [...FORMATOS_FOTO, ".heic", ".heif"].join(",");

function hora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Miniatura({ url, nome }: { url: string | undefined; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  if (!url || falhou) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/20 text-text-muted">
        <ImageOff size={18} aria-label={`Sem pré-visualização: ${nome}`} />
      </div>
    );
  }
  return <img src={url} alt={nome} loading="lazy" onError={() => setFalhou(true)} className="h-full w-full object-cover" />;
}

/** Fotos e evidências do atendimento, tiradas na hora pelo técnico (§31 a §33). */
export function EvidenciasAtendimentoPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { dados, pode } = useTecnico();
  const { notificarSucesso, notificarErro } = useToast();
  const { ativo: offlineAtivo, fila } = useSincronizacao();
  const [osId, setOsId] = useState<string | null>(null);
  const [osNumero, setOsNumero] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<{ op: OpFoto; url: string }[]>([]);
  const [fotos, setFotos] = useState<AnexoOS[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<MomentoFoto>("durante");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [remover, setRemover] = useState<AnexoOS | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const lojaId = dados?.empresa?.id ?? "";
  const podeEnviar = pode("attachments.upload");

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const atendimento = await obterAtendimento(id);
      setOsId(atendimento.os.id);
      setOsNumero(atendimento.os.numero);
      const lista = await listarFotosCampo(atendimento.os.id);
      setFotos(lista);
      setUrls(lista.length > 0 ? await gerarUrlsAnexos(lista.map((f) => f.caminho)) : new Map());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as evidências.");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // fotos tiradas sem internet: aparecem aqui até subirem (e a lista recarrega quando sobem)
  const qtdFotosNaFila = fila.filter((o) => o.tipo === "foto" && o.osId === osId).length;
  const qtdAnterior = useRef<number | null>(null);
  useEffect(() => {
    if (!osId) return;
    // alguma subiu: recarrega a lista do servidor
    if (qtdAnterior.current !== null && qtdFotosNaFila < qtdAnterior.current && navigator.onLine) carregar();
    qtdAnterior.current = qtdFotosNaFila;
    let vivo = true;
    let criadas: string[] = [];
    fotosPendentes(osId).then((ops) => {
      if (!vivo) return;
      criadas = ops.map((op) => URL.createObjectURL(op.arquivo));
      setPendentes(ops.map((op, i) => ({ op, url: criadas[i] })));
    });
    return () => {
      vivo = false;
      criadas.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [osId, qtdFotosNaFila, carregar]);

  async function guardarNoAparelho(arquivo: File) {
    if (!osId) return;
    const { arquivo: reduzido } = await comprimirImagem(arquivo);
    await enfileirarFoto({
      osId,
      lojaId,
      momento: categoria,
      descricao,
      nome: reduzido.name,
      mime: reduzido.type || "image/jpeg",
      arquivo: reduzido,
      osNumero,
      rotulo: `Foto · ${ROTULO_MOMENTO[categoria]}`,
    });
  }

  async function enviar(lista: FileList | null) {
    const arquivos = Array.from(lista ?? []);
    if (arquivos.length === 0 || enviando || !osId || !lojaId) return;
    setEnviando(true);
    let enviados = 0;
    let guardadas = 0;
    const falhas: string[] = [];
    for (const arquivo of arquivos.slice(0, 10)) {
      const invalido = validarArquivoAnexo(arquivo);
      if (invalido || !ehFotoArquivo(arquivo)) {
        falhas.push(invalido ?? "Envie uma foto.");
        continue;
      }
      try {
        if (offlineAtivo && !navigator.onLine) {
          await guardarNoAparelho(arquivo);
          guardadas++;
        } else {
          await enviarAnexo({ lojaId, osId, arquivo, momento: categoria, descricao });
          enviados++;
        }
      } catch (e) {
        if (offlineAtivo && ehErroRede(e)) {
          await guardarNoAparelho(arquivo);
          guardadas++;
        } else {
          falhas.push(e instanceof Error ? e.message : "falha no envio.");
        }
      }
    }
    if (cameraRef.current) cameraRef.current.value = "";
    if (galeriaRef.current) galeriaRef.current.value = "";
    setEnviando(false);
    if (enviados > 0) {
      notificarSucesso(enviados === 1 ? "Foto enviada." : `${enviados} fotos enviadas.`);
      setDescricao("");
      await carregar();
    }
    if (guardadas > 0) {
      notificarSucesso(
        guardadas === 1 ? "Sem internet: foto guardada no aparelho." : `Sem internet: ${guardadas} fotos guardadas no aparelho.`,
      );
      setDescricao("");
    }
    if (falhas.length > 0) notificarErro(falhas[0]);
  }

  async function confirmarRemocao() {
    if (!remover || removendo) return;
    if (!navigator.onLine) {
      notificarErro("Sem internet: remover uma foto precisa de conexão.");
      return;
    }
    setRemovendo(true);
    try {
      await removerAnexo(remover.id);
      notificarSucesso("Foto removida. O registro fica no histórico da OS.");
      setRemover(null);
      await carregar();
    } catch (e) {
      notificarErro(e instanceof Error ? e.message : "Não foi possível remover a foto.");
    } finally {
      setRemovendo(false);
    }
  }

  if (!fotos && !erro) return <TelaCarregando />;

  const porCategoria = MOMENTOS_FOTO.map((c) => ({
    ...c,
    fotos: (fotos ?? []).filter((f) => f.momento === c.valor),
  })).filter((g) => g.fotos.length > 0);
  const semCategoria = (fotos ?? []).filter((f) => !f.momento);

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/technician/jobs/${id}`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
        <ArrowLeft size={15} aria-hidden="true" /> Atendimento
      </Link>

      <h1 className="font-display text-xl font-semibold text-text-primary">Fotos e evidências</h1>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
          <span className="flex-1 text-text-primary">{erro}</span>
          <button onClick={carregar} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary">
            <RefreshCw size={12} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}

      {podeEnviar && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4" aria-label="Registrar evidência">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-primary">Categoria</span>
            <div className="grid grid-cols-3 gap-2">
              {MOMENTOS_FOTO.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setCategoria(c.valor)}
                  aria-pressed={categoria === c.valor}
                  className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                    categoria === c.valor ? "border-accent bg-accent-muted text-text-primary" : "border-border text-text-secondary"
                  }`}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
          </div>

          <input
            value={descricao}
            maxLength={500}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição (opcional)"
            className="min-h-[48px] rounded-lg border border-border bg-base px-3 text-sm text-text-primary placeholder:text-text-muted"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={enviando}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white disabled:opacity-60"
            >
              {enviando ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
              Tirar foto
            </button>
            <button
              type="button"
              onClick={() => galeriaRef.current?.click()}
              disabled={enviando}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-border text-base font-semibold text-text-secondary disabled:opacity-60"
            >
              <ImagePlus size={18} aria-hidden="true" /> Enviar
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => enviar(e.target.files)} />
          <input ref={galeriaRef} type="file" accept={ACEITA_FOTO} multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
          <p className="text-[11px] text-text-muted">
            A foto é reduzida no aparelho antes de subir — economiza dados e mantém a leitura de etiqueta e dano.
          </p>
        </section>
      )}

      {pendentes.length > 0 && (
        <section aria-labelledby="titulo-pendentes">
          <h2 id="titulo-pendentes" className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <CloudOff size={14} className="text-amber-300" aria-hidden="true" /> Aguardando envio{" "}
            <span className="font-normal text-text-muted">({pendentes.length})</span>
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {pendentes.map(({ op, url }) => (
              <li key={op.chave} className="overflow-hidden rounded-xl border border-amber-400/30 bg-panel">
                <div className="aspect-square">
                  <img src={url} alt={op.descricao || op.nome} className="h-full w-full object-cover" />
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] text-text-secondary">{ROTULO_MOMENTO[op.momento]}</p>
                  <p className={`truncate text-[11px] ${op.estado === "erro" ? "text-danger" : "text-amber-300"}`}>
                    {op.estado === "erro" ? (op.mensagem ?? "Não foi aceita") : "Sobe quando a internet voltar"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fotos?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-panel px-4 py-12 text-center">
          <Camera size={20} className="text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Nenhuma foto neste atendimento.</p>
          {podeEnviar && <p className="text-xs text-text-muted">Registre o antes, o problema e o depois.</p>}
        </div>
      ) : (
        [...porCategoria, ...(semCategoria.length > 0 ? [{ valor: "outros" as MomentoFoto, rotulo: "Sem categoria", fotos: semCategoria }] : [])].map(
          (grupo) => (
            <section key={grupo.rotulo} aria-labelledby={`cat-${grupo.valor}-${grupo.rotulo}`}>
              <h2 id={`cat-${grupo.valor}-${grupo.rotulo}`} className="mb-2 text-sm font-semibold text-text-primary">
                {grupo.rotulo} <span className="font-normal text-text-muted">({grupo.fotos.length})</span>
              </h2>
              <ul className="grid grid-cols-2 gap-2">
                {grupo.fotos.map((foto) => (
                  <li key={foto.id} className="overflow-hidden rounded-xl border border-border bg-panel">
                    <a
                      href={urls.get(foto.caminho)}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square"
                      aria-label={`Abrir ${foto.nome_arquivo}`}
                    >
                      <Miniatura url={urls.get(foto.caminho)} nome={foto.nome_arquivo} />
                    </a>
                    <div className="flex items-start justify-between gap-1 p-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-text-secondary">{hora(foto.criado_em)}</p>
                        <p className="truncate text-[11px] text-text-muted">{formatarTamanho(foto.tamanho_bytes)}</p>
                        {foto.descricao && (
                          <p className="line-clamp-2 text-[11px] text-text-secondary" title={foto.descricao}>
                            {foto.descricao}
                          </p>
                        )}
                      </div>
                      {podeEnviar && foto.meu && (
                        <button
                          onClick={() => setRemover(foto)}
                          aria-label={`Remover ${foto.nome_arquivo}`}
                          className="shrink-0 rounded-lg p-2 text-text-muted active:bg-danger/10"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )
      )}

      {!podeEnviar && (fotos?.length ?? 0) >= 0 && (
        <p className="text-center text-[11px] text-text-muted">Seu cargo não permite anexar fotos.</p>
      )}

      <ConfirmDialog
        aberto={!!remover}
        titulo="Remover foto"
        descricao="A foto sai da galeria, mas o registro continua no histórico da OS."
        textoConfirmar="Remover"
        tom="perigo"
        processando={removendo}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemover(null)}
      />
    </div>
  );
}
