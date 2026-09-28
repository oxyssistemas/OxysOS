/*
 * Service worker do Portal do Técnico (§44). Escopo: /technician.
 * Guarda só a "casca" do app (HTML e arquivos de /assets, que têm hash no nome).
 * Respostas da API NUNCA passam por aqui: os dados offline ficam no IndexedDB,
 * sob controle do app (por usuário, com validade e apagados ao sair — §50).
 */
const CACHE = "oxys-campo-casca-v1";
const MAX_ASSETS = 80;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/index.html", "/manifest-tecnico.webmanifest", "/icons/tecnico-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("oxys-campo-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function aparar(cache) {
  const chaves = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/assets/"));
  for (const r of chaves.slice(0, Math.max(0, chaves.length - MAX_ASSETS))) await cache.delete(r);
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API, fontes e storage seguem direto para a rede

  // navegação: rede primeiro (sempre a versão nova); sem internet, a casca guardada
  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp.ok && (resp.headers.get("content-type") || "").includes("text/html")) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put("/index.html", copia));
          }
          return resp;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // arquivos com hash: cache primeiro (nunca mudam de conteúdo)
  if (url.pathname.startsWith("/assets/")) {
    evento.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        const resp = await fetch(req);
        if (resp.ok) {
          await cache.put(req, resp.clone());
          aparar(cache);
        }
        return resp;
      }),
    );
    return;
  }

  // manifest e ícones: usa o guardado e atualiza por trás
  if (url.pathname === "/manifest-tecnico.webmanifest" || url.pathname.startsWith("/icons/")) {
    evento.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const guardado = await cache.match(req);
        const rede = fetch(req)
          .then((resp) => {
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => guardado);
        return guardado || rede;
      }),
    );
  }
});
