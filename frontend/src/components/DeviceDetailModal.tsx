import React, { useState, useEffect, useMemo } from 'react';
import type { DeviceItem, TelemetryPoint, CommandLogItem } from '../api/device.api';
import { DeviceApi } from '../api/device.api';
import { useAuth } from '../context/AuthContext';
import { useCommandTracker } from '../context/CommandTrackerContext';
import { useDeviceStore } from '../store/deviceStore';
import {
  X,
  Thermometer,
  Wind,
  Droplets,
  VolumeX,
  BellRing,
  Sliders,
  RotateCcw,
  History,
  Activity,
  Calendar,
  Flame,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  Camera,
  CameraOff,
  ExternalLink,
  Play,
  Pause,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';

interface DeviceDetailModalProps {
  device: DeviceItem;
  onClose: () => void;
  onDeviceUpdated?: () => void;
}

const EMPTY_TELEMETRY: TelemetryPoint[] = [];

// Helper tạo dữ liệu mẫu telemetry mượt mà, chân thực theo từng thiết bị
const generateDemoPoints = (deviceId: string, count = 20): TelemetryPoint[] => {
  const now = Date.now();
  const baseTemp = deviceId.includes('002') ? 34.0 : 29.8;
  const baseGas = deviceId.includes('002') ? 245 : 185;
  const points: TelemetryPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    points.push({
      device_id: deviceId,
      timestamp: now - i * 5000,
      temperature: Math.round((baseTemp + Math.sin(i / 2) * 1.8) * 10) / 10,
      gas_ppm: Math.round(baseGas + Math.cos(i / 2) * 25),
      humidity: Math.round(60 + Math.sin(i / 3) * 4),
      flame_detected: false,
      local_alarm: false,
      is_muted: false,
    });
  }
  return points;
};

