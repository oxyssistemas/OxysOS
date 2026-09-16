import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

interface ToastItem {
  id: number;
  tipo: "sucesso" | "erro";
  mensagem: string;
}

interface ToastContextValue {
  notificarSucesso: (mensagem: string) => void;
  notificarErro: (mensagem: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remover = useCallback((id: number) => {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }, []);

  const adicionar = useCallback(
    (tipo: ToastItem["tipo"], mensagem: string) => {
      const id = Date.now() + Math.random();
      setToasts((atual) => [...atual, { id, tipo, mensagem }]);
      setTimeout(() => remover(id), 4500);
    },
    [remover],
  );

  const notificarSucesso = useCallback((mensagem: string) => adicionar("sucesso", mensagem), [adicionar]);
  const notificarErro = useCallback((mensagem: string) => adicionar("erro", mensagem), [adicionar]);

  return (
    <ToastContext.Provider value={{ notificarSucesso, notificarErro }}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3"
        role="region"
        aria-live="polite"
        aria-label="Notificações"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur animate-fade-in max-w-sm ${
              toast.tipo === "sucesso"
                ? "bg-[#0F1F17] border-success/30 text-[#B6F5D8]"
                : "bg-[#210F0F] border-danger/30 text-[#FFC9C9]"
            }`}
          >
            {toast.tipo === "sucesso" ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />
            )}
            <p className="text-sm leading-snug">{toast.mensagem}</p>
            <button
              onClick={() => remover(toast.id)}
              aria-label="Fechar notificação"
              className="ml-auto text-text-muted hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de ToastProvider");
  return ctx;
}
