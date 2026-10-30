import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CommandApi, type CommandAction } from '../api/command.api';
import { AlertApi } from '../api/alert.api';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { ackEmitter, type AckPayload } from '../utils/ackEmitter';

export interface PendingCommand {
  commandId: string;
  deviceId: string;
  action: CommandAction;
  label: string;
  startedAt: number;
}

interface CommandTrackerContextType {
  pendingCommands: Record<string, PendingCommand>;
  isDeviceWaitingAck: (deviceId: string) => boolean;
  isCommandWaitingAck: (commandId: string) => boolean;
  executeCommand: (
    deviceId: string,
    action: CommandAction,
    params?: Record<string, unknown>,
    label?: string
  ) => Promise<{ success: boolean; command_id: string } | null>;
  acknowledgeAlert: (alertId: string, alertType?: string) => Promise<boolean>;
}

const CommandTrackerContext = createContext<CommandTrackerContextType | undefined>(undefined);

const COMMAND_TIMEOUT_MS = 10000; // 10 giây timeout theo yêu cầu đề bài

export const CommandTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isViewer } = useAuth();
  const { addToast, updateToast, showError, showSuccess } = useToast();

  const [pendingCommands, setPendingCommands] = useState<Record<string, PendingCommand>>({});
  const timeoutTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingCommandsRef = useRef<Record<string, PendingCommand>>({});

  // Luôn đồng bộ ref để tránh closure stale trong setTimeout và WebSocket callbacks
  useEffect(() => {
    pendingCommandsRef.current = pendingCommands;
  }, [pendingCommands]);

  // Lắng nghe các bản tin ACK từ WebSocket thông qua ackEmitter
  useEffect(() => {
    const unsubscribe = ackEmitter.subscribe((ack: AckPayload) => {
      const { command_id, status, message } = ack;
      const cmd = pendingCommandsRef.current[command_id];

      if (cmd) {
        // 1. Xóa timer timeout 10s
        if (timeoutTimersRef.current[command_id]) {
          clearTimeout(timeoutTimersRef.current[command_id]);
          delete timeoutTimersRef.current[command_id];
        }

        // 2. Xóa khỏi danh sách chờ ACK
        setPendingCommands((prev) => {
          const next = { ...prev };
          delete next[command_id];
          return next;
        });

        // 3. Hiển thị Toast thông báo kết quả từ ESP32
        if (status === 'SUCCESS') {
          updateToast(command_id, {
            type: 'success',
            title: `ESP32 phản hồi thành công: ${cmd.label}`,
            message: `Thiết bị ${cmd.deviceId} xác nhận: ${message || 'Lệnh đã được thực thi thành công'} [${command_id}]`,
            duration: 5000,
          });
        } else {
          updateToast(command_id, {
            type: 'error',
            title: `ESP32 báo lỗi thực thi: ${cmd.label}`,
            message: `Thiết bị ${cmd.deviceId} từ chối: ${message || 'Thực thi lệnh thất bại'} [${command_id}]`,
            duration: 7000,
          });
        }
      }
    });

    return () => {
      unsubscribe();
      // Cleanup all pending timers on unmount
      Object.values(timeoutTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, [updateToast]);

  const isDeviceWaitingAck = useCallback(
    (deviceId: string) => {
      return Object.values(pendingCommands).some((c) => c.deviceId === deviceId);
    },
    [pendingCommands]
  );

  const isCommandWaitingAck = useCallback(
    (commandId: string) => {
      return Boolean(pendingCommands[commandId]);
    },
    [pendingCommands]
  );

  // Gửi lệnh điều khiển & khởi tạo chu trình chờ ACK khớp command_id với timeout 10s
  const executeCommand = useCallback(
    async (
      deviceId: string,
      action: CommandAction,
      params: Record<string, unknown> = {},
      label?: string
    ) => {
      const displayLabel =
        label ||
        (action === 'MUTE_BUZZER'
          ? `Tắt còi (${params.duration_sec || 60}s)`
          : action === 'TEST_ALARM'
          ? 'Thử nghiệm còi'
          : action === 'UPDATE_THRESHOLD'
          ? 'Đổi ngưỡng cảm biến'
          : action);

      // Chặn phía Client với tài khoản VIEWER (kèm cảnh báo chốt chặn Backend)
      if (isViewer) {
        showError(
          'Từ chối truy cập (HTTP 403 Forbidden)',
          `Tài khoản vai trò VIEWER (Chỉ đọc) không có quyền gửi lệnh [${displayLabel}]. Backend Gateway sẽ chặn thao tác này.`
        );
        return null;
      }

      try {
        // Gửi POST request lên Gateway
        const res = await CommandApi.sendCommand(deviceId, action, params);
        const commandId = res.command_id;

        // Đưa vào danh sách chờ phản hồi ACK từ WebSocket
        const newCmd: PendingCommand = {
          commandId,
          deviceId,
          action,
          label: displayLabel,
          startedAt: Date.now(),
        };

        setPendingCommands((prev) => ({
          ...prev,
          [commandId]: newCmd,
        }));

        // Hiển thị Toast chờ phản hồi ACK (duration = 0 để không tự tắt trước khi có kết quả)
        addToast({
          id: commandId,
          type: 'pending',
          title: `Đang gửi lệnh: ${displayLabel}`,
          message: `Mã lệnh: ${commandId}. Đang đợi phản hồi ACK từ ESP32 qua WebSocket... (Tối đa 10s)`,
          duration: 0,
        });

        // Thiết lập bộ đếm thời gian Timeout 10 giây
        timeoutTimersRef.current[commandId] = setTimeout(() => {
          // Kiểm tra xem lệnh còn đang chờ không
          if (pendingCommandsRef.current[commandId]) {
            setPendingCommands((prev) => {
              const next = { ...prev };
              delete next[commandId];
              return next;
            });
            delete timeoutTimersRef.current[commandId];

            // Hiển thị Toast cảnh báo Timeout
            updateToast(commandId, {
              type: 'error',
              title: `Hết thời gian chờ (Timeout 10s) - ${displayLabel}`,
              message: `Thiết bị ${deviceId} không phản hồi ACK sau 10 giây cho mã lệnh [${commandId}]. Thiết bị có thể đang ngoại tuyến hoặc mất kết nối MQTT.`,
              duration: 8000,
            });
          }
        }, COMMAND_TIMEOUT_MS);

        return res;
      } catch (err: any) {
        const status = err.response?.status;
        const errorMsg = err.response?.data?.error || err.message;

        if (status === 403) {
          showError(
            'Bị chặn (HTTP 403 Forbidden)',
            `Backend từ chối lệnh [${displayLabel}]: Bạn không có quyền điều khiển thiết bị ${deviceId}.`
          );
        } else {
          showError(`Lỗi phát lệnh [${displayLabel}]`, `${errorMsg} (Mã lỗi: ${status || 'Network'})`);
        }
        return null;
      }
    },
    [isViewer, showError, addToast, updateToast]
  );

  // Xử lý xác nhận giải quyết cảnh báo
  const acknowledgeAlert = useCallback(
    async (alertId: string, alertType?: string) => {
      const typeLabel = alertType ? ` (${alertType})` : '';

      if (isViewer) {
        showError(
          'Từ chối truy cập (HTTP 403)',
          'Tài khoản VIEWER (Chỉ đọc) không có quyền xác nhận xử lý sự cố này.'
        );
        return false;
      }

      try {
        await AlertApi.acknowledgeAlert(alertId);
        showSuccess(
          'Đã xác nhận xử lý',
          `Sự cố cảnh báo #${alertId}${typeLabel} đã được lưu nhận dạng xử lý thành công.`
        );
        return true;
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message;
        showError(`Không thể xác nhận cảnh báo #${alertId}`, msg);
        return false;
      }
    },
    [isViewer, showError, showSuccess]
  );

  return (
    <CommandTrackerContext.Provider
      value={{
        pendingCommands,
        isDeviceWaitingAck,
        isCommandWaitingAck,
        executeCommand,
        acknowledgeAlert,
      }}
    >
      {children}
    </CommandTrackerContext.Provider>
  );
};

export const useCommandTracker = (): CommandTrackerContextType => {
  const context = useContext(CommandTrackerContext);
  if (!context) {
    throw new Error('useCommandTracker phải được dùng bên trong CommandTrackerProvider');
  }
  return context;
};
