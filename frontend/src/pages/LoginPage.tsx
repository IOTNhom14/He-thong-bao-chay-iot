import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext';
import { Flame, Shield, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';
import type { UserRole } from '../api/auth.api';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Đăng nhập không thành công, vui lòng kiểm tra lại');
    }
  };

  const handleQuickLogin = async (role: UserRole) => {
    setErrorMsg(null);
    const cred = DEMO_CREDENTIALS[role];
    setEmail(cred.email);
    setPassword(cred.pass);
    try {
      await login(cred.email, cred.pass);
      navigate('/', { replace: true });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Đăng nhập không thành công');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-gray-950 via-[#0a0f1d] to-black relative overflow-hidden">
      {/* Decorative ambient lights */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 glass-panel rounded-3xl border border-gray-800 p-8 shadow-2xl">
        {/* Logo & Tiêu đề */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-red-500 to-amber-600 shadow-xl shadow-red-500/20 mb-3">
            <Flame className="w-8 h-8 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">HỆ THỐNG BÁO CHÁY TỰ ĐỘNG</h1>
          <p className="text-xs text-gray-400 mt-1">Đồ án PTIT IoT • Trung tâm Điều hành & Giám sát An toàn</p>
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMsg && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form đăng nhập */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1.5">Tên đăng nhập hoặc Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin hoặc admin@firealert.iot"
                className="w-full bg-gray-900/90 border border-gray-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-300 block mb-1.5">Mật khẩu</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-900/90 border border-gray-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Nút bấm đăng nhập nhanh phục vụ chấm thi đồ án */}
        <div className="mt-8 pt-6 border-t border-gray-800">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <span>Đăng nhập nhanh theo vai trò (Demo/Chấm điểm):</span>
          </div>

          <div className="space-y-2">
            {(['ADMIN', 'OPERATOR', 'VIEWER'] as UserRole[]).map((r) => {
              const cred = DEMO_CREDENTIALS[r];
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleQuickLogin(r)}
                  className="w-full text-left p-2.5 rounded-xl bg-gray-900/70 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-red-400 transition-colors">
                      {cred.title}
                    </div>
                    <div className="text-[11px] text-gray-400">{cred.desc}</div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
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
