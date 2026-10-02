import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Tone = 'info' | 'win' | 'loss' | 'warn';

export type Toast = {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
};

type ToastValue = {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

const TONE_STYLES: Record<Tone, { bar: string; ring: string }> = {
  info: { bar: 'bg-info-400', ring: 'ring-info-400/30' },
  win: { bar: 'bg-up-400', ring: 'ring-up-400/30' },
  loss: { bar: 'bg-down-400', ring: 'ring-down-400/30' },
  warn: { bar: 'bg-gold-500', ring: 'ring-gold-500/30' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === 'win' || toast.tone === 'loss' ? 7000 : 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-24 right-3 z-[60] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 sm:bottom-4 sm:right-4">
        {toasts.map((toast) => {
          const tone = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex animate-slide-up overflow-hidden rounded-xl bg-ink-850/95 ring-1 backdrop-blur ${tone.ring}`}
            >
              <span className={`w-1 shrink-0 ${tone.bar}`} />
              <div className="flex-1 px-3.5 py-3">
                <p className="text-[13px] font-semibold text-mist-100">{toast.title}</p>
                {toast.body ? <p className="mt-0.5 text-xs text-mist-400">{toast.body}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="px-3 text-mist-500 transition hover:text-mist-100"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
