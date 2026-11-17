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

export const AuditApi = {
  // Lấy danh sách nhật ký kiểm toán với các bộ lọc (Admin)
  async getAuditLogs(query?: AuditLogQuery): Promise<AuditLogResponse> {
    const res = await apiClient.get<AuditLogResponse>('/audit-logs', {
      params: query,
    });
    return res.data;
  },
};
