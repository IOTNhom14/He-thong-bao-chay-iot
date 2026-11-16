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
  LayoutGrid,
  TableProperties,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { executeCommand } = useCommandTracker();
  const [mainTab, setMainTab] = useState<'DEVICES' | 'ALERTS'>('DEVICES');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');

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

  // Tải danh sách thiết bị từ Gateway API
  const fetchDevices = useCallback(async () => {
    setIsLoading(true);
    setDeviceFetchError(null);
    try {
      const data = await DeviceApi.getDevices();
      setDevices(data);

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

  // Cơ chế dự phòng: Tự động cập nhật dữ liệu định kỳ 5s nếu WebSocket ngắt
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

  // Lọc thiết bị
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
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans">
      {/* Header điều hướng */}
      <Navbar
        wsConnected={wsConnected}
        connectionStatus={connectionStatus}
        reconnectAttempts={reconnectAttempts}
      />

      {/* Banner Cảnh báo cháy khẩn cấp thời gian thực */}
      <AlarmBanner alarmEvent={activeAlarm} onMute={handleQuickMute} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-5 space-y-5">
        {/* Thanh trạng thái phiên trực & Phân quyền RBAC */}
        <section aria-label="Thông tin trạm" className="p-3 rounded-md border border-zinc-800 bg-[#111318] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Info className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <span>
              Ca trực: <strong className="text-zinc-100 font-mono">{user?.role}</strong> ({user?.username || user?.fullName}).{' '}
              {user?.role === 'ADMIN'
                ? 'Toàn quyền giám sát & cấu hình toàn bộ hệ thống trạm.'
                : user?.role === 'OPERATOR'
                ? 'Quyền giám sát & phát lệnh điều khiển tới các node được phân quyền.'
                : 'Quyền xem (Chỉ đọc). Mọi thao tác điều khiển bị hạn chế theo chính sách bảo mật.'}
            </span>
          </div>
          <button
            type="button"
            onClick={fetchDevices}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-mono text-xs transition-colors ml-auto sm:ml-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-zinc-400' : 'text-zinc-400'}`} />
            <span>Đồng bộ</span>
          </button>
        </section>

        {/* Thanh chuyển đổi phân hệ (Tabs: Giám sát vs Nhật ký sự cố) */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <button
            type="button"
            onClick={() => setMainTab('DEVICES')}
            className={`flex items-center gap-2 px-3 py-2 rounded font-semibold text-xs transition-colors ${
              mainTab === 'DEVICES'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <Layers size={15} />
            <span>Giám sát Thiết bị ({totalCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('ALERTS')}
            className={`flex items-center gap-2 px-3 py-2 rounded font-semibold text-xs transition-colors ${
              mainTab === 'ALERTS'
                ? 'bg-red-950 text-red-200 border border-red-800'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <History size={15} />
            <span>Nhật ký Sự cố</span>
            {alarmCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>
        </div>

        {/* ================================================================= */}
        {/* TAB 1: GIÁM SÁT THIẾT BỊ                                         */}
        {/* ================================================================= */}
        {mainTab === 'DEVICES' && (
          <div className="space-y-5">
            {/* Các thẻ chỉ số kỹ thuật tổng quan (KPI Blocks) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <MetricCard
                title="Tổng Node phụ trách"
                value={totalCount}
                subtitle={user?.role === 'ADMIN' ? 'Toàn bộ trạm giám sát' : 'Node được phân công'}
                icon={<Cpu className="w-5 h-5" />}
              />
              <MetricCard
                title="Node trực tuyến"
                value={`${onlineCount} / ${totalCount}`}
                subtitle="Đang truyền telemetry qua MQTT"
                icon={<Radio className="w-5 h-5" />}
                trend={onlineCount > 0 ? 'safe' : 'normal'}
              />
              <MetricCard
                title="Node có cảnh báo"
                value={alarmCount}
                subtitle={alarmCount > 0 ? 'Vượt ngưỡng nhiệt/gas hoặc phát hiện lửa' : 'Hệ thống an toàn'}
                icon={<Flame className="w-5 h-5" />}
                trend={alarmCount > 0 ? 'danger' : 'safe'}
              />
              <MetricCard
                title="Nhiệt độ đỉnh"
                value={maxTemp > 0 ? `${maxTemp.toFixed(1)}°C` : '--'}
                subtitle="Đo đạc từ các trạm cảm biến"
                icon={<Thermometer className="w-5 h-5" />}
                trend={maxTemp >= 50 ? 'warning' : 'normal'}
              />
            </div>

            {/* Thanh điều khiển: Bộ lọc trạng thái, Chế độ xem & Ô tìm kiếm */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              {/* Nút lọc trạng thái */}
              <div className="flex items-center gap-1 bg-[#111318] p-1 rounded-md border border-zinc-800 text-xs w-full sm:w-auto overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    statusFilter === 'ALL' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Tất cả ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ONLINE')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    statusFilter === 'ONLINE'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Trực tuyến ({onlineCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALARM')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    statusFilter === 'ALARM'
                      ? 'bg-red-950 text-red-300 border border-red-700'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Báo động ({alarmCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('OFFLINE')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    statusFilter === 'OFFLINE' ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Ngoại tuyến ({totalCount - onlineCount})
                </button>
              </div>

              {/* Ô tìm kiếm & Chuyển đổi Card / Table */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Tìm theo tên, vị trí, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#111318] border border-zinc-800 rounded-md pl-8 pr-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none transition-colors"
                  />
                </div>

                {/* Chế độ xem: Dạng Lưới Card vs Dạng Bảng Dữ liệu */}
                <div className="flex items-center bg-[#111318] border border-zinc-800 p-0.5 rounded-md">
                  <button
                    type="button"
                    onClick={() => setViewMode('CARDS')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'CARDS' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title="Chế độ xem Thẻ Rack"
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('TABLE')}
                    className={`p-1.5 rounded transition-colors ${
                      viewMode === 'TABLE' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                    title="Chế độ xem Bảng ma trận dữ liệu"
                  >
                    <TableProperties size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Danh sách thiết bị */}
            {isLoading && devices.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="rounded-md border border-zinc-800 p-4 bg-[#111318] space-y-3">
                    <div className="h-4 bg-zinc-800 rounded w-1/3" />
                    <div className="h-8 bg-zinc-800/60 rounded" />
                    <div className="h-8 bg-zinc-800/60 rounded" />
                    <div className="h-8 bg-zinc-800/40 rounded" />
                  </div>
                ))}
              </div>
            ) : deviceFetchError && devices.length === 0 ? (
              <div className="p-6 rounded-md bg-red-950/40 border border-red-800 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <h3 className="text-sm font-bold text-white uppercase">Mất kết nối Gateway</h3>
                <p className="text-xs text-red-200">{deviceFetchError}</p>
                <button
                  type="button"
                  onClick={fetchDevices}
                  className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
                >
                  Thử lại
                </button>
              </div>
            ) : filteredDevices.length > 0 ? (
              viewMode === 'CARDS' ? (
                /* CHẾ ĐỘ 1: LƯỚI CARD CÔNG NGHIỆP */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDevices.map((device) => (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      onSelect={(d) => setSelectedDevice(d)}
                    />
                  ))}
                </div>
              ) : (
                /* CHẾ ĐỘ 2: BẢNG MA TRẬN DỮ LIỆU KỸ THUẬT */
                <div className="border border-zinc-800 rounded-md overflow-x-auto bg-[#111318]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-[#0e1015] text-[11px] text-zinc-400 font-mono uppercase tracking-wider">
                        <th className="py-2.5 px-3">Trạng thái</th>
                        <th className="py-2.5 px-3">Node & Vị trí</th>
                        <th className="py-2.5 px-3">Nhiệt độ (°C)</th>
                        <th className="py-2.5 px-3">Khí Gas (PPM)</th>
                        <th className="py-2.5 px-3">Lửa</th>
                        <th className="py-2.5 px-3">Còi</th>
                        <th className="py-2.5 px-3">Thời điểm</th>
                        <th className="py-2.5 px-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80 font-mono">
                      {filteredDevices.map((dev) => {
                        const temp = dev.latest_temp ?? 0;
                        const gas = dev.latest_gas ?? 0;
                        const isTempDanger = temp >= dev.temp_threshold;
                        const isGasDanger = gas >= dev.gas_threshold;
                        const hasFlame = Boolean(dev.latest_flame);
                        const isAlarm = Boolean(dev.latest_alarm);
                        const isCritical = hasFlame || isAlarm || isTempDanger || isGasDanger;

                        return (
                          <tr
                            key={dev.id}
                            className={`hover:bg-zinc-800/40 transition-colors ${
                              isCritical ? 'bg-red-950/20' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isCritical ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-600">
                                  BÁO ĐỘNG
                                </span>
                              ) : dev.status === 'ONLINE' ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  ONLINE
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-zinc-500 border border-zinc-700">
                                  OFFLINE
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-sans font-semibold text-zinc-100">{dev.name}</div>
                              <div className="text-[11px] text-zinc-400">{dev.location} · ID: {dev.id}</div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                              <span className={`font-bold ${isTempDanger ? 'text-red-400' : 'text-zinc-200'}`}>
                                {temp > 0 ? `${temp.toFixed(1)}°C` : '--'}
                              </span>
                              <span className="text-zinc-500 text-[10px] ml-1">/ {dev.temp_threshold}°C</span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                              <span className={`font-bold ${isGasDanger ? 'text-red-400' : 'text-zinc-200'}`}>
                                {gas > 0 ? `${gas.toFixed(0)}` : '--'}
                              </span>
                              <span className="text-zinc-500 text-[10px] ml-1">/ {dev.gas_threshold}</span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={hasFlame ? 'text-red-400 font-bold' : 'text-zinc-400'}>
                                {hasFlame ? 'CÓ LỬA' : 'An toàn'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className={isAlarm ? 'text-red-400 font-bold' : 'text-zinc-400'}>
                                {isAlarm ? 'HÚ CÒI' : dev.is_muted ? 'ĐÃ TẮT' : 'Yên lặng'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-zinc-500 text-[11px] tabular-nums">
                              {dev.latest_telemetry_time
                                ? new Date(dev.latest_telemetry_time * 1000).toLocaleTimeString('vi-VN')
                                : '--'}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedDevice(dev)}
                                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-sans text-xs transition-colors"
                              >
                                Chi tiết
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="py-16 text-center rounded-md border border-zinc-800 bg-[#111318]">
                <Filter className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-zinc-300">Không tìm thấy thiết bị phù hợp</h4>
                <p className="text-xs text-zinc-500 mt-1">Vui lòng điều chỉnh từ khóa tìm kiếm hoặc bộ lọc trạng thái.</p>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: NHẬT KÝ SỰ CỐ                                             */}
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
