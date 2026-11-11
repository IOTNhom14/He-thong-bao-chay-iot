import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext';
import { Flame, Lock, Mail, ArrowRight, Shield, AlertCircle, ShieldAlert } from 'lucide-react';
import type { UserRole } from '../api/auth.api';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const reason = searchParams.get('reason');
  const redirectTarget = searchParams.get('redirect') || '/';

  const navigateAfterLogin = (role?: UserRole) => {
    // Nếu có redirect đích tới /admin và người dùng đăng nhập tài khoản ADMIN:
    if (redirectTarget === '/admin' && role === 'ADMIN') {
      navigate('/admin', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await login(email, password);
      const savedUser = localStorage.getItem('fire_alert_user');
      const parsed = savedUser ? JSON.parse(savedUser) : null;
      navigateAfterLogin(parsed?.role);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setErrorMsg(error.response?.data?.error || 'Đăng nhập không thành công');
    }
  };

  const handleQuickLogin = async (role: UserRole) => {
    const cred = DEMO_CREDENTIALS[role];
    setErrorMsg(null);
    try {
      await login(cred.email, cred.pass);
      navigateAfterLogin(role);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setErrorMsg(error.response?.data?.error || 'Đăng nhập không thành công');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#090a0f] text-zinc-100">
      <div className="w-full max-w-md rounded-md border border-zinc-800 bg-[#111318] p-7 shadow-lg">
        {/* Header trạm */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded bg-red-700 flex items-center justify-center text-white mx-auto mb-3 border border-red-600">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-zinc-100 uppercase tracking-wide">
            HỆ THỐNG BÁO CHÁY TỰ ĐỘNG
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            IoT TELEMETRY CONSOLE · TRẠM VẬN HÀNH PTIT
          </p>
        </div>

        {/* Thông báo lỗi */}
        {errorMsg && (
          <div className="mb-4 p-2.5 rounded bg-red-950/80 border border-red-700 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Cảnh báo an ninh khi bị đá văng từ phiên Operator / Viewer không đủ quyền */}
        {reason === 'admin_required' && !errorMsg && (
          <div className="mb-4 p-3 rounded bg-amber-950/80 border border-amber-600 text-amber-200 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-300 uppercase tracking-wide">
                Yêu cầu quyền Quản trị (ADMIN)
              </div>
              <div className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                Ca trực trước đó không có quyền truy cập <strong>Cấu hình Hệ thống</strong>. Phiên làm việc đã bị kết thúc theo chính sách bảo mật RBAC. Vui lòng đăng nhập bằng tài khoản <strong>Quản trị viên</strong> để tiếp tục.
              </div>
            </div>
          </div>
        )}

        {/* Form đăng nhập */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">
              Tên đăng nhập hoặc Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin hoặc admin@firealert.iot"
                className="w-full bg-[#0c0e12] border border-zinc-800 rounded pl-8 pr-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-300 block mb-1">
              Mật khẩu
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0c0e12] border border-zinc-800 rounded pl-8 pr-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-3 rounded bg-red-700 hover:bg-red-600 text-white font-semibold text-xs border border-red-600 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập ca trực'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Đăng nhập nhanh phục vụ kiểm thử / demo */}
        <div className="mt-6 pt-5 border-t border-zinc-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 mb-2.5 uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-zinc-500" />
            <span>Đăng nhập nhanh theo vai trò ca trực:</span>
          </div>

          <div className="space-y-1.5">
            {(['ADMIN', 'OPERATOR', 'VIEWER'] as UserRole[]).map((r) => {
              const cred = DEMO_CREDENTIALS[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleQuickLogin(r)}
                  className="w-full text-left p-2 rounded bg-[#0c0e12] hover:bg-zinc-800 border border-zinc-800/80 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                      {cred.title}
                    </div>
                    <div className="text-[11px] text-zinc-400">{cred.desc}</div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {r}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
