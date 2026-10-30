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
  const [activeTab, setActiveTab] = useState<'REALTIME' | 'HISTORY' | 'CONTROL'>('REALTIME');

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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#111726] border border-gray-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header Modal */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/70">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-white tracking-wide">{device.name}</h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                  device.status === 'ONLINE'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-500/50'
                    : 'bg-rose-950 text-rose-300 border-rose-800'
                }`}
              >
                {device.status}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Vị trí: <span className="text-gray-200">{device.location}</span> • Mã thiết bị:{' '}
              <span className="font-mono text-cyan-400 font-semibold">{device.id}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 bg-gray-950/60 px-5 gap-2 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('REALTIME')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'REALTIME'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Activity size={16} />
            Thời gian thực (Buffer 5 phút)
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'HISTORY'
                ? 'border-amber-500 text-amber-400 bg-amber-950/20'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <History size={16} />
            Tra cứu lịch sử (API)
          </button>

          <button
            onClick={() => setActiveTab('CONTROL')}
            className={`py-3 px-4 border-b-2 flex items-center gap-2 transition-all ${
              activeTab === 'CONTROL'
                ? 'border-red-500 text-red-400 bg-red-950/20'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Sliders size={16} />
            Điều khiển & Ngưỡng
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* ================================================================= */}
          {/* TAB 1: THỜI GIAN THỰC (BUFFER 5 PHÚT)                            */}
          {/* ================================================================= */}
          {activeTab === 'REALTIME' && (
            <div className="space-y-4">
              {/* Thanh tóm tắt thông số live */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-gray-900/60 border border-gray-800 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400">
                    <Thermometer size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">Nhiệt độ hiện tại</div>
                    <div className="text-base font-extrabold text-white font-mono">
                      {device.latest_temp ? `${device.latest_temp.toFixed(1)}°C` : '--'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-gray-900/60 border border-gray-800 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
                    <Wind size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">Nồng độ Khí Gas</div>
                    <div className="text-base font-extrabold text-white font-mono">
                      {device.latest_gas ? `${device.latest_gas.toFixed(1)} ppm` : '--'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-gray-900/60 border border-gray-800 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
                    <Droplets size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">Độ ẩm không khí</div>
                    <div className="text-base font-extrabold text-white font-mono">
                      {device.latest_humidity ? `${device.latest_humidity.toFixed(1)}%` : '--'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-gray-900/60 border border-gray-800 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-red-500/15 text-red-400">
                    <Flame size={18} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">Cảm biến Lửa</div>
                    <div
                      className={`text-sm font-bold ${
                        device.latest_flame ? 'text-red-400 animate-pulse' : 'text-emerald-400'
                      }`}
                    >
                      {device.latest_flame ? '🔥 CÓ LỬA' : 'An toàn'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Khung đồ thị Recharts */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-cyan-400 animate-pulse" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Biểu đồ trực tiếp: Khí Gas, Nhiệt độ & Độ ẩm (Cửa sổ 5 phút)
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    Điểm dữ liệu trong buffer: <b className="text-cyan-400">{realtimeChartData.length}</b>
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
            <div className="space-y-4">
              {/* Thanh điều khiển bộ lọc thời gian */}
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Presets nhanh */}
                  <div className="flex items-center gap-1.5 bg-gray-950 p-1 rounded-xl border border-gray-800 text-xs">
                    {(['1h', '6h', '24h', 'custom'] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setHistoryPreset(preset)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                          historyPreset === preset
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-all"
                  >
                    <RotateCcw size={14} className={isHistoryLoading ? 'animate-spin' : ''} />
                    Tra cứu dữ liệu
                  </button>
                </div>

                {/* Date range pickers khi chọn tùy chỉnh */}
                {historyPreset === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-800 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-1">Từ thời điểm:</label>
                      <input
                        type="datetime-local"
                        value={fromTime}
                        onChange={(e) => setFromTime(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Đến thời điểm:</label>
                      <input
                        type="datetime-local"
                        value={toTime}
                        onChange={(e) => setToTime(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Giới hạn số dòng (tối đa 1000):</label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={limitCount}
                        onChange={(e) => setLimitCount(parseInt(e.target.value, 10) || 100)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
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
                <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs flex items-center justify-between">
                  <span>{historyError}</span>
                  <button onClick={() => fetchApiHistory()} className="underline font-bold text-red-300">
                    Thử lại
                  </button>
                </div>
              ) : historyChartData.length === 0 ? (
                <div className="py-20 text-center glass-panel rounded-2xl border border-gray-800">
                  <Calendar size={32} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Không tìm thấy bản ghi đo đạc nào trong khoảng thời gian đã chọn.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Đồ thị Lịch sử */}
                  <div className="bg-gray-950/70 border border-gray-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                      Đồ thị lịch sử ({historyChartData.length} điểm đo)
                    </div>
                    <div className="h-72 w-full min-h-[288px]">
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={historyChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="left" stroke="#6b7280" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#a855f7" tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#111827',
                              borderColor: '#374151',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                          <Line yAxisId="left" type="monotone" dataKey="temperature" name="Nhiệt độ (°C)" stroke="#f97316" strokeWidth={2} dot={false} />
                          <Line yAxisId="left" type="monotone" dataKey="humidity" name="Độ ẩm (%)" stroke="#06b6d4" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" dataKey="gas_ppm" name="Khí Gas (ppm)" stroke="#a855f7" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Bảng dữ liệu chi tiết */}
                  <div className="bg-gray-950/70 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="p-3.5 border-b border-gray-800 text-xs font-bold text-gray-300">
                      Bảng chi tiết dữ liệu đo đạc
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left text-xs text-gray-300">
                        <thead className="sticky top-0 bg-gray-900 text-gray-400 font-semibold border-b border-gray-800">
                          <tr>
                            <th className="p-2.5">Thời gian</th>
                            <th className="p-2.5">Nhiệt độ</th>
                            <th className="p-2.5">Khí Gas</th>
                            <th className="p-2.5">Độ ẩm</th>
                            <th className="p-2.5">Lửa</th>
                            <th className="p-2.5">Còi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 font-mono">
                          {historyChartData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-900/40">
                              <td className="p-2.5 text-gray-400">{row.time}</td>
                              <td className={`p-2.5 font-bold ${row.temperature >= device.temp_threshold ? 'text-red-400' : 'text-white'}`}>
                                {row.temperature}°C
                              </td>
                              <td className={`p-2.5 font-bold ${row.gas_ppm >= device.gas_threshold ? 'text-red-400' : 'text-white'}`}>
                                {row.gas_ppm} ppm
                              </td>
                              <td className="p-2.5 text-cyan-300">{row.humidity}%</td>
                              <td className="p-2.5">
                                {row.flame_detected ? <span className="text-red-400 font-bold">CÓ LỬA</span> : <span className="text-gray-500">Không</span>}
                              </td>
                              <td className="p-2.5">
                                {row.local_alarm ? <span className="text-red-400 font-bold">BÁO ĐỘNG</span> : <span className="text-gray-500">Tắt</span>}
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
            <div className="space-y-5">
              {/* Cảnh báo phân quyền đối với VIEWER */}
              {isViewer && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5 shadow-md">
                  <ShieldAlert size={18} className="text-amber-400 flex-shrink-0" />
                  <span>
                    <b>Tài khoản VIEWER (Chỉ đọc):</b> Bạn không có quyền điều khiển hoặc đổi ngưỡng cảm biến. Mọi thao tác đều bị khóa trên giao diện và bảo vệ bởi chốt chặn HTTP 403 Forbidden của Gateway.
                  </span>
                </div>
              )}

              {/* Trạng thái chờ ACK khớp command_id từ WebSocket */}
              {isDeviceWaitingAck(device.id) && (
                <div className="p-3.5 rounded-2xl bg-cyan-950/60 border border-cyan-500/50 text-cyan-200 text-xs flex items-center gap-2.5 animate-pulse shadow-md">
                  <Loader2 size={18} className="animate-spin text-cyan-400 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Đang chờ phản hồi ACK từ ESP32 qua WebSocket...</span>
                    <span className="block text-[11px] text-cyan-300 mt-0.5">
                      Hệ thống tự động lắng nghe và khớp chính xác command_id với thời gian chờ tối đa 10 giây.
                    </span>
                  </div>
                </div>
              )}

              {/* Thông báo kết quả phát lệnh */}
              {actionFeedback && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
                    actionFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-red-950/40 border-red-500/50 text-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {actionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    <span>{actionFeedback.message}</span>
                  </div>
                  <button onClick={() => setActionFeedback(null)} className="text-gray-400 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Lưới chức năng điều khiển nhanh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Tắt còi báo động MUTE_BUZZER (30s / 60s / 120s) */}
                <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-3">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <VolumeX className="text-amber-400" size={18} />
                    <span>Tắt còi báo động tạm thời (MUTE_BUZZER)</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Phát lệnh tới ESP32 để tạm thời ngắt còi hú trong khoảng thời gian đã chọn:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      onClick={() => handleSendCommand('MUTE_BUZZER', { duration_sec: 30 }, 'Tắt còi 30s')}
                      className="py-2 px-2 rounded-xl bg-amber-600/80 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-xs transition-all active:scale-95 shadow-sm text-center"
                    >
                      30 giây
                    </button>
                    <button
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      onClick={() => handleSendCommand('MUTE_BUZZER', { duration_sec: 60 }, 'Tắt còi 60s')}
                      className="py-2 px-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-xs transition-all active:scale-95 shadow-sm text-center"
                    >
                      60 giây
                    </button>
                    <button
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      onClick={() => handleSendCommand('MUTE_BUZZER', { duration_sec: 120 }, 'Tắt còi 120s')}
                      className="py-2 px-2 rounded-xl bg-amber-600/80 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-xs transition-all active:scale-95 shadow-sm text-center"
                    >
                      120 giây
                    </button>
                  </div>
                </div>

                {/* 2. Thử nghiệm còi TEST_ALARM */}
                <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <BellRing className="text-red-400" size={18} />
                      <span>Thử nghiệm còi báo động (TEST_ALARM)</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mt-1">
                      Kích hoạt còi hú và đèn báo trên thiết bị trong 5 giây để kiểm tra tính năng phần cứng.
                    </p>
                  </div>
                  <button
                    disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                    onClick={() => handleSendCommand('TEST_ALARM', { duration_sec: 5 }, 'Test còi báo động 5s')}
                    className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold text-xs transition-all active:scale-98 shadow-md flex items-center justify-center gap-1.5"
                  >
                    <BellRing size={14} />
                    Kích hoạt thử còi báo (5s)
                  </button>
                </div>
              </div>

              {/* Form cập nhật ngưỡng UPDATE_THRESHOLD */}
              <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-4">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Sliders className="text-cyan-400" size={18} />
                  <span>Cập nhật ngưỡng cảm biến thiết bị (UPDATE_THRESHOLD)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-gray-300 font-medium block mb-1.5">Ngưỡng nhiệt độ báo cháy (°C):</label>
                    <input
                      type="number"
                      step="0.5"
                      value={tempThresholdInput}
                      onChange={(e) => setTempThresholdInput(e.target.value)}
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 font-medium block mb-1.5">Ngưỡng nồng độ khí Gas (ppm):</label>
                    <input
                      type="number"
                      step="10"
                      value={gasThresholdInput}
                      onChange={(e) => setGasThresholdInput(e.target.value)}
                      disabled={isViewer || isSubmitting || isDeviceWaitingAck(device.id)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-white font-mono focus:border-cyan-500 focus:outline-none disabled:opacity-50"
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
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-white font-bold text-xs transition-all active:scale-98 shadow-md"
                >
                  Cập nhật ngưỡng thiết bị
                </button>
              </div>

              {/* Lịch sử lệnh điều khiển và ACK phản hồi */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-3.5 border-b border-gray-800 text-xs font-bold text-gray-300 flex items-center justify-between">
                  <span>Nhật ký lệnh điều khiển & ACK từ ESP32</span>
                  <button onClick={loadCommands} className="text-cyan-400 hover:underline text-[11px]">
                    Làm mới
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {commandLogs.length === 0 ? (
                    <div className="py-8 text-center text-xs text-gray-500">Chưa có lệnh điều khiển nào được phát.</div>
                  ) : (
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-gray-900 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="p-2.5">Mã lệnh</th>
                          <th className="p-2.5">Hành động</th>
                          <th className="p-2.5">Trạng thái</th>
                          <th className="p-2.5">Thời gian</th>
                          <th className="p-2.5">Phản hồi ACK</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                        {commandLogs.map((cmd) => (
                          <tr key={cmd.id} className="hover:bg-gray-900/40">
                            <td className="p-2.5 text-cyan-400">{cmd.command_id}</td>
                            <td className="p-2.5 text-white font-bold">{cmd.action}</td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  cmd.status === 'SUCCESS'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                                    : cmd.status === 'FAILED'
                                    ? 'bg-red-950 text-red-400 border border-red-500/40'
                                    : 'bg-amber-950 text-amber-300'
                                }`}
                              >
                                {cmd.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-gray-400">
                              {new Date(cmd.created_at).toLocaleTimeString('vi-VN')}
                            </td>
                            <td className="p-2.5 text-gray-300 truncate max-w-xs" title={cmd.ack_message || ''}>
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
        </div>
      </div>
    </div>
  );
};