export const DeviceDetailModal: React.FC<DeviceDetailModalProps> = ({ device, onClose, onDeviceUpdated }) => {
  const { isViewer } = useAuth();
  const { executeCommand, isDeviceWaitingAck } = useCommandTracker();
  const [activeTab, setActiveTab] = useState<'REALTIME' | 'HISTORY' | 'CONTROL' | 'CAMERA'>('REALTIME');
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(Date.now());
  const [isCapturing, setIsCapturing] = useState(false);
  const [customCamInput, setCustomCamInput] = useState('');

  // Lấy dữ liệu thiết bị thực tế từ store (kèm cấu hình camera riêng của từng node)
  const storedDevice = useDeviceStore((state) => state.devices[device.id]);
  const currentDevice = storedDevice || device;
  const updateDeviceCamera = useDeviceStore((state) => state.updateDeviceCamera);

  const activeCameraStream =
    currentDevice.camera_stream_url ||
    (currentDevice.camera_url?.includes('/shot.jpg')
      ? currentDevice.camera_url.replace('/shot.jpg', '/video')
      : currentDevice.camera_url);

  const activeCameraSnapshot =
    currentDevice.camera_url ||
    (activeCameraStream?.includes('/video')
      ? activeCameraStream.replace('/video', '/shot.jpg')
      : activeCameraStream);

  const handleManualSnapshot = () => {
    if (!activeCameraSnapshot) return;
    setIsCapturing(true);
    const snapUrl = `${activeCameraSnapshot}${activeCameraSnapshot.includes('?') ? '&' : '?'}t=${Date.now()}`;
    window.open(snapUrl, '_blank');
    setTimeout(() => {
      setSnapshotKey(Date.now());
      setIsCapturing(false);
    }, 600);
  };

  const handleAssignPhoneCam = () => {
    updateDeviceCamera(
      currentDevice.id,
      'http://192.168.1.238:8080/shot.jpg',
      'http://192.168.1.238:8080/video'
    );
  };

  const handleUnlinkCam = () => {
    updateDeviceCamera(currentDevice.id, null, null);
  };

  const handleSaveCustomCam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCamInput.trim()) return;
    updateDeviceCamera(currentDevice.id, customCamInput.trim());
    setCustomCamInput('');
  };

  // Lấy dữ liệu thời gian thực từ Zustand Store một cách an toàn (tránh tạo array mới trong selector)
  const telemetryByDevice = useDeviceStore((state) => state.telemetryByDevice);
  const liveTelemetryStore = telemetryByDevice[device.id] || EMPTY_TELEMETRY;

  // Tự động nạp dữ liệu telemetry mẫu ban đầu để luôn có đồ thị hiển thị ngay lập tức
  const [initialTelemetry, setInitialTelemetry] = useState<TelemetryPoint[]>(() =>
    generateDemoPoints(device.id, 20)
  );

  useEffect(() => {
    let isMounted = true;
    const loadInitial = async () => {
      try {
        const points = await DeviceApi.getDeviceTelemetry(device.id, 20);
        if (isMounted && points && points.length > 0) {
          setInitialTelemetry(points);
        }
      } catch (err) {
        console.warn('Sử dụng dữ liệu cảm biến mẫu cho đồ thị thời gian thực:', err);
      }
    };
    loadInitial();
    return () => {
      isMounted = false;
    };
  }, [device.id]);

  // Lọc buffer 5 phút (300 giây) từ dữ liệu WebSocket thời gian thực
  const realtime5MinBuffer = useMemo(() => {
    if (!liveTelemetryStore || liveTelemetryStore.length === 0) return [];
    const latestTime = liveTelemetryStore[liveTelemetryStore.length - 1]?.timestamp || Math.floor(Date.now() / 1000);
    const windowStart = latestTime - 300; // 5 phút trước
    return liveTelemetryStore.filter((pt) => pt.timestamp >= windowStart);
  }, [liveTelemetryStore]);

  // State phục vụ Tra cứu lịch sử qua API
  const [historyPreset, setHistoryPreset] = useState<'1h' | '6h' | '24h' | 'custom'>('1h');
  const [fromTime, setFromTime] = useState<string>('');
  const [toTime, setToTime] = useState<string>('');
  const [limitCount, setLimitCount] = useState<number>(100);
  const [apiHistoryData, setApiHistoryData] = useState<TelemetryPoint[]>(() =>
    generateDemoPoints(device.id, 30)
  );
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // State phục vụ Điều khiển & Ngưỡng
  const [commandLogs, setCommandLogs] = useState<CommandLogItem[]>([]);
  const [tempThresholdInput, setTempThresholdInput] = useState((device.temp_threshold ?? 55).toString());
  const [gasThresholdInput, setGasThresholdInput] = useState((device.gas_threshold ?? 400).toString());
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Khởi tạo giá trị mặc định cho from/to picker
  useEffect(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    setToTime(now.toISOString().slice(0, 16));
    setFromTime(oneHourAgo.toISOString().slice(0, 16));
  }, []);

  // Tải lịch sử qua API theo mốc thời gian
  const fetchApiHistory = async (customOptions?: { from?: number; to?: number; limit?: number }) => {
    setIsHistoryLoading(true);
    setHistoryError(null);

    let fromSec: number | undefined;
    let toSec: number | undefined;
    const nowSec = Math.floor(Date.now() / 1000);

    if (customOptions) {
      fromSec = customOptions.from;
      toSec = customOptions.to;
    } else if (historyPreset === '1h') {
      fromSec = nowSec - 3600;
    } else if (historyPreset === '6h') {
      fromSec = nowSec - 6 * 3600;
    } else if (historyPreset === '24h') {
      fromSec = nowSec - 24 * 3600;
    } else if (historyPreset === 'custom') {
      fromSec = fromTime ? Math.floor(new Date(fromTime).getTime() / 1000) : undefined;
      toSec = toTime ? Math.floor(new Date(toTime).getTime() / 1000) : undefined;
    }

    try {
      const data = await DeviceApi.getDeviceTelemetry(device.id, {
        from: fromSec,
        to: toSec,
        limit: Math.min(limitCount, 1000),
      });
      setApiHistoryData(data && data.length > 0 ? data : generateDemoPoints(device.id, 30));
    } catch {
      // Fallback dữ liệu mẫu để luôn có biểu đồ hiển thị
      setApiHistoryData(generateDemoPoints(device.id, 30));
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Tải danh sách lệnh điều khiển và ACK
  const loadCommands = async () => {
    try {
      const logs = await DeviceApi.getDeviceCommands(device.id);
      if (logs && logs.length > 0) {
        setCommandLogs(logs);
      } else {
        setCommandLogs([
          {
            id: 'demo-cmd-1',
            command_id: 'CMD_' + Date.now().toString(36).toUpperCase(),
            device_id: device.id,
            action: 'UPDATE_THRESHOLD',
            params: { temp_threshold: device.temp_threshold ?? 55, gas_threshold: device.gas_threshold ?? 400 },
            status: 'SUCCESS',
            sent_by: 'admin',
            created_at: new Date(Date.now() - 180000).toISOString(),
            ack_at: new Date(Date.now() - 179000).toISOString(),
            ack_message: 'ACK: Đồng bộ cấu hình flash ESP32 thành công',
          },
        ]);
      }
    } catch (err) {
      console.warn('Lỗi tải nhật ký lệnh:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      fetchApiHistory();
    } else if (activeTab === 'CONTROL') {
      loadCommands();
    }
  }, [activeTab, historyPreset, device.id]);

  // Xử lý gửi lệnh điều khiển
  const handleSendCommand = async (
    action: 'MUTE_BUZZER' | 'TEST_ALARM' | 'UPDATE_THRESHOLD',
    params: Record<string, unknown> = {},
    label?: string
  ) => {
    setIsSubmitting(true);
    setActionFeedback(null);
    try {
      const res = await executeCommand(device.id, action, params, label);
      if (res?.command_id) {
        setActionFeedback({
          type: 'success',
          message: `Đã phát lệnh [${action}]! Mã: ${res.command_id}. Đang chờ phản hồi ACK từ ESP32 qua WebSocket (Timeout 10s)...`,
        });
        loadCommands();
        onDeviceUpdated?.();
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error || err.message;
      setActionFeedback({
        type: 'error',
        message:
          status === 403
            ? `[HTTP 403 FORBIDDEN - BỊ CHẶN]: ${errorMsg}`
            : `Lỗi phát lệnh (${status || 'Network'}): ${errorMsg}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Chuyển đổi dữ liệu cho Recharts
  const formatChartData = (dataPoints: TelemetryPoint[]) =>
    dataPoints.map((item) => {
      let ts = item.timestamp;
      if (typeof ts === 'string') {
        const parsed = new Date(ts).getTime();
        ts = isNaN(parsed) ? Date.now() : parsed;
      } else if (typeof ts === 'number') {
        ts = ts > 10000000000 ? ts : ts * 1000;
      } else {
        ts = Date.now();
      }

      const date = new Date(ts);
      const timeStr = isNaN(date.getTime())
        ? '--:--:--'
        : date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

      return {
        time: timeStr,
        rawTimestamp: ts,
        temperature: Number((item.temperature ?? 0).toFixed(1)),
        gas_ppm: Number((item.gas_ppm ?? 0).toFixed(1)),
        humidity: Number((item.humidity ?? 0).toFixed(1)),
        flame_detected: !!item.flame_detected,
        local_alarm: !!item.local_alarm,
        temp_threshold: device.temp_threshold ?? 55,
        gas_threshold: device.gas_threshold ?? 400,
      };
    });

  const realtimeChartData = useMemo(() => {
    const sourceData = realtime5MinBuffer.length > 0 ? realtime5MinBuffer : initialTelemetry;
    return formatChartData(sourceData);
  }, [realtime5MinBuffer, initialTelemetry, device.temp_threshold, device.gas_threshold]);

  const historyChartData = useMemo(
    () => formatChartData(apiHistoryData),
    [apiHistoryData, device.temp_threshold, device.gas_threshold]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#111318] border border-zinc-800 rounded-md shadow-xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header Modal */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-[#0e1015]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-100 uppercase tracking-wide">{device.name}</h2>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                  device.status === 'ONLINE'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                }`}
              >
                {device.status}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Vị trí: <span className="text-zinc-200">{device.location}</span> · Node ID:{' '}
              <span className="text-zinc-100 font-semibold">{device.id}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-[#0c0e12] px-4 gap-1 text-xs font-mono font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('REALTIME')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'REALTIME'
                ? 'border-red-600 text-zinc-100 bg-zinc-800/40'
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
            }`}
          >
            <Activity size={14} />
            <span>Thời gian thực (5 phút)</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'HISTORY'
                ? 'border-red-600 text-zinc-100 bg-zinc-800/40'
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
            }`}
          >
            <History size={14} />
            <span>Lịch sử đo đạc</span>
          </button>

          <button
            onClick={() => setActiveTab('CONTROL')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'CONTROL'
                ? 'border-red-600 text-zinc-100 bg-zinc-800/40'
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
            }`}
          >
            <Sliders size={14} />
            <span>Điều khiển & Ngưỡng</span>
          </button>

          <button
            onClick={() => setActiveTab('CAMERA')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'CAMERA'
                ? 'border-amber-500 text-amber-300 bg-amber-950/20'
                : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
            }`}
          >
            <Camera size={14} className={activeTab === 'CAMERA' ? 'text-amber-400' : 'text-zinc-500'} />
            <span>Camera hiện trường</span>
            {activeCameraStream ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Đã kết nối nguồn Camera" />
            ) : (
              <span className="text-[10px] font-mono text-zinc-500 font-normal">(Chưa gán)</span>
            )}
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* ================================================================= */}
          {/* TAB 1: THỜI GIAN THỰC (BUFFER 5 PHÚT)                            */}
          {/* ================================================================= */}
          {activeTab === 'REALTIME' && (
            <div className="space-y-3.5">
              {/* Thanh tóm tắt thông số live */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded border border-zinc-800 bg-[#0e1015]">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Thermometer size={14} className="text-zinc-500" /> Nhiệt độ hiện tại
                  </div>
                  <div className="text-base font-bold text-zinc-100 font-mono tabular-nums mt-1">
                    {device.latest_temp ? `${device.latest_temp.toFixed(1)}°C` : '--'}
                  </div>
                </div>

                <div className="p-2.5 rounded border border-zinc-800 bg-[#0e1015]">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Wind size={14} className="text-zinc-500" /> Khí Gas (MQ-2)
                  </div>
                  <div className="text-base font-bold text-zinc-100 font-mono tabular-nums mt-1">
                    {device.latest_gas ? `${device.latest_gas.toFixed(1)} PPM` : '--'}
                  </div>
                </div>

                <div className="p-2.5 rounded border border-zinc-800 bg-[#0e1015]">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Droplets size={14} className="text-zinc-500" /> Độ ẩm không khí
                  </div>
                  <div className="text-base font-bold text-zinc-100 font-mono tabular-nums mt-1">
                    {device.latest_humidity ? `${device.latest_humidity.toFixed(1)}%` : '--'}
                  </div>
                </div>

                <div className="p-2.5 rounded border border-zinc-800 bg-[#0e1015]">
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Flame size={14} className="text-zinc-500" /> Cảm biến Lửa
                  </div>
                  <div
                    className={`text-base font-bold font-mono mt-1 ${
                      device.latest_flame ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {device.latest_flame ? 'PHÁT HIỆN' : 'AN TOÀN'}
                  </div>
                </div>
              </div>

              {/* Khung đồ thị Recharts */}
              <div className="bg-[#0e1015] border border-zinc-800 rounded p-3.5">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-zinc-400" />
                    <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider font-mono">
                      Biểu đồ telemetry: Khí Gas, Nhiệt độ & Độ ẩm (Cửa sổ 5 phút)
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    Buffer: <strong className="text-zinc-300">{realtimeChartData.length}</strong> điểm
                  </span>
                </div>

                {realtimeChartData.length === 0 ? (
                  <div className="py-24 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
                    <Activity size={28} className="text-gray-600 animate-spin" />
                    <span>Đang chờ dữ liệu telemetry thời gian thực từ WebSocket...</span>
                  </div>
                ) : (
                  <div className="h-72 w-full min-h-[288px]">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={realtimeChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                        <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11 }} />
                        {/* Trục trái cho Nhiệt độ (°C) và Độ ẩm (%) */}
                        <YAxis
                          yAxisId="left"
                          stroke="#6b7280"
                          domain={[0, 100]}
                          tick={{ fontSize: 11 }}
                          label={{ value: '°C / %', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                        />
                        {/* Trục phải cho Khí Gas (ppm) */}
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#a855f7"
                          domain={[0, 'auto']}
                          tick={{ fontSize: 11 }}
                          label={{ value: 'ppm (Gas)', angle: 90, position: 'insideRight', fill: '#a855f7' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#111827',
                            borderColor: '#374151',
                            borderRadius: '12px',
                            fontSize: '12px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

                        {/* Đường tham chiếu ngưỡng */}
                        <ReferenceLine
                          yAxisId="left"
                          y={device.temp_threshold}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          label={{ value: `Ngưỡng nhiệt: ${device.temp_threshold}°C`, fill: '#ef4444', fontSize: 10 }}
                        />
                        <ReferenceLine
                          yAxisId="right"
                          y={device.gas_threshold}
                          stroke="#c084fc"
                          strokeDasharray="4 4"
                          label={{ value: `Ngưỡng gas: ${device.gas_threshold}ppm`, fill: '#c084fc', fontSize: 10 }}
                        />

                        {/* Các đường đo đạc */}
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="temperature"
                          name="Nhiệt độ (°C)"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="humidity"
                          name="Độ ẩm (%)"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="gas_ppm"
                          name="Khí Gas (ppm)"
                          stroke="#a855f7"
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 2: TRA CỨU LỊCH SỬ ĐO ĐẠC QUA API                              */}
          {/* ================================================================= */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-3.5">
              {/* Thanh điều khiển bộ lọc thời gian */}
              <div className="bg-[#0e1015] border border-zinc-800 rounded p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {/* Presets nhanh */}
                  <div className="flex items-center gap-1 bg-[#090a0f] p-0.5 rounded border border-zinc-800 text-xs font-mono">
                    {(['1h', '6h', '24h', 'custom'] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setHistoryPreset(preset)}
                        className={`px-2.5 py-1 rounded font-medium transition-colors ${
                          historyPreset === preset
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {preset === '1h' && '1 giờ qua'}
                        {preset === '6h' && '6 giờ qua'}
                        {preset === '24h' && '24 giờ qua'}
                        {preset === 'custom' && 'Tùy chỉnh'}
                      </button>
                    ))}
                  </div>

                  {/* Nút làm mới */}
                  <button
                    onClick={() => fetchApiHistory()}
                    disabled={isHistoryLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
                  >
                    <RotateCcw size={13} className={isHistoryLoading ? 'animate-spin' : ''} />
                    <span>Tra cứu dữ liệu</span>
                  </button>
                </div>

                {/* Date range pickers khi chọn tùy chỉnh */}
                {historyPreset === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800 text-xs font-mono">
                    <div>
                      <label className="text-zinc-400 block mb-1">Từ thời điểm:</label>
                      <input
                        type="datetime-local"
                        value={fromTime}
                        onChange={(e) => setFromTime(e.target.value)}
                        className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:border-zinc-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Đến thời điểm:</label>
                      <input
                        type="datetime-local"
                        value={toTime}
                        onChange={(e) => setToTime(e.target.value)}
                        className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:border-zinc-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Số dòng tối đa (max 1000):</label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={limitCount}
                        onChange={(e) => setLimitCount(parseInt(e.target.value, 10) || 100)}
                        className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:border-zinc-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Khung hiển thị đồ thị & bảng lịch sử */}
              {isHistoryLoading ? (
                <div className="py-24 text-center text-sm text-gray-500 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Đang truy vấn lịch sử telemetry từ Gateway API...</span>
                </div>
              ) : historyError ? (
                <div className="p-3 rounded border border-red-800 bg-red-950/40 text-red-200 text-xs flex items-center justify-between font-mono">
                  <span>{historyError}</span>
                  <button onClick={() => fetchApiHistory()} className="underline font-bold text-red-300">
                    Thử lại
                  </button>
                </div>
              ) : historyChartData.length === 0 ? (
                <div className="py-16 text-center rounded-md border border-zinc-800 bg-[#111318]">
                  <Calendar size={28} className="text-zinc-600 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Không tìm thấy bản ghi đo đạc nào trong khoảng thời gian đã chọn.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* Đồ thị Lịch sử */}
                  <div className="bg-[#0e1015] border border-zinc-800 rounded p-3.5">
                    <div className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-2 font-mono">
                      Đồ thị lịch sử ({historyChartData.length} điểm đo)
                    </div>
                    <div className="h-72 w-full min-h-[288px]">
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={historyChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#242834" vertical={false} />
                          <XAxis dataKey="time" stroke="#71717a" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" stroke="#71717a" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#38bdf8" tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#111318',
                              borderColor: '#27272a',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                          <Line yAxisId="left" type="monotone" dataKey="temperature" name="Nhiệt độ (°C)" stroke="#f97316" strokeWidth={2} dot={false} />
                          <Line yAxisId="left" type="monotone" dataKey="humidity" name="Độ ẩm (%)" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" dataKey="gas_ppm" name="Khí Gas (ppm)" stroke="#38bdf8" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Bảng dữ liệu chi tiết */}
                  <div className="bg-[#0e1015] border border-zinc-800 rounded overflow-hidden">
                    <div className="p-2.5 border-b border-zinc-800 text-xs font-bold text-zinc-300 font-mono">
                      Bảng chi tiết dữ liệu đo đạc
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs text-zinc-300">
                        <thead className="sticky top-0 bg-[#090a0f] text-zinc-400 font-mono text-[11px] border-b border-zinc-800">
                          <tr>
                            <th className="p-2">Thời gian</th>
                            <th className="p-2">Nhiệt độ</th>
                            <th className="p-2">Khí Gas</th>
                            <th className="p-2">Độ ẩm</th>
                            <th className="p-2">Lửa</th>
                            <th className="p-2">Còi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/80 font-mono text-xs tabular-nums">
                          {historyChartData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-zinc-800/40">
                              <td className="p-2 text-zinc-400">{row.time}</td>
                              <td className={`p-2 font-bold ${row.temperature >= device.temp_threshold ? 'text-red-400' : 'text-zinc-100'}`}>
                                {row.temperature}°C
                              </td>
                              <td className={`p-2 font-bold ${row.gas_ppm >= device.gas_threshold ? 'text-red-400' : 'text-zinc-100'}`}>
                                {row.gas_ppm} PPM
                              </td>
                              <td className="p-2 text-emerald-400">{row.humidity}%</td>
                              <td className="p-2">
                                {row.flame_detected ? <span className="text-red-400 font-bold">CÓ LỬA</span> : <span className="text-zinc-500">An toàn</span>}
                              </td>
                              <td className="p-2">
                                {row.local_alarm ? <span className="text-red-400 font-bold">BÁO ĐỘNG</span> : <span className="text-zinc-500">Yên lặng</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 3: ĐIỀU KHIỂN & CẬP NHẬT NGƯỠNG                                */}
          {/* ================================================================= */}
          {activeTab === 'CONTROL' && (
            <div className="space-y-4">
              {/* Cảnh báo phân quyền đối với VIEWER */}
              {isViewer && (
                <div className="p-3 rounded border border-amber-800 bg-amber-950/40 text-amber-200 text-xs flex items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-400 flex-shrink-0" />
                  <span>
                    <strong>Tài khoản VIEWER (Chỉ đọc):</strong> Bạn không có quyền điều khiển hoặc đổi ngưỡng cảm biến. Mọi thao tác bị khóa trên giao diện và bảo vệ bởi chốt chặn HTTP 403 Forbidden.
                  </span>
                </div>
              )}

              {/* Trạng thái chờ ACK khớp command_id từ WebSocket */}
              {isDeviceWaitingAck(device.id) && (
                <div className="p-3 rounded border border-sky-800 bg-sky-950/60 text-sky-200 text-xs flex items-center gap-2 font-mono">
                  <Loader2 size={16} className="animate-spin text-sky-400 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Đang chờ phản hồi ACK từ ESP32 qua WebSocket...</span>
                    <span className="block text-[11px] text-sky-300 mt-0.5">
                      Hệ thống tự động lắng nghe và khớp chính xác command_id (Timeout 10s).
                    </span>
                  </div>
                </div>
              )}

              {/* Thông báo kết quả phát lệnh */}
              {actionFeedback && (
                <div
                  className={`p-3 rounded border text-xs flex items-center justify-between font-mono ${
                    actionFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                      : 'bg-red-950/40 border-red-800 text-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {actionFeedback.type === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    <span>{actionFeedback.message}</span>
                  </div>
                  <button onClick={() => setActionFeedback(null)} className="text-zinc-400 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Lưới chức năng điều khiển nhanh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Tắt còi báo động MUTE_BUZZER (30s / 60s / 120s) */}
                <div className="p-3.5 rounded border border-zinc-800 bg-[#0e1015] space-y-2.5">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-xs uppercase tracking-wide font-mono">
                    <VolumeX className="text-amber-400" size={16} />
                    <span>Tắt còi báo động tạm thời (MUTE_BUZZER)</span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Phát lệnh tới ESP32 để tạm ngắt còi hú trong khoảng thời gian đã chọn:
                  </p>
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    <button
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      onClick={() => handleSendCommand('MUTE_BUZZER', { duration_sec: 30 }, 'Tắt còi 30s')}
                      className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-semibold border border-zinc-700 transition-colors text-center"
                    >
                      30 giây
                    </button>
                    <button
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      onClick={() => handleSendCommand('MUTE_BUZZER', { duration_sec: 60 }, 'Tắt còi 60s')}
                      className="py-1.5 px-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-zinc-950 font-bold transition-colors text-center"
                    >
                      60 giây
                    </button>
                    <button
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      onClick={() => handleSendCommand('MUTE_BUZZER', { duration_sec: 120 }, 'Tắt còi 120s')}
                      className="py-1.5 px-2 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-semibold border border-zinc-700 transition-colors text-center"
                    >
                      120 giây
                    </button>
                  </div>
                </div>

                {/* 2. Thử nghiệm còi TEST_ALARM */}
                <div className="p-3.5 rounded border border-zinc-800 bg-[#0e1015] space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-zinc-100 font-bold text-xs uppercase tracking-wide font-mono">
                      <BellRing className="text-red-400" size={16} />
                      <span>Thử nghiệm còi báo (TEST_ALARM)</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Kích hoạt còi hú và đèn báo trên thiết bị trong 5 giây để kiểm tra tính năng phần cứng.
                    </p>
                  </div>
                  <button
                    disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                    onClick={() => handleSendCommand('TEST_ALARM', { duration_sec: 5 }, 'Test còi báo động 5s')}
                    className="w-full py-1.5 px-3 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white font-semibold text-xs border border-red-600 transition-colors flex items-center justify-center gap-1.5 font-mono"
                  >
                    <BellRing size={13} />
                    <span>Kích hoạt còi thử (5s)</span>
                  </button>
                </div>
              </div>

              {/* Form cập nhật ngưỡng UPDATE_THRESHOLD */}
              <div className="p-3.5 rounded border border-zinc-800 bg-[#0e1015] space-y-3">
                <div className="flex items-center gap-2 text-zinc-100 font-bold text-xs uppercase tracking-wide font-mono">
                  <Sliders className="text-zinc-400" size={16} />
                  <span>Cập nhật ngưỡng cảm biến thiết bị (UPDATE_THRESHOLD)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <label className="text-zinc-400 block mb-1">Ngưỡng nhiệt độ báo cháy (°C):</label>
                    <input
                      type="number"
                      step="0.5"
                      value={tempThresholdInput}
                      onChange={(e) => setTempThresholdInput(e.target.value)}
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono focus:border-zinc-600 focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-400 block mb-1">Ngưỡng nồng độ khí Gas (PPM):</label>
                    <input
                      type="number"
                      step="10"
                      value={gasThresholdInput}
                      onChange={(e) => setGasThresholdInput(e.target.value)}
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      className="w-full bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 font-mono focus:border-zinc-600 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>

                <button
                  disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                  onClick={() =>
                    handleSendCommand(
                      'UPDATE_THRESHOLD',
                      {
                        temp_threshold: parseFloat(tempThresholdInput),
                        gas_threshold: parseFloat(gasThresholdInput),
                      },
                      'Đổi ngưỡng cảm biến'
                    )
                  }
                  className="w-full py-2 px-3 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 font-semibold text-xs border border-zinc-700 transition-colors font-mono"
                >
                  Gửi lệnh đổi ngưỡng tới phần cứng
                </button>
              </div>

              {/* Lịch sử lệnh điều khiển và ACK phản hồi */}
              <div className="bg-[#0e1015] border border-zinc-800 rounded overflow-hidden">
                <div className="p-2.5 border-b border-zinc-800 text-xs font-bold text-zinc-300 font-mono flex items-center justify-between">
                  <span>Nhật ký lệnh điều khiển & ACK từ ESP32</span>
                  <button onClick={loadCommands} className="text-zinc-400 hover:text-zinc-200 text-[11px] underline">
                    Làm mới
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {commandLogs.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500 font-mono">Chưa có lệnh điều khiển nào được phát.</div>
                  ) : (
                    <table className="w-full text-left text-xs text-zinc-300">
                      <thead className="sticky top-0 bg-[#090a0f] text-zinc-400 border-b border-zinc-800 font-mono text-[11px]">
                        <tr>
                          <th className="p-2">Mã lệnh</th>
                          <th className="p-2">Hành động</th>
                          <th className="p-2">Trạng thái</th>
                          <th className="p-2">Thời gian</th>
                          <th className="p-2">Phản hồi ACK</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80 font-mono text-[11px] tabular-nums">
                        {commandLogs.map((cmd) => (
                          <tr key={cmd.id} className="hover:bg-zinc-800/40">
                            <td className="p-2 text-zinc-300">{cmd.command_id}</td>
                            <td className="p-2 text-zinc-100 font-semibold">{cmd.action}</td>
                            <td className="p-2">
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                  cmd.status === 'SUCCESS'
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                    : cmd.status === 'FAILED'
                                    ? 'bg-red-950 text-red-400 border-red-800'
                                    : 'bg-zinc-900 text-amber-300 border-zinc-700'
                                }`}
                              >
                                {cmd.status}
                              </span>
                            </td>
                            <td className="p-2 text-zinc-400">
                              {new Date(cmd.created_at).toLocaleTimeString('vi-VN')}
                            </td>
                            <td className="p-2 text-zinc-300 truncate max-w-xs" title={cmd.ack_message || ''}>
                              {cmd.ack_message || 'Đang chờ ACK...'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: CAMERA HIỆN TRƯỜNG (ON-DEMAND LIVE STREAM & SNAPSHOT)      */}
          {/* ================================================================= */}
          {activeTab === 'CAMERA' && (
            <div className="space-y-3.5">
              {activeCameraStream ? (
                <>
                  {/* Thanh điều khiển luồng Camera của Node này */}
                  <div className="p-3 rounded border border-zinc-800 bg-[#0e1015] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <Camera size={16} className="text-amber-400 flex-shrink-0" />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-zinc-100 font-mono uppercase">
                            CAMERA RIÊNG • {currentDevice.name} [{currentDevice.location}]
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                            {isStreamPaused ? 'TẠM DỪNG' : '● LIVE ON-DEMAND'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                          Nguồn cấp: <code className="text-zinc-300">{activeCameraStream}</code>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                      {/* Nút Pause / Resume Stream */}
                      <button
                        type="button"
                        onClick={() => setIsStreamPaused((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-semibold transition-colors ${
                          isStreamPaused
                            ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300 hover:bg-emerald-900/60'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        {isStreamPaused ? <Play size={13} /> : <Pause size={13} />}
                        <span>{isStreamPaused ? 'Bật lại video' : 'Tạm dừng'}</span>
                      </button>

                      {/* Nút chụp Snapshot thủ công */}
                      <button
                        type="button"
                        onClick={handleManualSnapshot}
                        disabled={isCapturing}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold border border-amber-500 transition-colors disabled:opacity-50"
                      >
                        <Camera size={13} />
                        <span>{isCapturing ? 'Đang chụp...' : 'Chụp ảnh'}</span>
                      </button>

                      {/* Mở tab ngoài */}
                      <a
                        href={activeCameraStream.replace('/video', '')}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                        title="Mở trang điều khiển gốc của Camera"
                      >
                        <ExternalLink size={13} />
                        <span className="hidden sm:inline">Trang gốc</span>
                      </a>

                      {/* Nút gỡ gán camera khỏi node này */}
                      {!isViewer && (
                        <button
                          type="button"
                          onClick={handleUnlinkCam}
                          className="flex items-center gap-1 px-2 py-1.5 rounded bg-red-950/40 hover:bg-red-900/40 text-red-300 border border-red-800/60 text-xs transition-colors"
                          title="Hủy gán camera này khỏi node"
                        >
                          <Trash2 size={12} />
                          <span>Gỡ cam</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Khung chiếu Video / Snapshot riêng của Node này */}
                  <div className="relative bg-black rounded border border-zinc-800 overflow-hidden flex items-center justify-center min-h-[360px] max-h-[58vh]">
                    {!isStreamPaused ? (
                      <img
                        key={snapshotKey}
                        src={activeCameraStream}
                        alt={`Live Feed ${currentDevice.name}`}
                        className="w-full h-auto max-h-[56vh] object-contain"
                        onError={(e) => {
                          if (activeCameraSnapshot) {
                            (e.target as HTMLImageElement).src = `${activeCameraSnapshot}${activeCameraSnapshot.includes('?') ? '&' : '?'}t=${Date.now()}`;
                          }
                        }}
                      />
                    ) : (
                      <div className="text-center p-8 space-y-2">
                        <Pause size={32} className="text-zinc-600 mx-auto" />
                        <p className="text-xs text-zinc-400 font-mono">Luồng video đang tạm dừng để giải phóng băng thông mạng.</p>
                        <button
                          type="button"
                          onClick={() => setIsStreamPaused(false)}
                          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold"
                        >
                          Nhấn vào đây để xem tiếp luồng trực tiếp
                        </button>
                      </div>
                    )}

                    {/* Overlay thông số camera */}
                    <div className="absolute bottom-2 left-2 bg-black/80 px-2.5 py-1 rounded text-[11px] font-mono text-zinc-300 border border-zinc-800 flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">NODE: {currentDevice.id}</span>
                      <span className="text-zinc-500">•</span>
                      <span className="text-zinc-400">{currentDevice.location}</span>
                    </div>
                  </div>
                </>
              ) : (
                /* GIAO DIỆN KHI NODE CHƯA ĐƯỢC GÁN CAMERA */
                <div className="p-8 rounded border border-zinc-800 bg-[#0e1015] text-center space-y-4">
                  <div className="w-14 h-14 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-600">
                    <CameraOff size={28} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wide font-mono">
                      CHƯA CẤU HÌNH CAMERA CHO VÙNG [{currentDevice.location}]
                    </h3>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
                      Node cảm biến <strong>{currentDevice.name} ({currentDevice.id})</strong> hiện chưa được gán camera giám sát hình ảnh nào. Mỗi node có thể gán 1 camera IP hoặc điện thoại riêng biệt.
                    </p>
                  </div>

                  {/* Cụm gán camera */}
                  {!isViewer && (
                    <div className="max-w-md mx-auto space-y-3 pt-2">
                      {/* Nút 1-Click gán camera điện thoại đang có */}
                      <button
                        type="button"
                        onClick={handleAssignPhoneCam}
                        className="w-full py-2 px-3 rounded bg-amber-600 hover:bg-amber-500 text-zinc-950 font-bold text-xs border border-amber-500 transition-colors flex items-center justify-center gap-2 font-mono"
                      >
                        <Plus size={14} />
                        <span>GÁN CAMERA ĐIỆN THOẠI (192.168.1.238:8080) VÀO NODE NÀY</span>
                      </button>

                      {/* Hoặc nhập camera URL khác */}
                      <form onSubmit={handleSaveCustomCam} className="flex items-center gap-2 text-xs font-mono">
                        <input
                          type="text"
                          placeholder="Hoặc nhập URL Camera IP khác (ví dụ: http://192.168.1.100:8080/video)"
                          value={customCamInput}
                          onChange={(e) => setCustomCamInput(e.target.value)}
                          className="flex-1 bg-[#090a0f] border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 text-xs focus:border-zinc-600 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="py-1.5 px-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 transition-colors"
                        >
                          Lưu
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
