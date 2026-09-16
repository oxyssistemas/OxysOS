import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useCompany } from "../context/CompanyContext";
import { SECOES_NAVEGACAO, itemVisivel, type ItemNavegacao } from "../navegacao";

interface PortalSidebarProps {
  aberta: boolean;
  onFechar: () => void;
}

function ItemMenu({ item, compacto, onNavegar }: { item: ItemNavegacao; compacto: boolean; onNavegar: () => void }) {
  const Icone = item.icone;
  const base = "group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors";
  const espacamento = compacto ? "h-10 w-10 justify-center" : "px-3 py-2.5";

  const dica = compacto && (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-panel px-2 py-1 text-xs text-text-primary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {item.label}
      {item.emBreve && " · em breve"}
    </span>
  );

  if (item.emBreve) {
    return (
      <div
        aria-disabled="true"
        tabIndex={compacto ? 0 : -1}
        aria-label={`${item.label} (em breve)`}
        className={`${base} ${espacamento} cursor-default text-text-muted`}
      >
        <Icone size={18} strokeWidth={2} aria-hidden="true" />
        {!compacto && (
          <>
            <span className="flex-1">{item.label}</span>
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              Em breve
            </span>
          </>
        )}
        {dica}
      </div>
    );
  }

  return (
    <NavLink
      to={item.rota}
      end={item.rota === "/app"}
      onClick={onNavegar}
      aria-label={compacto ? item.label : undefined}
      className={({ isActive }) =>
        `${base} ${espacamento} ${
          isActive
            ? "bg-accent-muted text-accent"
            : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
        }`
      }
    >
      <Icone size={18} strokeWidth={2} aria-hidden="true" />
      {!compacto && <span>{item.label}</span>}
      {dica}
    </NavLink>
  );
}

function ConteudoSidebar({ compacto, onNavegar }: { compacto: boolean; onNavegar: () => void }) {
  const { sair } = useAuth();
  const { company, currentUser, hasFeature, can } = useCompany();

  const secoes = SECOES_NAVEGACAO.map((secao) => ({
    ...secao,
    itens: secao.itens.filter((item) => itemVisivel(item, hasFeature, can)),
  })).filter((secao) => secao.itens.length > 0);

  const nome = currentUser?.nome ?? "";

  return (
    <div className="flex h-full flex-col border-r border-border bg-elevated">
      <div className={compacto ? "flex justify-center py-6" : "px-5 py-6"}>
        {compacto ? (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-display text-sm font-semibold text-white"
            title={company?.nome}
            aria-label={company?.nome}
          >
            {(company?.nome ?? "O").charAt(0).toUpperCase()}
          </div>
        ) : (
          <>
            <p className="font-display text-lg font-semibold tracking-tight text-text-primary">Oxys OS</p>
            <p className="mt-0.5 truncate text-xs text-text-secondary" title={company?.nome}>
              {company?.nome}
            </p>
          </>
        )}
      </div>

      <nav
        className={`flex-1 overflow-y-auto ${compacto ? "flex flex-col items-center px-2" : "px-3"}`}
        aria-label="Navegação principal"
      >
        {secoes.map((secao, indice) => (
          <div key={secao.titulo ?? indice} className={indice > 0 ? "mt-5" : undefined}>
            {secao.titulo &&
              (compacto ? (
                <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  {secao.titulo}
                </p>
              ))}
            <ul className={`flex flex-col gap-1 ${compacto ? "items-center" : ""}`}>
              {secao.itens.map((item) => (
                <li key={item.rota}>
                  <ItemMenu item={item} compacto={compacto} onNavegar={onNavegar} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`border-t border-border p-3 ${compacto ? "flex flex-col items-center gap-2" : ""}`}>
        {!compacto && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-muted text-sm font-semibold text-accent"
              aria-hidden="true"
            >
              {(nome || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{nome}</p>
              <p className="truncate text-xs text-text-muted">{currentUser?.cargo?.nome ?? "Sem cargo"}</p>
            </div>
          </div>
        )}
        <button
          onClick={sair}
          aria-label="Sair"
          title={compacto ? "Sair" : undefined}
          className={`flex items-center gap-3 rounded-lg text-sm font-medium text-text-secondary transition-colors hover:bg-white/5 hover:text-danger ${
            compacto ? "h-10 w-10 justify-center" : "mt-1 w-full px-3 py-2.5"
          }`}
        >
          <LogOut size={18} strokeWidth={2} aria-hidden="true" />
          {!compacto && "Sair"}
        </button>
      </div>
    </div>
  );
}

/**
 * Desktop (≥1024px): sidebar completa · Tablet (768–1023px): sidebar compacta
 * com tooltips · Mobile (<768px): gaveta.
 */
export function PortalSidebar({ aberta, onFechar }: PortalSidebarProps) {
  const location = useLocation();

  // fecha a gaveta ao navegar (onFechar é estável: vem de useCallback no layout)
  useEffect(() => {
    onFechar();
  }, [location.pathname, onFechar]);

  useEffect(() => {
    if (!aberta) return;
    function aoPressionar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", aoPressionar);
    return () => window.removeEventListener("keydown", aoPressionar);
  }, [aberta, onFechar]);

  return (
    <>
      <aside className="hidden w-[260px] shrink-0 lg:block">
        <ConteudoSidebar compacto={false} onNavegar={() => undefined} />
      </aside>
      <aside className="hidden w-[72px] shrink-0 md:block lg:hidden">
        <ConteudoSidebar compacto onNavegar={() => undefined} />
      </aside>

      {aberta && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onFechar} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-[260px] max-w-[85vw] animate-fade-in">
            <div className="relative h-full">
              <button
                onClick={onFechar}
                aria-label="Fechar menu"
                className="absolute right-[-44px] top-4 rounded-lg bg-elevated p-2 text-text-secondary"
              >
                <X size={20} />
              </button>
              <ConteudoSidebar compacto={false} onNavegar={onFechar} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
