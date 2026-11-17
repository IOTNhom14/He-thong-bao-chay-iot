import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthApi, type UserProfile } from '../api/auth.api';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
  canControl: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    const res = await AuthApi.login(email, pass);
    localStorage.setItem('fire_alert_token', res.token);
    localStorage.setItem('fire_alert_user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('fire_alert_token');
    localStorage.removeItem('fire_alert_user');
    setToken(null);
    setUser(null);
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
