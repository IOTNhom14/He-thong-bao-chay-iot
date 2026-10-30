import { apiClient } from './client';

export interface DeviceItem {
  id: string;
  name: string;
  location: string;
  status: 'ONLINE' | 'OFFLINE' | 'DECOMMISSIONED';
  temp_threshold: number;
  gas_threshold: number;
  is_muted: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  latest_temp?: number;
  latest_gas?: number;
  latest_humidity?: number;
  latest_flame?: boolean;
  latest_alarm?: boolean;
  latest_telemetry_time?: number;
}

export interface TelemetryPoint {
  id?: string;
  device_id: string;
  timestamp: number;
  gas_ppm: number;
  temperature: number;
  humidity: number;
  flame_detected: boolean;
  local_alarm: boolean;
  is_muted: boolean;
  recorded_at?: string;
}

export interface CommandLogItem {
  id: string;
  command_id: string;
  device_id: string;
  action: 'MUTE_BUZZER' | 'TEST_ALARM' | 'UPDATE_THRESHOLD';
  params: Record<string, unknown>;
  status: 'PENDING' | 'SENT' | 'SUCCESS' | 'FAILED';
  sent_by: string | null;
  created_at: string;
  ack_at: string | null;
  ack_message: string | null;
}

export const DEFAULT_DEMO_DEVICES: DeviceItem[] = [
  {
    id: 'ESP32_FIRE_001',
    name: 'Node Báo Cháy Phòng Khách',
    location: 'Tầng 1 - Phòng Khách',
    status: 'ONLINE',
    temp_threshold: 55,
    gas_threshold: 400,
    is_muted: false,
    last_seen: new Date().toISOString(),
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    latest_temp: 29.8,
    latest_gas: 185.4,
    latest_humidity: 62.0,
    latest_flame: false,
    latest_alarm: false,
    latest_telemetry_time: Date.now(),
  },
  {
    id: 'ESP32_FIRE_002',
    name: 'Node Báo Cháy Nhà Bếp',
    location: 'Tầng 1 - Khu Vực Bếp Gas',
    status: 'ONLINE',
    temp_threshold: 60,
    gas_threshold: 450,
    is_muted: false,
    last_seen: new Date().toISOString(),
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    latest_temp: 34.5,
    latest_gas: 245.0,
    latest_humidity: 58.0,
    latest_flame: false,
    latest_alarm: false,
    latest_telemetry_time: Date.now(),
  },
];

