import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { AlarmBanner } from '../components/AlarmBanner';
import { MetricCard } from '../components/MetricCard';
import { DeviceCard } from '../components/DeviceCard';
import { DeviceDetailModal } from '../components/DeviceDetailModal';
import { AlertHistoryTable } from '../components/AlertHistoryTable';
import { DeviceApi, type DeviceItem, type TelemetryPoint } from '../api/device.api';
import { useCommandTracker } from '../context/CommandTrackerContext';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  Cpu,
  Radio,
  Flame,
  Thermometer,
  Search,
  Filter,
  RefreshCw,
  Info,
  AlertTriangle,
  Layers,
  History,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { executeCommand } = useCommandTracker();
  const [mainTab, setMainTab] = useState<'DEVICES' | 'ALERTS'>('DEVICES');

  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<{
    device_id: string;
    flame_detected: boolean;
    local_alarm: boolean;
    temperature: number;
    gas_ppm: number;
    timestamp: number;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE' | 'ALARM'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [deviceFetchError, setDeviceFetchError] = useState<string | null>(null);

  // Tải danh sách thiết bị từ Gateway (API tự động lọc theo role và bảng user_devices)
  const fetchDevices = useCallback(async () => {
    setIsLoading(true);
    setDeviceFetchError(null);
    try {
      const data = await DeviceApi.getDevices();
      setDevices(data);

      // Cập nhật selectedDevice nếu đang mở modal (dùng updater function để tránh vòng lặp re-render)
      setSelectedDevice((curr) => {
        if (!curr) return null;
        const updated = data.find((d) => d.id === curr.id);
        return updated || curr;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối tới Gateway API';
      setDeviceFetchError(msg);
      console.error('Lỗi nạp danh sách thiết bị:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Lắng nghe dữ liệu WebSocket thời gian thực từ Gateway
  const { isConnected: wsConnected, connectionStatus, reconnectAttempts } = useWebSocket({
    onTelemetry: (telemetry: TelemetryPoint) => {
      setDevices((prev) =>
        prev.map((dev) => {
          if (dev.id === telemetry.device_id) {
            return {
              ...dev,
              status: 'ONLINE',
              latest_temp: telemetry.temperature,
              latest_gas: telemetry.gas_ppm,
              latest_humidity: telemetry.humidity,
              latest_flame: telemetry.flame_detected,
              latest_alarm: telemetry.local_alarm,
              is_muted: telemetry.is_muted,
              latest_telemetry_time: telemetry.timestamp,
            };
          }
          return dev;
        })
      );

      // Nếu có cháy hoặc chuông kêu -> Kích hoạt banner cảnh báo khẩn cấp
      if (telemetry.flame_detected || telemetry.local_alarm) {
        setActiveAlarm({
          device_id: telemetry.device_id,
          flame_detected: telemetry.flame_detected,
          local_alarm: telemetry.local_alarm,
          temperature: telemetry.temperature,
          gas_ppm: telemetry.gas_ppm,
          timestamp: telemetry.timestamp,
        });
      } else if (activeAlarm?.device_id === telemetry.device_id) {
        // Hết báo động
        setActiveAlarm(null);
      }
    },
    onStatus: (statusPayload) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === statusPayload.device_id
            ? { ...dev, status: statusPayload.status as 'ONLINE' | 'OFFLINE' }
            : dev
        )
      );
    },
    onAlarm: (alarmPayload) => {
      setActiveAlarm({
        ...alarmPayload,
        timestamp: alarmPayload.timestamp || Math.floor(Date.now() / 1000),
      });
    },
    onAck: (ackPayload) => {
      console.log(`[Dashboard ACK]: Lệnh ${ackPayload.command_id} - ${ackPayload.status}: ${ackPayload.message}`);
      fetchDevices();
    },
  });

  // Cơ chế dự phòng: Tự động cập nhật dữ liệu định kỳ 5s nếu Backend chưa bật WebSocket
  useEffect(() => {
    if (!wsConnected) {
      const interval = setInterval(() => {
        fetchDevices();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [wsConnected, fetchDevices]);

  // Xử lý tắt còi nhanh (MUTE_BUZZER 30/60/120s)
  const handleQuickMute = async (deviceId: string, durationSec: 30 | 60 | 120 = 60) => {
    await executeCommand(
      deviceId,
      'MUTE_BUZZER',
      { duration_sec: durationSec },
      `Tắt còi ${durationSec}s [${deviceId}]`
    );
    setActiveAlarm(null);
    fetchDevices();
  };

  // Thống kê tổng hợp
  const totalCount = devices.length;
  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
  const alarmCount = devices.filter(
    (d) =>
      d.latest_flame ||
      d.latest_alarm ||
      (d.latest_temp ?? 0) >= d.temp_threshold ||
      (d.latest_gas ?? 0) >= d.gas_threshold
  ).length;
  const maxTemp = Math.max(...devices.map((d) => d.latest_temp ?? 0), 0);

  // Lọc thiết bị theo tìm kiếm và tab
  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'ONLINE') return device.status === 'ONLINE';
    if (statusFilter === 'OFFLINE') return device.status === 'OFFLINE';
    if (statusFilter === 'ALARM') {
      return (
        device.latest_flame ||
        device.latest_alarm ||
        (device.latest_temp ?? 0) >= device.temp_threshold ||
        (device.latest_gas ?? 0) >= device.gas_threshold
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col selection:bg-red-500 selection:text-white">
      {/* Thanh điều hướng Header */}
      <Navbar
        wsConnected={wsConnected}
        connectionStatus={connectionStatus}
        reconnectAttempts={reconnectAttempts}
      />

      {/* Banner Cảnh báo cháy khẩn cấp thời gian thực kèm âm thanh còi hú */}
      <AlarmBanner alarmEvent={activeAlarm} onMute={handleQuickMute} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Banner tóm tắt phân quyền RBAC & Đồng bộ */}
        <div className="p-3.5 rounded-2xl glass-panel border border-gray-800 bg-gray-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-center gap-2 text-gray-300">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>
              Đang đăng nhập với vai trò <b className="text-white">{user?.role}</b> ({user?.username || user?.fullName}).{' '}
              {user?.role === 'ADMIN'
                ? 'Toàn quyền giám sát, điều khiển và cấu hình toàn bộ thiết bị.'
                : user?.role === 'OPERATOR'
                ? 'Bạn có quyền giám sát và gửi lệnh điều khiển các thiết bị được phân công trong bảng user_devices.'
                : 'Quyền Viewer (Chỉ đọc). Mọi thao tác gửi lệnh hoặc cấu hình sẽ nhận HTTP 403 Forbidden.'}
            </span>
          </div>
          <button
            onClick={fetchDevices}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 transition-all font-semibold ml-auto sm:ml-0 shadow-sm active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            Đồng bộ
          </button>
        </div>

        {/* Thanh chuyển đổi phân hệ chính (Tabs: Giám sát Thiết bị vs Lịch sử Cảnh báo) */}
        <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
          <button
            onClick={() => setMainTab('DEVICES')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
              mainTab === 'DEVICES'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <Layers size={16} />
            <span>Giám sát Thiết bị ({totalCount})</span>
          </button>

          <button
            onClick={() => setMainTab('ALERTS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
              mainTab === 'ALERTS'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-gray-900'
            }`}
          >
            <History size={16} />
            <span>Nhật ký Cảnh báo Sự cố</span>
            {alarmCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>
        </div>

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 1: GIÁM SÁT THIẾT BỊ                                */}
        {/* ================================================================= */}
        {mainTab === 'DEVICES' && (
          <div className="space-y-6">
            {/* Các thẻ thống kê nhanh (Metric Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Tổng thiết bị phụ trách"
                value={totalCount}
                subtitle={user?.role === 'ADMIN' ? 'Toàn bộ xưởng/tòa nhà' : 'Thiết bị được phân công'}
                icon={<Cpu className="w-5 h-5 text-cyan-400" />}
              />
              <MetricCard
                title="Đang trực tuyến"
                value={`${onlineCount} / ${totalCount}`}
                subtitle="Đang truyền telemetry qua MQTT"
                icon={<Radio className="w-5 h-5 text-emerald-400" />}
                trend={onlineCount > 0 ? 'safe' : 'normal'}
              />
              <MetricCard
                title="Cảnh báo / Nguy hiểm"
                value={alarmCount}
                subtitle={alarmCount > 0 ? 'Có cảm biến vượt ngưỡng/phát hiện lửa' : 'Trạng thái hoàn toàn an toàn'}
                icon={<Flame className="w-5 h-5 text-red-500" />}
                trend={alarmCount > 0 ? 'danger' : 'safe'}
              />
              <MetricCard
                title="Nhiệt độ cao nhất"
                value={maxTemp > 0 ? `${maxTemp.toFixed(1)}°C` : '--'}
                subtitle="Ghi nhận từ cảm biến"
                icon={<Thermometer className="w-5 h-5 text-amber-400" />}
                trend={maxTemp >= 50 ? 'warning' : 'normal'}
              />
            </div>

            {/* Bộ lọc và Tìm kiếm */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              {/* Tabs lọc trạng thái */}
              <div className="flex items-center gap-1 bg-gray-900/90 p-1 rounded-xl border border-gray-800 text-xs w-full sm:w-auto overflow-x-auto shadow-sm">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    statusFilter === 'ALL' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Tất cả ({totalCount})
                </button>
                <button
                  onClick={() => setStatusFilter('ONLINE')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    statusFilter === 'ONLINE'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Trực tuyến ({onlineCount})
                </button>
                <button
                  onClick={() => setStatusFilter('ALARM')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    statusFilter === 'ALARM'
                      ? 'bg-red-950 text-red-400 border border-red-500/30'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Báo động ({alarmCount})
                </button>
                <button
                  onClick={() => setStatusFilter('OFFLINE')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                    statusFilter === 'OFFLINE' ? 'bg-gray-800 text-gray-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Ngoại tuyến ({totalCount - onlineCount})
                </button>
              </div>

              {/* Ô tìm kiếm */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, vị trí, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-900/80 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Lưới hiển thị danh sách thiết bị kèm các trạng thái Loading / Error / Empty */}
            {isLoading && devices.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="rounded-2xl border border-gray-800 p-5 bg-gray-900/40 animate-pulse space-y-4">
                    <div className="h-4 bg-gray-800 rounded w-1/2" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-16 bg-gray-800/60 rounded-xl" />
                      <div className="h-16 bg-gray-800/60 rounded-xl" />
                    </div>
                    <div className="h-8 bg-gray-800/50 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : deviceFetchError && devices.length === 0 ? (
              <div className="p-8 rounded-2xl bg-red-950/40 border border-red-500/40 text-center space-y-3">
                <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
                <h3 className="text-base font-bold text-white">Chế độ Ngoại tuyến</h3>
                <p className="text-xs text-red-200">{deviceFetchError}</p>
                <button
                  onClick={fetchDevices}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  Thử lại
                </button>
              </div>
            ) : filteredDevices.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredDevices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onSelect={(d) => setSelectedDevice(d)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center glass-panel rounded-2xl border border-gray-800">
                <Filter className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white mb-1">Không tìm thấy thiết bị nào</h4>
                <p className="text-xs text-gray-400">Vui lòng thử thay đổi từ khóa tìm kiếm hoặc bỏ bộ lọc trạng thái.</p>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* NỘI DUNG TAB 2: NHẬT KÝ CẢNH BÁO SỰ CỐ                           */}
        {/* ================================================================= */}
        {mainTab === 'ALERTS' && <AlertHistoryTable />}
      </main>

      {/* Modal chi tiết thiết bị & Đồ thị Recharts */}
      {selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onDeviceUpdated={fetchDevices}
        />
      )}
    </div>
  );
};
