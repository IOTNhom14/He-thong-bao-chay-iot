import { create } from 'zustand';
import type { DeviceItem, TelemetryPoint } from '../api/device.api';

export interface DeviceSnapshot {
  device_id: string;
  status: 'ONLINE' | 'OFFLINE' | 'DECOMMISSIONED';
  telemetry?: TelemetryPoint;
  last_seen?: number;
}

export interface AckItem {
  command_id: string;
  device_id: string;
  status: 'SUCCESS' | 'FAILED';
  message: string;
  timestamp: number;
}

export interface AlarmItem {
  device_id: string;
  flame_detected: boolean;
  local_alarm: boolean;
  temperature: number;
  gas_ppm: number;
  timestamp: number;
}

interface DeviceState {
  // Bản đồ thiết bị theo device_id
  devices: Record<string, DeviceItem>;
  // Lịch sử chuỗi dữ liệu đo đạc cảm biến theo device_id (dùng vẽ đồ thị recharts)
  telemetryByDevice: Record<string, TelemetryPoint[]>;
  // Trạng thái kết nối gần nhất theo device_id
  statusByDevice: Record<string, 'ONLINE' | 'OFFLINE' | 'DECOMMISSIONED'>;
  // Phản hồi lệnh gần nhất theo device_id
  acksByDevice: Record<string, AckItem>;
  // Cảnh báo sự cố hiện tại theo device_id
  alarmsByDevice: Record<string, AlarmItem | null>;

  // Actions cập nhật store
  setDevices: (devices: DeviceItem[]) => void;
  applySnapshot: (snapshots: DeviceSnapshot[]) => void;
  handleTelemetry: (deviceId: string, telemetry: TelemetryPoint) => void;
  handleStatus: (deviceId: string, status: 'ONLINE' | 'OFFLINE' | 'DECOMMISSIONED', reason?: string) => void;
  handleAck: (deviceId: string, ack: { command_id: string; status: 'SUCCESS' | 'FAILED'; message: string }) => void;
  clearAlarm: (deviceId: string) => void;
  reset: () => void;
}

const MAX_HISTORY_POINTS = 50;

export const useDeviceStore = create<DeviceState>((set) => ({
  devices: {},
  telemetryByDevice: {},
  statusByDevice: {},
  acksByDevice: {},
  alarmsByDevice: {},

  setDevices: (deviceList) =>
    set((state) => {
      const nextDevices = { ...state.devices };
      const nextStatus = { ...state.statusByDevice };

      for (const dev of deviceList) {
        nextDevices[dev.id] = { ...nextDevices[dev.id], ...dev };
        nextStatus[dev.id] = dev.status;
      }
      return { devices: nextDevices, statusByDevice: nextStatus };
    }),

  applySnapshot: (snapshots) =>
    set((state) => {
      const nextDevices = { ...state.devices };
      const nextStatus = { ...state.statusByDevice };
      const nextTelemetry = { ...state.telemetryByDevice };

      for (const snap of snapshots) {
        const devId = snap.device_id;
        nextStatus[devId] = snap.status;

        if (nextDevices[devId]) {
          nextDevices[devId] = {
            ...nextDevices[devId],
            status: snap.status,
            latest_temp: snap.telemetry?.temperature,
            latest_gas: snap.telemetry?.gas_ppm,
            latest_humidity: snap.telemetry?.humidity,
            latest_flame: snap.telemetry?.flame_detected,
            latest_alarm: snap.telemetry?.local_alarm,
            is_muted: snap.telemetry?.is_muted ?? nextDevices[devId].is_muted,
            latest_telemetry_time: snap.telemetry?.timestamp,
          };
        }

        if (snap.telemetry) {
          const currentList = nextTelemetry[devId] || [];
          nextTelemetry[devId] = [...currentList, snap.telemetry].slice(-MAX_HISTORY_POINTS);
        }
      }

      return {
        devices: nextDevices,
        statusByDevice: nextStatus,
        telemetryByDevice: nextTelemetry,
      };
    }),

  handleTelemetry: (deviceId, telemetry) =>
    set((state) => {
      // 1. Cập nhật thiết bị
      const existing = state.devices[deviceId];
      const updatedDevice: DeviceItem = existing
        ? {
            ...existing,
            status: 'ONLINE',
            latest_temp: telemetry.temperature,
            latest_gas: telemetry.gas_ppm,
            latest_humidity: telemetry.humidity,
            latest_flame: telemetry.flame_detected,
            latest_alarm: telemetry.local_alarm,
            is_muted: telemetry.is_muted,
            latest_telemetry_time: telemetry.timestamp,
          }
        : {
            id: deviceId,
            name: `Thiết bị ${deviceId}`,
            location: 'Vị trí tự động nhận',
            status: 'ONLINE',
            temp_threshold: 55,
            gas_threshold: 400,
            is_muted: telemetry.is_muted,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            latest_temp: telemetry.temperature,
            latest_gas: telemetry.gas_ppm,
            latest_humidity: telemetry.humidity,
            latest_flame: telemetry.flame_detected,
            latest_alarm: telemetry.local_alarm,
            latest_telemetry_time: telemetry.timestamp,
          };

      // 2. Thêm vào chuỗi lịch sử biểu đồ
      const currentPoints = state.telemetryByDevice[deviceId] || [];
      const updatedPoints = [...currentPoints, telemetry].slice(-MAX_HISTORY_POINTS);

      // 3. Quản lý trạng thái cảnh báo cháy / khí gas
      const isAlarmActive = telemetry.flame_detected || telemetry.local_alarm;
      const updatedAlarm: AlarmItem | null = isAlarmActive
        ? {
            device_id: deviceId,
            flame_detected: telemetry.flame_detected,
            local_alarm: telemetry.local_alarm,
            temperature: telemetry.temperature,
            gas_ppm: telemetry.gas_ppm,
            timestamp: telemetry.timestamp,
          }
        : null;

      return {
        devices: { ...state.devices, [deviceId]: updatedDevice },
        telemetryByDevice: { ...state.telemetryByDevice, [deviceId]: updatedPoints },
        statusByDevice: { ...state.statusByDevice, [deviceId]: 'ONLINE' },
        alarmsByDevice: { ...state.alarmsByDevice, [deviceId]: updatedAlarm },
      };
    }),

  handleStatus: (deviceId, status) =>
    set((state) => {
      const existing = state.devices[deviceId];
      const updatedDevices = existing
        ? { ...state.devices, [deviceId]: { ...existing, status } }
        : state.devices;

      return {
        devices: updatedDevices,
        statusByDevice: { ...state.statusByDevice, [deviceId]: status },
      };
    }),

  handleAck: (deviceId, ack) =>
    set((state) => ({
      acksByDevice: {
        ...state.acksByDevice,
        [deviceId]: {
          ...ack,
          device_id: deviceId,
          timestamp: Date.now(),
        },
      },
    })),

  clearAlarm: (deviceId) =>
    set((state) => ({
      alarmsByDevice: {
        ...state.alarmsByDevice,
        [deviceId]: null,
      },
    })),

  reset: () =>
    set({
      devices: {},
      telemetryByDevice: {},
      statusByDevice: {},
      acksByDevice: {},
      alarmsByDevice: {},
    }),
}));
