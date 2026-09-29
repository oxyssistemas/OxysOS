/**
 * Compressão de foto antes do upload (§33).
 *
 * Foto de celular hoje passa fácil de 5 MB e o limite do bucket é 10 MB —
 * enviar o arquivo cru gasta dados do técnico em campo e deixa a galeria
 * lenta. Aqui a imagem é redesenhada até 2048 px no lado maior com
 * qualidade 0,85: o suficiente para ler etiqueta, número de série e dano
 * em uma evidência técnica, e pequeno o bastante para subir no 4G.
 *
 * Nada é destruído em silêncio: se a imagem já é pequena, se o formato não
 * abre no navegador (HEIC do iPhone, por exemplo) ou se o resultado ficaria
 * maior que o original, devolvemos o arquivo original.
 */

const LADO_MAXIMO = 2048;
const QUALIDADE = 0.85;
/** abaixo disso não vale a pena recomprimir */
const LIMITE_SEM_COMPRIMIR = 700 * 1024;

/** Formatos que todo navegador decodifica; HEIC/HEIF ficam de fora de propósito. */
const COMPRIMIVEIS = ["image/jpeg", "image/png", "image/webp"];

export interface ResultadoCompressao {
  arquivo: File;
  /** true quando o arquivo devolvido é diferente do original */
  comprimida: boolean;
  bytesOriginais: number;
}

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem ilegível"));
    };
    img.src = url;
  });
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/** Troca a extensão do nome mantendo o resto (foto.heic → foto.jpg). */
function comExtensao(nome: string, extensao: string): string {
  const base = nome.replace(/\.[^.]+$/, "") || "foto";
  return `${base}.${extensao}`;
}

export async function comprimirImagem(arquivo: File): Promise<ResultadoCompressao> {
  const original: ResultadoCompressao = { arquivo, comprimida: false, bytesOriginais: arquivo.size };
  if (!COMPRIMIVEIS.includes(arquivo.type)) return original;
  if (arquivo.size <= LIMITE_SEM_COMPRIMIR) return original;

  try {
    const img = await carregarImagem(arquivo);
    const maior = Math.max(img.naturalWidth, img.naturalHeight);
    const escala = maior > LADO_MAXIMO ? LADO_MAXIMO / maior : 1;
    const largura = Math.round(img.naturalWidth * escala);
    const altura = Math.round(img.naturalHeight * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, largura, altura);

    // PNG com transparência vira JPEG sobre branco; para evidência é o que interessa
    const destino = arquivo.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await paraBlob(canvas, destino, QUALIDADE);
    if (!blob || blob.size >= arquivo.size) return original;

    const extensao = destino === "image/webp" ? "webp" : "jpg";
    return {
      arquivo: new File([blob], comExtensao(arquivo.name, extensao), { type: destino, lastModified: Date.now() }),
      comprimida: true,
      bytesOriginais: arquivo.size,
    };
  } catch {
    // formato que o navegador não abre: sobe do jeito que veio
    return original;
  }
}
