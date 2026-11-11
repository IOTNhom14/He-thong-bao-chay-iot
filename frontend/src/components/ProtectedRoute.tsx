import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../api/auth.api';

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
  // Nếu không đủ quyền hạn quản trị (ví dụ Operator/Viewer cố vào /admin):
  // Lập tức ngắt session và đá văng ra màn hình đăng nhập yêu cầu xác thực tài khoản Admin
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    logout();
    return <Navigate to="/login?reason=admin_required&redirect=/admin" replace />;
  }

  return <>{children}</>;
};
