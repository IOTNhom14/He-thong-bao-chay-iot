import { apiClient } from './client';

export interface ThresholdSettings {
  temp_threshold: number;
  gas_threshold: number;
}

export const SettingsApi = {
  // Lấy cấu hình ngưỡng toàn cục (Admin)
  async getThresholds(): Promise<ThresholdSettings> {
    try {
      const res = await apiClient.get<any>('/settings/thresholds');
      return res.data?.data || res.data || { temp_threshold: 55, gas_threshold: 400 };
    } catch {
      return { temp_threshold: 55, gas_threshold: 400 };
    }
  },

  // Cập nhật cấu hình ngưỡng toàn cục (Admin)
  async updateThresholds(settings: ThresholdSettings): Promise<ThresholdSettings> {
    try {
      const res = await apiClient.put<any>('/settings/thresholds', settings);
      return res.data?.data || res.data || settings;
    } catch {
      return settings;
    }
  },
};
