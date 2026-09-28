/**
 * IndexedDB mínimo do portal do técnico (sem dependência externa).
 * Duas áreas: "dados" (cópias para ler sem internet) e "fila" (o que foi
 * feito offline e ainda não chegou ao servidor).
 */
const NOME = "oxys-campo";
const VERSAO = 1;
export type Area = "dados" | "fila";

let conexao: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!conexao) {
    conexao = new Promise((resolve, reject) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("dados")) db.createObjectStore("dados");
        if (!db.objectStoreNames.contains("fila")) db.createObjectStore("fila", { keyPath: "chave" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        conexao = null;
        reject(req.error);
      };
    });
  }
  return conexao;
}

function executar<T>(area: Area, modo: IDBTransactionMode, acao: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(area, modo);
        const req = acao(tx.objectStore(area));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const ler = <T>(area: Area, chave: string) => executar<T | undefined>(area, "readonly", (s) => s.get(chave));
export const listar = <T>(area: Area) => executar<T[]>(area, "readonly", (s) => s.getAll());
export const gravar = (area: Area, valor: unknown, chave?: string) =>
  executar(area, "readwrite", (s) => (chave === undefined ? s.put(valor) : s.put(valor, chave))).then(() => undefined);
export const apagar = (area: Area, chave: string) => executar(area, "readwrite", (s) => s.delete(chave)).then(() => undefined);
export const esvaziar = (area: Area) => executar(area, "readwrite", (s) => s.clear()).then(() => undefined);
