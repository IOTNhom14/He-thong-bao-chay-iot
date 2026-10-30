import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../api/auth.api';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  // 1. Hiển thị màn hình chờ xác thực khi đang tải session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-sm text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span>Đang xác thực quyền truy cập hệ thống...</span>
        </div>
      </div>
    );
  }

  // 2. Chưa đăng nhập -> Chuyển hướng về trang Đăng nhập
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Phân quyền theo vai trò (Role-Based Access Control)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#131b2e] border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-400">
            <ShieldAlert size={36} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Truy Cập Bị Từ Chối (403)</h2>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            Tài khoản của bạn có vai trò <span className="font-semibold text-amber-400">{user.role}</span>, không đủ quyền hạn để truy cập phân hệ này. Trang yêu cầu một trong các quyền: <span className="font-semibold text-emerald-400">{allowedRoles.join(', ')}</span>.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="/"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium transition-colors"
            >
              <ArrowLeft size={16} />
              Về Trang Chủ
            </a>
            <button
              onClick={logout}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-sm font-medium transition-colors"
            >
              <LogOut size={16} />
              Đăng Xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
