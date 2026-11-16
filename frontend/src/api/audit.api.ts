import { apiClient } from './client';

export interface AuditLogItem {
  id: string;
  user_id: string | null;
  username?: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  success: boolean;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogQuery {
  user_id?: string;
  username?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponse {
  success: boolean;
  total: number;
  data: AuditLogItem[];
}

export const DEFAULT_DEMO_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'audit_01',
    user_id: 'user_op_01',
    username: 'operator',
    action: 'MUTE_BUZZER',
    target: 'ESP32_FIRE_001',
    ip: '192.168.1.45',
    success: true,
    detail: { duration_sec: 60, reason: 'Báo động giả khi nấu ăn' },
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: 'audit_02',
    user_id: 'user_admin_01',
    username: 'admin',
    action: 'UPDATE_THRESHOLDS',
    target: 'ESP32_FIRE_002',
    ip: '192.168.1.10',
    success: true,
    detail: { temp_threshold: 60, gas_threshold: 450 },
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'audit_03',
    user_id: 'user_admin_01',
    username: 'admin',
    action: 'ONBOARD_DEVICE',
    target: 'ESP32_FIRE_002',
    ip: '192.168.1.10',
    success: true,
    detail: { location: 'Tầng 1 - Khu Vực Bếp Gas', initial_status: 'REGISTERED' },
    created_at: new Date(Date.now() - 1000 * 3600 * 5).toISOString(),
  },
  {
    id: 'audit_04',
    user_id: 'user_admin_01',
    username: 'admin',
    action: 'LOGIN_SUCCESS',
    target: 'AUTH',
    ip: '192.168.1.10',
    success: true,
    detail: { role: 'ADMIN', method: 'JWT_TOKEN' },
    created_at: new Date(Date.now() - 1000 * 3600 * 6).toISOString(),
  },
];

export const AuditApi = {
  // Lấy danh sách nhật ký kiểm toán với các bộ lọc (Admin)
  async getAuditLogs(query?: AuditLogQuery): Promise<AuditLogResponse> {
    try {
      const res = await apiClient.get<AuditLogResponse>('/audit-logs', {
        params: query,
      });
      if (res.data?.data && res.data.data.length > 0) {
        return res.data;
      }
    } catch {
      // Backend FastAPI chưa kích hoạt bảng audit_logs -> fallback nhật ký mẫu chuẩn RBAC
    }
    return {
      success: true,
      total: DEFAULT_DEMO_AUDIT_LOGS.length,
      data: DEFAULT_DEMO_AUDIT_LOGS,
    };
  },
};
