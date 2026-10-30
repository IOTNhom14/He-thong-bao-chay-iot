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
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';
          const isPending = toast.type === 'pending';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-5 ${
                isSuccess
                  ? 'bg-gray-900/95 border-emerald-500/50 text-emerald-200 ring-1 ring-emerald-500/30'
                  : isError
                  ? 'bg-gray-900/95 border-red-500/60 text-red-200 ring-1 ring-red-500/30'
                  : isWarning
                  ? 'bg-gray-900/95 border-amber-500/60 text-amber-200 ring-1 ring-amber-500/30'
                  : isPending
                  ? 'bg-gray-900/95 border-cyan-500/60 text-cyan-200 ring-1 ring-cyan-500/30'
                  : 'bg-gray-900/95 border-gray-700 text-gray-200'
              }`}
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {isError && <AlertCircle className="w-5 h-5 text-red-400" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {isPending && <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />}
                {!isSuccess && !isError && !isWarning && !isPending && <Info className="w-5 h-5 text-blue-400" />}
              </div>

              {/* Nội dung */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white tracking-wide truncate">{toast.title}</h4>
                {toast.message && <p className="text-[11px] text-gray-300 mt-1 leading-relaxed">{toast.message}</p>}
              </div>

              {/* Nút đóng */}
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800"
              >
                <X size={14} />
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
