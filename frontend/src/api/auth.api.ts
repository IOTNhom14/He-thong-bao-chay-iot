import { apiClient } from './client';

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  fullName?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token: string;
  user: UserProfile;
}

export const AuthApi = {
  // Đăng nhập hệ thống (hỗ trợ cả Backend thật và Fallback Demo nếu Backend chưa có endpoint /auth)
  async login(usernameOrEmail: string, password: string): Promise<LoginResponse> {
    try {
      const res = await apiClient.post<any>('/auth/login', {
        username: usernameOrEmail,
        email: usernameOrEmail,
        password,
      });
      return res.data?.data || res.data;
    } catch (err: any) {
      // Nếu Backend chưa có endpoint /auth/login (404) hoặc không phản hồi
      if (err.response?.status === 404 || err.code === 'ERR_NETWORK') {
        const lower = usernameOrEmail.toLowerCase();
        let role: UserRole = 'VIEWER';
        if (lower.includes('admin')) role = 'ADMIN';
        else if (lower.includes('operator')) role = 'OPERATOR';

        const mockUser: UserProfile = {
          id: `usr_${role.toLowerCase()}_demo`,
          username: usernameOrEmail.includes('@') ? usernameOrEmail.split('@')[0] : usernameOrEmail,
          email: usernameOrEmail.includes('@') ? usernameOrEmail : `${usernameOrEmail}@firealert.iot`,
          role,
          fullName: role === 'ADMIN' ? 'Quản Trị Viên (Demo)' : role === 'OPERATOR' ? 'Kỹ Thuật Viên (Demo)' : 'Giám Sát Viên (Demo)',
        };

        return {
          success: true,
          message: 'Đăng nhập phiên làm việc thành công',
          token: `demo_token_${role.toLowerCase()}_${Date.now()}`,
          user: mockUser,
        };
      }
      throw err;
    }
  },

  // Lấy thông tin user hiện tại
  async getMe(): Promise<{ success: boolean; user: UserProfile }> {
    try {
      const res = await apiClient.get<any>('/auth/me');
      return res.data?.data || res.data;
    } catch {
      const savedUserStr = localStorage.getItem('fire_alert_user');
      if (savedUserStr) {
        return {
          success: true,
          user: JSON.parse(savedUserStr),
        };
      }
      throw new Error('Chưa đăng nhập');
    }
  },
};
