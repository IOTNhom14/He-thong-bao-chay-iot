import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Home } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ForbiddenPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#111318] border border-zinc-800 rounded-lg p-6 text-center shadow-2xl">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-950/60 border border-red-700/60 flex items-center justify-center text-red-400">
          <ShieldAlert className="w-7 h-7 text-red-500 animate-pulse" />
        </div>

        <div className="inline-block px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-red-950/80 text-red-300 border border-red-800 mb-2">
          HTTP 403 FORBIDDEN · TRUY CẬP BỊ TỪ CHỐI
        </div>

        <h1 className="text-lg font-bold text-zinc-100 uppercase tracking-wide mt-2">
          Không Đủ Quyền Hạn
        </h1>

        <p className="text-xs text-zinc-400 mt-2 leading-relaxed font-sans">
          Phiên làm việc của bạn (vai trò{' '}
          <span className="font-mono font-semibold text-zinc-200">
            {user?.role || 'VIEWER'}
          </span>
          ) không có quyền truy cập vào phân hệ này. Mọi nỗ lực truy cập trái phép đều được ghi nhận vào nhật ký an ninh hệ thống.
        </p>

        <div className="mt-6 pt-5 border-t border-zinc-800/80 flex items-center justify-center">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Về Màn Hình Giám Sát</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
