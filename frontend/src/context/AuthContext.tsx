import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthApi, type UserProfile, type UserRole } from '../api/auth.api';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  switchRoleDemo: (role: UserRole) => Promise<void>;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
  canControl: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Thông tin tài khoản mẫu mặc định
export const DEMO_CREDENTIALS: Record<UserRole, { email: string; pass: string; title: string; desc: string }> = {
  ADMIN: {
    email: 'admin@firealert.iot',
    pass: 'Admin@123456',
    title: 'Quản trị viên (Admin)',
    desc: 'Toàn quyền cấu hình, xem mọi thiết bị & gửi lệnh',
  },
  OPERATOR: {
    email: 'operator@firealert.iot',
    pass: 'Operator@123456',
    title: 'Kỹ thuật viên (Operator)',
    desc: 'Điều khiển & cấu hình các thiết bị được phân công',
  },
  VIEWER: {
    email: 'viewer@firealert.iot',
    pass: 'Viewer@123456',
    title: 'Giám sát viên (Viewer)',
    desc: 'Chỉ đọc, bị chặn 403 Forbidden nếu gửi lệnh điều khiển',
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('fire_alert_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Khôi phục session khi reload trang
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('fire_alert_token');
      if (savedToken) {
        try {
          const res = await AuthApi.getMe();
          setUser(res.user);
          localStorage.setItem('fire_alert_user', JSON.stringify(res.user));
        } catch {
          // Token hỏng hoặc hết hạn
          localStorage.removeItem('fire_alert_token');
          localStorage.removeItem('fire_alert_user');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await AuthApi.login(email, pass);
      localStorage.setItem('fire_alert_token', res.token);
      localStorage.setItem('fire_alert_user', JSON.stringify(res.user));
      setToken(res.token);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('fire_alert_token');
    localStorage.removeItem('fire_alert_user');
    setToken(null);
    setUser(null);
  };

  // Hàm chuyển đổi vai trò nhanh dành cho chấm thi và demo
  const switchRoleDemo = async (role: UserRole) => {
    const cred = DEMO_CREDENTIALS[role];
    await login(cred.email, cred.pass);
  };

  const isAdmin = user?.role === 'ADMIN';
  const isOperator = user?.role === 'OPERATOR';
  const isViewer = user?.role === 'VIEWER';
  // Viewer không có quyền điều khiển (gọi API sẽ nhận 403)
  const canControl = isAdmin || isOperator;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        switchRoleDemo,
        isAdmin,
        isOperator,
        isViewer,
        canControl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return context;
};
