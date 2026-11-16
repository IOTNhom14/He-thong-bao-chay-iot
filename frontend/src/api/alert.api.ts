import { apiClient } from './client';

export interface AlertItem {
  id: string;
  device_id: string;
  alert_type: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  resolved: boolean;
  resolved_at: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
}

export const AlertApi = {
  // Lấy danh sách cảnh báo (chuẩn hóa cả schema FastAPI và Gateway)
  async getAlerts(deviceId?: string): Promise<AlertItem[]> {
    const res = await apiClient.get<any>('/alerts', {
      params: deviceId ? { device_id: deviceId } : undefined,
    });
    const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    return list.map((item) => ({
      id: String(item.id),
      device_id: item.device_id,
      alert_type: item.alert_type || 'CANH_BAO',
      message:
        item.message ||
        (item.alert_type === 'FIRE_EMERGENCY'
          ? `Phát hiện Lửa khẩn cấp tại ${item.device_id}!`
          : item.alert_type === 'SMOKE_WARNING'
          ? `Nồng độ khói vượt ngưỡng (${item.trigger_value} > ${item.threshold_value})`
          : `Cảnh báo nhiệt độ cao (${item.trigger_value}°C)`),
      severity:
        item.severity ||
        (item.alert_type === 'FIRE_EMERGENCY' ? 'CRITICAL' : item.alert_type === 'SMOKE_WARNING' ? 'WARNING' : 'INFO'),
      resolved: item.resolved ?? (item.status === 'ACKNOWLEDGED' || item.status === 'RESOLVED'),
      resolved_at: item.resolved_at || null,
      acknowledged_by: item.acknowledged_by || null,
      acknowledged_at: item.acknowledged_at || item.resolved_at || null,
      created_at: item.triggered_at || item.created_at || new Date().toISOString(),
    }));
  },

  // Xác nhận giải quyết cảnh báo (Hỗ trợ PUT FastAPI và POST Gateway)
  async acknowledgeAlert(alertId: string | number): Promise<AlertItem> {
    try {
      const res = await apiClient.put<any>(`/alerts/${alertId}/acknowledge`);
      return res.data?.data || res.data;
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 405) {
        const res = await apiClient.post<any>(`/alerts/${alertId}/acknowledge`);
        return res.data?.data || res.data;
      }
      throw err;
    }
  },
};
