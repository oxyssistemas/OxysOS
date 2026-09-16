import { supabase } from "@oxys/shared/supabase";

const BUCKET_FOTOS = "os-fotos";
const TAMANHO_MAXIMO_FOTO = 10 * 1024 * 1024; // mesmo limite configurado no bucket
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VALIDADE_URL_SEGUNDOS = 60 * 60;

/** Envia a foto para o bucket privado e devolve o caminho (`loja_id/os_id/arquivo`). */
export async function enviarFotoOS(lojaId: string, osId: string, arquivo: File): Promise<string> {
  if (!TIPOS_FOTO.includes(arquivo.type)) {
    throw new Error("Formato de imagem não suportado. Use JPG, PNG, WEBP ou HEIC.");
  }
  if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
    throw new Error("A foto deve ter no máximo 10 MB.");
  }

  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const caminho = `${lojaId}/${osId}/${crypto.randomUUID()}.${extensao}`;

  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(caminho, arquivo, {
    cacheControl: "3600",
    upsert: false,
    contentType: arquivo.type,
  });

  if (error) {
    console.error("[storage] falha no upload da foto", error);
    throw new Error("Não foi possível enviar a foto. Tente novamente.");
  }

  return caminho;
}

/** URLs temporárias para exibir fotos privadas (a política do bucket valida a empresa). */
export async function gerarUrlsFotos(caminhos: string[]): Promise<Map<string, string>> {
  if (caminhos.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .createSignedUrls(caminhos, VALIDADE_URL_SEGUNDOS);
  if (error || !data) {
    console.error("[storage] falha ao gerar URLs das fotos", error);
    return new Map();
  }
  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export function gerarCodigoAparelho(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
