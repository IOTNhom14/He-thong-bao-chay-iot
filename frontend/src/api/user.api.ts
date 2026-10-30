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
  email?: string;
}

export const DEFAULT_DEMO_USERS: UserItem[] = [
  {
    id: 'user_admin_01',
    username: 'admin',
    email: 'admin@hethongbaochay.iot',
    role: 'ADMIN',
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    created_at: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
    assigned_devices: ['ESP32_FIRE_001', 'ESP32_FIRE_002'],
  },
  {
    id: 'user_op_01',
    username: 'operator',
    email: 'operator@hethongbaochay.iot',
    role: 'OPERATOR',
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    created_at: new Date(Date.now() - 3600000 * 24 * 15).toISOString(),
    assigned_devices: ['ESP32_FIRE_001', 'ESP32_FIRE_002'],
  },
  {
    id: 'user_viewer_01',
    username: 'viewer',
    email: 'viewer@hethongbaochay.iot',
    role: 'VIEWER',
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
    created_at: new Date(Date.now() - 3600000 * 24 * 7).toISOString(),
    assigned_devices: [],
  },
];

export const UserApi = {
  // 1. Lấy danh sách toàn bộ người dùng (Admin)
  async getUsers(): Promise<UserItem[]> {
    try {
      const res = await apiClient.get<any>('/users');
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      if (list.length > 0) return list;
    } catch {
      // Backend FastAPI chưa có bảng users độc lập -> sử dụng danh sách mẫu theo RBAC
    }
    return DEFAULT_DEMO_USERS;
  },

  // 2. Lấy chi tiết người dùng kèm danh sách thiết bị được phân công
  async getUserById(id: string): Promise<UserDetail> {
    try {
      const res = await apiClient.get<any>(`/users/${id}`);
      if (res.data) return res.data?.data || res.data;
    } catch {
      // Fallback
    }
    const found = DEFAULT_DEMO_USERS.find((u) => u.id === id || u.username === id) || DEFAULT_DEMO_USERS[0];
    return {
      ...found,
      isActive: found.is_active,
      failedAttempts: found.failed_attempts,
      lockedUntil: found.locked_until,
      createdAt: found.created_at,
      assignedDevices: found.assigned_devices || [],
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
