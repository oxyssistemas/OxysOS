import { useEffect } from "react";

/**
 * Instalação do portal do técnico no celular (§44): manifest, ícone e
 * service worker valem só dentro de /technician. O /app e o /admin seguem
 * como sempre foram.
 */
function anexar(tag: "link" | "meta", atributos: Record<string, string>): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  el.dataset.pwaTecnico = "";
  document.head.appendChild(el);
  return el;
}

export function usePwaTecnico() {
  useEffect(() => {
    const tags = [
      anexar("link", { rel: "manifest", href: "/manifest-tecnico.webmanifest" }),
      anexar("link", { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }),
      anexar("meta", { name: "theme-color", content: "#0D0D0D" }),
      anexar("meta", { name: "apple-mobile-web-app-capable", content: "yes" }),
      anexar("meta", { name: "apple-mobile-web-app-title", content: "Oxys Campo" }),
    ];
    // em desenvolvimento o Vite troca módulos a quente; cache de casca só no build
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js", { scope: "/technician" }).catch((e) => console.error("[pwa] registro", e));
    }
    return () => tags.forEach((t) => t.remove());
  }, []);
}
