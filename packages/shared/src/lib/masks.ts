export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 14;
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Documentos (mesmas regras de public.cpf_valido / public.cnpj_valido no banco)
// ---------------------------------------------------------------------------

/** Remove pontuação; mantém dígitos e letras (CNPJ alfanumérico) em maiúsculas. */
export function limparDocumento(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** CNPJ numérico ou alfanumérico (12 posições [0-9A-Z] + 2 dígitos): 12.ABC.345/01DE-35 */
export function maskCnpjAlfanumerico(value: string): string {
  const raw = limparDocumento(value);
  const base = raw.slice(0, 12);
  const dv = raw.slice(12).replace(/\D/g, "").slice(0, 2);
  const chars = base + dv;
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    if (i === 2 || i === 5) out += ".";
    if (i === 8) out += "/";
    if (i === 12) out += "-";
    out += chars[i];
  }
  return out;
}

export function cpfValido(value: string): boolean {
  const cpf = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const d = cpf.split("").map(Number);
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += d[i] * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === d[9] && digito(10) === d[10];
}

export function cnpjValido(value: string): boolean {
  const cnpj = limparDocumento(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const v = cnpj.split("").map((c) => c.charCodeAt(0) - 48);
  const digito = (pesos: number[]) => {
    const soma = pesos.reduce((acc, peso, i) => acc + v[i] * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return (
    digito([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === v[12] &&
    digito([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === v[13]
  );
}

export function formatarDocumento(documento: string | null | undefined, tipo: "pf" | "pj"): string {
  if (!documento) return "";
  return tipo === "pf" ? maskCpf(documento) : maskCnpjAlfanumerico(documento);
}

export function maskCep(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

export function cepValido(value: string): boolean {
  return /^\d{8}$/.test(value.replace(/\D/g, ""));
}

/** Busca sem acento e em minúsculas (mesma normalização de public.normalizar_busca). */
export function normalizarBusca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const ESTADOS_BR = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
