"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (options: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({
      title,
      description,
      variant = "success",
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
    }) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, title, description, variant }]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} toast={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; className: string; iconClass: string }
> = {
  success: {
    icon: CheckCircle2,
    className: "border-positive-border bg-positive-soft",
    iconClass: "text-positive",
  },
  error: {
    icon: AlertCircle,
    className: "border-negative-border bg-negative-soft",
    iconClass: "text-negative",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-warning-border bg-warning-soft",
    iconClass: "text-warning",
  },
  info: { icon: Info, className: "border-info-border bg-info-soft", iconClass: "text-info" },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, className, iconClass } = VARIANT_STYLES[toast.variant];

  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.variant === "error" ? 8000 : 4500);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.variant]);

  return (
    <div
      role="status"
      className={cn(
        "animate-slide-in-right pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg backdrop-blur",
        className,
      )}
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-sm leading-snug text-muted-strong">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-black/5 hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
