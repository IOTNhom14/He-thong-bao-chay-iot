import { apiClient } from './client';
import type { UserRole } from './auth.api';

export interface UserItem {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  assigned_devices?: string[];
}

export interface UserDetail extends UserItem {
  isActive: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  assignedDevices: string[];
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: UserRole;
  email: string;
}

export const UserApi = {
  // 1. Lấy danh sách toàn bộ người dùng (Admin)
  async getUsers(): Promise<UserItem[]> {
    const res = await apiClient.get<any>('/users');
    return Array.isArray(res.data) ? res.data : (res.data?.data || []);
  },

  // 2. Lấy chi tiết người dùng kèm danh sách thiết bị được phân công
  async getUserById(id: string): Promise<UserDetail> {
    const res = await apiClient.get<any>(`/users/${id}`);
    const data = res.data?.data || res.data;
    return {
      ...data,
      isActive: data.is_active ?? data.isActive ?? true,
      failedAttempts: data.failed_attempts ?? data.failedAttempts ?? 0,
      lockedUntil: data.locked_until ?? data.lockedUntil ?? null,
      createdAt: data.created_at ?? data.createdAt ?? new Date().toISOString(),
      assignedDevices: data.assigned_devices ?? data.assignedDevices ?? [],
    };
  },

  // 3. Tạo tài khoản người dùng mới (Admin)
  async createUser(input: CreateUserInput): Promise<UserItem> {
    const res = await apiClient.post<any>('/users', input);
    return res.data?.data || res.data;
  },

  // 4. Thay đổi vai trò người dùng (Admin)
  async updateRole(id: string, role: UserRole): Promise<{ id: string; username: string; role: UserRole }> {
    const res = await apiClient.patch<{
      success: boolean;
      message: string;
      data: { id: string; username: string; role: UserRole };
    }>(`/users/${id}/role`, { role });
    return res.data.data;
  },

  // 5. Khóa hoặc Mở khóa tài khoản người dùng (Admin)
  async updateStatus(
    id: string,
    params: { is_active?: boolean; unlock?: boolean }
  ): Promise<{ id: string; username: string; isActive: boolean; failedAttempts: number; lockedUntil: string | null }> {
    const res = await apiClient.patch<{
      success: boolean;
      message: string;
      data: { id: string; username: string; isActive: boolean; failedAttempts: number; lockedUntil: string | null };
    }>(`/users/${id}/status`, params);
    return res.data.data;
  },

  // 6. Xóa người dùng (Admin)
  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/users/${id}`);
    return res.data;
  },

  // 7. Gán thiết bị cho người dùng (Admin)
  async assignDevice(userId: string, deviceId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.post<{ success: boolean; message: string }>(`/users/${userId}/devices`, {
      device_id: deviceId,
    });
    return res.data;
  },

  // 8. Hủy gán thiết bị của người dùng (Admin)
  async removeDevice(userId: string, deviceId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/users/${userId}/devices/${deviceId}`);
    return res.data;
  },
};
