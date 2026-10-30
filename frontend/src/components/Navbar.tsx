import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext';
import { Flame, Shield, LogOut, Radio, LayoutDashboard, ShieldCheck } from 'lucide-react';
import type { UserRole } from '../api/auth.api';
import type { ConnectionStatus } from '../hooks/useWebSocket';

interface NavbarProps {
  wsConnected: boolean;
  connectionStatus?: ConnectionStatus;
  reconnectAttempts?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  wsConnected: _wsConnected,
  connectionStatus = 'DISCONNECTED',
  reconnectAttempts = 0,
}) => {
  const { user, logout, switchRoleDemo, isViewer, isAdmin } = useAuth();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'OPERATOR':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'VIEWER':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return { text: 'Trực tuyến (WS)', color: 'text-emerald-400', iconColor: 'text-emerald-400 animate-pulse' };
      case 'CONNECTING':
        return { text: 'Đang kết nối...', color: 'text-amber-400', iconColor: 'text-amber-400 animate-spin' };
      case 'RECONNECTING':
        return {
          text: `Đang thử lại (${reconnectAttempts})...`,
          color: 'text-orange-400',
          iconColor: 'text-orange-400 animate-bounce',
        };
      case 'DISCONNECTED':
      default:
        return { text: 'Trực tuyến (REST)', color: 'text-emerald-400', iconColor: 'text-emerald-400' };
    }
  };

  const statusInfo = getStatusBadge();

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-gray-800 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Logo & Tiêu đề đồ án */}
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-amber-600 shadow-lg shadow-red-500/30">
            <Flame className="w-6 h-6 text-white animate-pulse" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Link to="/" className="text-lg font-bold tracking-wide text-white hover:text-red-400 transition-colors">
                HỆ THỐNG BÁO CHÁY TỰ ĐỘNG
              </Link>
            </div>
          </div>
        </div>

        {/* Trạng thái kết nối Máy chủ */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/80 border border-gray-800 text-xs">
          <Radio className={`w-4 h-4 ${statusInfo.iconColor}`} />
          <span className="text-gray-400">Máy chủ:</span>
          <span className={`font-semibold ${statusInfo.color}`}>{statusInfo.text}</span>
        </div>

        {/* Điều hướng Trang Admin (Chỉ ADMIN) & Role Switcher */}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Nút chuyển đổi trang Admin / Dashboard cho ADMIN */}
          {isAdmin && (
            <Link
              to={isAdminPage ? '/' : '/admin'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 border ${
                isAdminPage
                  ? 'bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 border-cyan-500/50 ring-1 ring-cyan-500/30'
                  : 'bg-red-950/80 hover:bg-red-900/80 text-red-300 border-red-500/50 ring-1 ring-red-500/30'
              }`}
            >
              {isAdminPage ? (
                <>
                  <LayoutDashboard size={14} className="text-cyan-400" />
                  <span>Về Dashboard</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} className="text-red-400 animate-pulse" />
                  <span>Trang Quản Trị</span>
                </>
              )}
            </Link>
          )}

          {/* Quick Role Switcher */}
          <div className="flex items-center gap-1 bg-gray-900/90 p-1 rounded-lg border border-gray-800 text-xs">
            <span className="text-gray-400 px-1.5 hidden sm:flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-gray-400" /> Đổi vai trò:
            </span>
            {(['ADMIN', 'OPERATOR', 'VIEWER'] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => switchRoleDemo(r)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  user?.role === r ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title={DEMO_CREDENTIALS[r].desc}
              >
                {r}
              </button>
            ))}
          </div>

          {/* User Profile Info */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <div className="text-sm font-medium text-gray-200">{user.fullName}</div>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className={`text-[10px] font-mono px-2 py-0.2 border rounded-full ${getRoleBadge(user.role)}`}>
                    {user.role}
                    {isViewer && ' (CHỈ ĐỌC)'}
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                className="p-2 rounded-lg bg-gray-900 hover:bg-red-950/60 border border-gray-800 hover:border-red-800/60 text-gray-400 hover:text-red-400 transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
