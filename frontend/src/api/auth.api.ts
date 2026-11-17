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
  // Đăng nhập hệ thống qua credentials chính thức
  async login(usernameOrEmail: string, password: string): Promise<LoginResponse> {
    const res = await apiClient.post<LoginResponse | { data: LoginResponse }>('/auth/login', {
      username: usernameOrEmail,
      email: usernameOrEmail,
      password,
    });
    const payload = 'data' in res.data && res.data.data ? res.data.data : (res.data as LoginResponse);
    return payload;
  },

  // Lấy thông tin user hiện tại từ token xác thực
  async getMe(): Promise<{ success: boolean; user: UserProfile }> {
    const res = await apiClient.get<{ success: boolean; user: UserProfile } | { data: { success: boolean; user: UserProfile } }>('/auth/me');
    const payload = 'data' in res.data && res.data.data ? res.data.data : res.data;
    return payload as { success: boolean; user: UserProfile };
  },
};