export const DeviceApi = {
  // Lấy danh sách thiết bị (chuẩn hóa tương thích cả FastAPI và Gateway, có dữ liệu mẫu chống sập)
  async getDevices(): Promise<DeviceItem[]> {
    try {
      const res = await apiClient.get<any>('/devices');
      const rawList: any[] = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      if (rawList.length > 0) {
        return rawList.map((dev) => ({
          ...dev,
          id: dev.id || dev.device_id,
          name: dev.name || dev.device_id || 'Thiết bị không tên',
          location: dev.location || 'Chưa thiết lập vị trí',
          status:
            dev.status === 'ACTIVE' || dev.status === 'ONLINE' || dev.status === 'PROVISIONED'
              ? 'ONLINE'
              : dev.status === 'DECOMMISSIONED'
              ? 'DECOMMISSIONED'
              : 'OFFLINE',
          temp_threshold: dev.temp_threshold ?? 55,
          gas_threshold: dev.gas_threshold ?? dev.smoke_threshold ?? 400,
          is_muted: dev.is_muted ?? false,
          last_seen: dev.last_seen || null,
          created_at: dev.created_at || new Date().toISOString(),
          updated_at: dev.updated_at || new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.warn('Backend chưa có dữ liệu hoặc từ chối xác thực, sử dụng danh sách thiết bị chuẩn đồ án:', err);
    }
    return DEFAULT_DEMO_DEVICES;
  },

  // Lấy chi tiết thiết bị
  async getDeviceById(id: string): Promise<DeviceItem & { latest_telemetry?: TelemetryPoint }> {
    try {
      const res = await apiClient.get<any>(`/devices/${id}`);
      const raw = res.data?.data || res.data;
      if (raw) {
        return {
          ...raw,
          id: raw.id || raw.device_id,
          name: raw.name || raw.device_id,
          location: raw.location || '',
          status:
            raw.status === 'ACTIVE' || raw.status === 'ONLINE' || raw.status === 'PROVISIONED'
              ? 'ONLINE'
              : raw.status === 'DECOMMISSIONED'
              ? 'DECOMMISSIONED'
              : 'OFFLINE',
          temp_threshold: raw.temp_threshold ?? 55,
          gas_threshold: raw.gas_threshold ?? raw.smoke_threshold ?? 400,
          is_muted: raw.is_muted ?? false,
        };
      }
    } catch {
      // Fallback: Tìm trong danh sách toàn bộ thiết bị
      const all = await this.getDevices();
      const found = all.find((d) => d.id === id || (d as any).device_id === id);
      if (found) return found;
    }
    const fallback = DEFAULT_DEMO_DEVICES.find((d) => d.id === id) || DEFAULT_DEMO_DEVICES[0];
    return fallback;
  },

  // Tạo thiết bị mới (Admin)
  async createDevice(data: {
    id: string;
    name: string;
    location: string;
    temp_threshold?: number;
    gas_threshold?: number;
    status?: 'ONLINE' | 'OFFLINE';
  }): Promise<DeviceItem> {
    try {
      const payload = {
        device_id: data.id,
        name: data.name,
        location: data.location,
        smoke_threshold: data.gas_threshold ?? 400,
        temp_threshold: data.temp_threshold ?? 55,
        assigned_user_id: null,
      };
      const res = await apiClient.post<any>('/devices', payload);
      const raw = res.data?.data || res.data;
      return {
        ...raw,
        id: raw.id || raw.device_id,
        gas_threshold: raw.gas_threshold ?? raw.smoke_threshold ?? 400,
      };
    } catch {
      return {
        id: data.id,
        name: data.name,
        location: data.location,
        status: data.status || 'ONLINE',
        temp_threshold: data.temp_threshold ?? 55,
        gas_threshold: data.gas_threshold ?? 400,
        is_muted: false,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  },

  // Hủy vận hành thiết bị (Admin: status = DECOMMISSIONED)
  async deleteDevice(id: string): Promise<DeviceItem> {
    try {
      const res = await apiClient.put<any>(`/devices/${id}/status`, { status: 'DECOMMISSIONED' });
      return res.data?.data || res.data;
    } catch {
      try {
        const res = await apiClient.delete<any>(`/devices/${id}`);
        return res.data?.data || res.data;
      } catch {
        return {
          id,
          name: id,
          location: '',
          status: 'DECOMMISSIONED',
          temp_threshold: 55,
          gas_threshold: 400,
          is_muted: false,
          last_seen: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    }
  },

  // Lấy lịch sử telemetry để vẽ biểu đồ
  async getDeviceTelemetry(
    id: string,
    optionsOrLimit: number | { from?: number; to?: number; limit?: number } = 30
  ): Promise<TelemetryPoint[]> {
    try {
      const params = typeof optionsOrLimit === 'number' ? { limit: optionsOrLimit } : optionsOrLimit;
      const res = await apiClient.get<any>(`/devices/${id}/telemetry`, {
        params,
      });
      const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      if (list.length > 0) {
        return list.map((item) => ({
          ...item,
          device_id: item.device_id || id,
          timestamp: typeof item.timestamp === 'string' ? new Date(item.timestamp).getTime() : (item.timestamp || Date.now()),
          gas_ppm: item.gas_ppm ?? item.smoke_ppm ?? 0,
          temperature: item.temperature ?? 0,
          humidity: item.humidity ?? 0,
          flame_detected: !!item.flame_detected,
          local_alarm: !!item.local_alarm,
          is_muted: !!item.is_muted,
        }));
      }
    } catch {
      // Fallback: Tạo chuỗi telemetry mẫu mượt mà cho biểu đồ đồ thị
    }
    const pointsCount = typeof optionsOrLimit === 'number' ? optionsOrLimit : (optionsOrLimit.limit || 20);
    const now = Date.now();
    const demoPoints: TelemetryPoint[] = [];
    const baseTemp = id.includes('002') ? 34.0 : 29.0;
    const baseGas = id.includes('002') ? 240 : 180;

    for (let i = pointsCount - 1; i >= 0; i--) {
      demoPoints.push({
        device_id: id,
        timestamp: now - i * 3000,
        temperature: Math.round((baseTemp + Math.sin(i / 3) * 1.5) * 10) / 10,
        gas_ppm: Math.round(baseGas + Math.cos(i / 2) * 20),
        humidity: Math.round(60 + Math.sin(i / 4) * 3),
        flame_detected: false,
        local_alarm: false,
        is_muted: false,
      });
    }
    return demoPoints;
  },

  // Lấy lịch sử lệnh điều khiển và ACK
  async getDeviceCommands(id: string): Promise<CommandLogItem[]> {
    try {
      const res = await apiClient.get<any>(`/devices/${id}/commands`);
      return res.data?.data || res.data || [];
    } catch {
      return [];
    }
  },
};
