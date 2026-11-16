import { apiClient } from './client';

export type CommandAction = 'MUTE_BUZZER' | 'TEST_ALARM' | 'UPDATE_THRESHOLD';

export interface SendCommandResponse {
  success: boolean;
  message: string;
  command_id: string;
}

export interface CommandStatus {
  command_id: string;
  status: 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMEOUT';
  ack_message?: string | null;
}

export const CommandApi = {
  // Gửi lệnh điều khiển tới thiết bị qua HTTP API (FastAPI /devices/{id}/control hoặc Gateway)
  async sendCommand(
    deviceId: string,
    action: CommandAction,
    params: Record<string, unknown> = {}
  ): Promise<SendCommandResponse> {
    try {
      // Ưu tiên endpoint FastAPI của Nhóm 14: POST /devices/{id}/control
      const res = await apiClient.post<any>(`/devices/${deviceId}/control`, {
        action,
        params,
      });
      return {
        success: true,
        message: res.data?.message || 'Đã gửi lệnh điều khiển xuống thiết bị thành công',
        command_id: res.data?.command_id || `cmd_${Date.now()}`,
      };
    } catch (err: any) {
      if (err.response?.status === 404) {
        try {
          // Fallback sang endpoint Gateway: POST /devices/{id}/commands
          const res = await apiClient.post<any>(`/devices/${deviceId}/commands`, {
            action,
            params,
          });
          const data = res.data?.data || res.data;
          return {
            success: true,
            message: data?.message || 'Đã gửi lệnh điều khiển',
            command_id: data?.command_id || `cmd_${Date.now()}`,
          };
        } catch {}
      }
      throw err;
    }
  },

  async getCommandStatus(deviceId: string, commandId: string): Promise<CommandStatus | null> {
    const res = await apiClient.get<any>(`/devices/${deviceId}/commands`);
    const commands: CommandStatus[] = res.data?.data || res.data || [];
    return commands.find((command) => command.command_id === commandId) || null;
  },
};
