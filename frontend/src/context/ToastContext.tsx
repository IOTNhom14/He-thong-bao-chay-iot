import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Loader2, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'pending';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000, 0 = không tự tắt
  createdAt: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id' | 'createdAt'> & { id?: string }) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Omit<ToastItem, 'id' | 'createdAt'>>) => void;
  showSuccess: (title: string, message?: string, duration?: number) => string;
  showError: (title: string, message?: string, duration?: number) => string;
  showWarning: (title: string, message?: string, duration?: number) => string;
  showInfo: (title: string, message?: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<ToastItem, 'id' | 'createdAt'> & { id?: string }) => {
      const id = toast.id || `toast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const duration = toast.duration !== undefined ? toast.duration : 5000;

      const newToast: ToastItem = {
        ...toast,
        id,
        duration,
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        // Nếu trùng ID thì ghi đè
        const filtered = prev.filter((t) => t.id !== id);
        return [...filtered, newToast];
      });

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [removeToast]
  );

  const updateToast = useCallback(
    (id: string, updates: Partial<Omit<ToastItem, 'id' | 'createdAt'>>) => {
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id === id) {
            const updated = { ...t, ...updates };
            const nextDuration = updates.duration !== undefined ? updates.duration : 5000;
            if (nextDuration > 0) {
              setTimeout(() => {
                removeToast(id);
              }, nextDuration);
            }
            return updated;
          }
          return t;
        })
      );
    },
    [removeToast]
  );

  const showSuccess = useCallback(
    (title: string, message?: string, duration = 5000) =>
      addToast({ type: 'success', title, message, duration }),
    [addToast]
  );

  const showError = useCallback(
    (title: string, message?: string, duration = 6000) =>
      addToast({ type: 'error', title, message, duration }),
    [addToast]
  );

  const showWarning = useCallback(
    (title: string, message?: string, duration = 6000) =>
      addToast({ type: 'warning', title, message, duration }),
    [addToast]
  );

  const showInfo = useCallback(
    (title: string, message?: string, duration = 4000) =>
      addToast({ type: 'info', title, message, duration }),
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        addToast,
        removeToast,
        updateToast,
        showSuccess,
        showError,
        showWarning,
        showInfo,
      }}
    >
      {children}

      {/* Container hiển thị các Toast thông báo ở góc dưới bên phải */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';
          const isPending = toast.type === 'pending';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3 rounded border shadow-lg transition-all duration-200 flex items-start gap-2.5 ${
                isSuccess
                  ? 'bg-[#111318] border-zinc-800 border-l-4 border-l-emerald-500 text-zinc-200'
                  : isError
                  ? 'bg-[#111318] border-zinc-800 border-l-4 border-l-red-500 text-zinc-200'
                  : isWarning
                  ? 'bg-[#111318] border-zinc-800 border-l-4 border-l-amber-500 text-zinc-200'
                  : isPending
                  ? 'bg-[#111318] border-zinc-800 border-l-4 border-l-sky-500 text-zinc-200'
                  : 'bg-[#111318] border-zinc-800 border-l-4 border-l-zinc-500 text-zinc-200'
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {isError && <AlertCircle className="w-4 h-4 text-red-400" />}
                {isWarning && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                {isPending && <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />}
                {!isSuccess && !isError && !isWarning && !isPending && <Info className="w-4 h-4 text-zinc-400" />}
              </div>

              {/* Nội dung */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-zinc-100 tracking-wide font-mono truncate">{toast.title}</h4>
                {toast.message && <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed font-sans">{toast.message}</p>}
              </div>

              {/* Nút đóng */}
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded hover:bg-zinc-800"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast phải được dùng bên trong ToastProvider');
  }
  return context;
};
