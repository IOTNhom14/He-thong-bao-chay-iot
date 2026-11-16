import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext';
import {
  Flame,
  Shield,
  LogOut,
  Radio,
  LayoutDashboard,
  Settings,
  Lock,
} from 'lucide-react';
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
  const navigate = useNavigate();
  const isAdminPage = location.pathname.startsWith('/admin');

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-950/80 text-red-300 border-red-700';
      case 'OPERATOR':
        return 'bg-blue-950/80 text-blue-300 border-blue-700';
      case 'VIEWER':
        return 'bg-zinc-900 text-zinc-400 border-zinc-700';
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return { text: 'GATEWAY: ONLINE (WS)', color: 'text-emerald-400', dot: 'bg-emerald-500' };
      case 'CONNECTING':
        return { text: 'GATEWAY: KẾT NỐI...', color: 'text-amber-400', dot: 'bg-amber-500' };
      case 'RECONNECTING':
        return {
          text: `GATEWAY: THỬ LẠI (${reconnectAttempts})...`,
          color: 'text-orange-400',
          dot: 'bg-orange-500',
        };
      case 'DISCONNECTED':
      default:
        return { text: 'GATEWAY: REST ONLY', color: 'text-zinc-400', dot: 'bg-zinc-500' };
    }
  };

  const statusInfo = getStatusBadge();

  // Xử lý khi bấm nút Cấu hình Hệ thống: Nếu không phải Admin thì đá văng ra màn hình đăng nhập
  const handleAdminNavClick = (e: React.MouseEvent) => {
    if (!isAdmin) {
      e.preventDefault();
      // Chấm dứt phiên làm việc hiện tại và đá văng về trang đăng nhập
      logout();
      navigate('/login?reason=admin_required&redirect=/admin', { replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0b0d12] border-b border-zinc-800 px-4 lg:px-8 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Nhóm Bên trái: Logo Trạm & Thanh Điều Hướng Chính (Navigation Tabs) */}
        <div className="flex items-center gap-4 flex-wrap md:flex-nowrap justify-between w-full md:w-auto">
          {/* Logo & Tên Trạm PCCC */}
          <Link
            to="/"
            className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            title="Trang chủ Giám sát PCCC"
          >
            <div className="w-9 h-9 rounded bg-red-700 hover:bg-red-600 flex items-center justify-center text-white transition-colors border border-red-600 shrink-0">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide text-zinc-100 uppercase">
                TRẠM GIÁM SÁT PCCC TRUNG TÂM
              </div>
              <div className="text-[10px] font-mono text-zinc-500 tracking-wider">
                INDUSTRIAL TELEMETRY SCADA CONSOLE
              </div>
            </div>
          </Link>

          {/* Thanh Tab Điều Hướng Chính (Luôn hiển thị rõ ràng cho người dùng) */}
          <nav className="flex items-center gap-1 bg-[#12141a] p-1 rounded-md border border-zinc-800 text-xs font-medium ml-0 md:ml-3">
            <Link
              to="/"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                !isAdminPage
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-zinc-400" />
              <span>Giám Sát</span>
            </Link>

            <Link
              to="/admin"
              onClick={handleAdminNavClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                isAdminPage
                  ? 'bg-red-950/80 text-red-200 font-semibold shadow-sm border border-red-700/80'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title={
                !isAdmin
                  ? 'Yêu cầu quyền ADMIN (Bấm vào sẽ kết thúc phiên và chuyển về màn hình đăng nhập Admin)'
                  : 'Cấu hình thiết bị, camera & người dùng'
              }
            >
              <Settings className="w-4 h-4 text-zinc-400" />
              <span>Cấu hình Hệ thống</span>
              {!isAdmin && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-400/90 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/60 font-mono">
                  <Lock className="w-2.5 h-2.5" /> Admin
                </span>
              )}
            </Link>
          </nav>
        </div>

        {/* Nhóm Bên phải: Trạng thái Gateway + Ca trực Demo + Thông tin Tài khoản */}
        <div className="flex items-center gap-2.5 flex-wrap justify-end w-full md:w-auto">
          {/* Trạng thái Gateway / MQTT */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[#12141a] border border-zinc-800 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${statusInfo.dot} animate-pulse`} />
            <Radio className="w-3.5 h-3.5 text-zinc-500" />
            <span className={`font-semibold ${statusInfo.color}`}>{statusInfo.text}</span>
          </div>

          {/* Quick Role Switcher (Chuyển nhanh ca trực) */}
          <div className="flex items-center gap-0.5 bg-[#12141a] p-1 rounded border border-zinc-800 text-xs font-mono">
            <span className="text-zinc-500 px-1.5 hidden lg:flex items-center gap-1 text-[11px]">
              <Shield className="w-3 h-3 text-zinc-500" /> Ca trực:
            </span>
            {(['ADMIN', 'OPERATOR', 'VIEWER'] as UserRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => switchRoleDemo(r)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  user?.role === r
                    ? r === 'ADMIN'
                      ? 'bg-red-700 text-white shadow-sm'
                      : r === 'OPERATOR'
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'bg-zinc-700 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title={DEMO_CREDENTIALS[r].desc}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Thông tin người trực */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
              <div className="text-right hidden md:block">
                <div className="text-xs font-medium text-zinc-200 truncate max-w-[120px]">
                  {user.fullName}
                </div>
                <div className="text-[10px] font-mono mt-0.5">
                  <span className={`px-1.5 py-0.2 border rounded ${getRoleBadge(user.role)}`}>
                    {user.role}
                    {isViewer && ' (READONLY)'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="p-1.5 rounded bg-zinc-800/80 hover:bg-red-950 text-zinc-400 hover:text-red-300 border border-zinc-700 hover:border-red-800 transition-colors"
                title="Đăng xuất khỏi ca trực"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
