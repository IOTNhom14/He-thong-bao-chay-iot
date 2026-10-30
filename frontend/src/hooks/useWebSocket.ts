import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeviceStore, type DeviceSnapshot } from '../store/deviceStore';
import type { TelemetryPoint } from '../api/device.api';
import { ackEmitter } from '../utils/ackEmitter';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

interface WebSocketEnvelope {
  type: string;
  device_id?: string;
  data?: any;
  server_ts?: number;
  message?: string;
}

interface UseWebSocketOptions {
  onTelemetry?: (data: TelemetryPoint) => void;
  onStatus?: (data: { device_id: string; status: 'ONLINE' | 'OFFLINE'; reason?: string }) => void;
  onAlarm?: (data: { device_id: string; flame_detected: boolean; local_alarm: boolean; temperature: number; gas_ppm: number; timestamp?: number }) => void;
  onAck?: (data: { command_id: string; device_id: string; status: 'SUCCESS' | 'FAILED'; message: string }) => void;
  onSnapshot?: (data: DeviceSnapshot[]) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef<number>(0);
  const isManuallyClosedRef = useRef<boolean>(false);

  // Lấy các actions từ Zustand Store
  const applySnapshot = useDeviceStore((state) => state.applySnapshot);
  const handleTelemetry = useDeviceStore((state) => state.handleTelemetry);
  const handleStatus = useDeviceStore((state) => state.handleStatus);
  const handleAck = useDeviceStore((state) => state.handleAck);

  // Tính toán thời gian chờ kết nối lại (Exponential Backoff + Jitter)
  const getNextBackoffDelay = useCallback(() => {
    const baseDelay = 1000; // 1 giây
    const maxDelay = 30000; // 30 giây tối đa
    const exponential = Math.min(baseDelay * Math.pow(2, attemptsRef.current), maxDelay);
    // Thêm Jitter ngẫu nhiên 0 - 500ms để tránh thundering herd
    const jitter = Math.floor(Math.random() * 500);
    return exponential + jitter;
  }, []);

  const connect = useCallback(() => {
    if (isManuallyClosedRef.current) return;

    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl || wsUrl === '' || wsUrl === 'none') {
      setConnectionStatus('DISCONNECTED');
      return;
    }

    if (attemptsRef.current >= 5) {
      console.warn('⚠️ [WebSocket]: Không thể kết nối tới server. Đã chuyển sang chế độ cập nhật dữ liệu REST.');
      setConnectionStatus('DISCONNECTED');
      return;
    }

    setConnectionStatus(attemptsRef.current === 0 ? 'CONNECTING' : 'RECONNECTING');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ [WebSocket]: Đã kết nối thành công tới Gateway');
      setConnectionStatus('CONNECTED');
      attemptsRef.current = 0; // Reset số lần thử lại
      setReconnectAttempts(0);

      // Gửi ngay bản tin xác thực { type: "auth", token } trong 5 giây đầu
      const token = localStorage.getItem('fire_alert_token');
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }));
      } else {
        console.warn('⚠️ [WebSocket]: Chưa có token trong localStorage (fire_alert_token)');
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketEnvelope;
        const msgType = (msg.type || '').toLowerCase();
        const deviceId = msg.device_id || msg.data?.device_id;

        switch (msgType) {
          case 'auth_success':
            console.log('🔐 [WebSocket]: Xác thực phiên thành công với Gateway');
            break;

          case 'auth_error':
            console.error('❌ [WebSocket Auth Failed]:', msg.message);
            break;

          case 'snapshot':
            // Đẩy danh sách trạng thái ban đầu vào Zustand store
            if (Array.isArray(msg.data)) {
              applySnapshot(msg.data);
              options.onSnapshot?.(msg.data);
            }
            break;

          case 'telemetry':
            // Đẩy telemetry vào Zustand store theo device_id
            if (msg.data && deviceId) {
              handleTelemetry(deviceId, msg.data);
              options.onTelemetry?.(msg.data);

              // Kiểm tra cảnh báo tức thời
              if (msg.data.flame_detected || msg.data.local_alarm) {
                options.onAlarm?.({
                  device_id: deviceId,
                  flame_detected: msg.data.flame_detected,
                  local_alarm: msg.data.local_alarm,
                  temperature: msg.data.temperature,
                  gas_ppm: msg.data.gas_ppm,
                  timestamp: msg.data.timestamp,
                });
              }
            }
            break;

          case 'status':
            // Cập nhật trạng thái ONLINE/OFFLINE vào Zustand store theo device_id
            if (msg.data && deviceId) {
              handleStatus(deviceId, msg.data.status, msg.data.reason);
              options.onStatus?.(msg.data);
            }
            break;

          case 'ack':
            // Cập nhật phản hồi ACK lệnh vào Zustand store theo device_id
            if (msg.data && deviceId) {
              handleAck(deviceId, msg.data);
              options.onAck?.(msg.data);
              ackEmitter.emit({
                command_id: msg.data.command_id,
                device_id: deviceId,
                status: msg.data.status,
                message: msg.data.message,
              });
            }
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('⚠️ [WebSocket Parse Error]:', err);
      }
    };

    ws.onclose = (event) => {
      setConnectionStatus('DISCONNECTED');
      console.warn(`🔌 [WebSocket]: Kết nối đóng (Mã: ${event.code}, Lý do: ${event.reason || 'None'})`);

      // Nếu token sai/hết hạn (4003) hoặc đóng thủ công -> Không tự reconnect
      if (event.code === 4003 || isManuallyClosedRef.current) {
        console.warn('🛑 [WebSocket]: Token không hợp lệ hoặc đóng thủ công. Dừng kết nối lại.');
        return;
      }

      // Kích hoạt kết nối lại với thuật toán Exponential Backoff
      const nextDelay = getNextBackoffDelay();
      attemptsRef.current += 1;
      setReconnectAttempts(attemptsRef.current);

      console.log(`🔄 [WebSocket]: Thử kết nối lại lần ${attemptsRef.current} sau ${Math.round(nextDelay / 1000)}s...`);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, nextDelay);
    };

    ws.onerror = (err) => {
      console.error('❌ [WebSocket Lỗi]:', err);
      ws.close();
    };
  }, [applySnapshot, handleTelemetry, handleStatus, handleAck, getNextBackoffDelay, options]);

  // Gửi bản tin thủ công lên WebSocket server
  const send = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    isManuallyClosedRef.current = false;
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected: connectionStatus === 'CONNECTED',
    connectionStatus,
    reconnectAttempts,
    send,
  };
};
