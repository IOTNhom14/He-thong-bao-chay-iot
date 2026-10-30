import React, { useState } from 'react';
import type { DeviceItem } from '../api/device.api';
import { useAuth } from '../context/AuthContext';
import { useCommandTracker } from '../context/CommandTrackerContext';
import {
  Thermometer,
  Wind,
  Droplets,
  Flame,
  Bell,
  VolumeX,
  Eye,
  ShieldAlert,
  Clock,
  MapPin,
  BellRing,
  Loader2,
  ChevronDown,
} from 'lucide-react';

interface DeviceCardProps {
  device: DeviceItem;
  onSelect: (device: DeviceItem) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onSelect }) => {
  const { isViewer } = useAuth();
  const { executeCommand, isDeviceWaitingAck } = useCommandTracker();

  const [isMuteMenuOpen, setIsMuteMenuOpen] = useState(false);

  const isOnline = device.status === 'ONLINE';
  const isDecommissioned = device.status === 'DECOMMISSIONED';
  const isWaitingAck = isDeviceWaitingAck(device.id);

  const temp = device.latest_temp ?? 0;
  const gas = device.latest_gas ?? 0;
  const humidity = device.latest_humidity ?? 0;
  const hasFlame = Boolean(device.latest_flame);
  const isAlarming = Boolean(device.latest_alarm);
  const isMuted = Boolean(device.is_muted);

  // Kiểm tra ngưỡng cảnh báo
  const isTempDanger = temp >= device.temp_threshold;
  const isTempWarning = !isTempDanger && temp >= device.temp_threshold - 5 && temp > 0;

  const isGasDanger = gas >= device.gas_threshold;
  const isGasWarning = !isGasDanger && gas >= device.gas_threshold - 50 && gas > 0;

  // Cảnh báo khẩn cấp nếu có lửa, còi hú hoặc bất kỳ thông số nào vượt ngưỡng
  const isDanger = hasFlame || isAlarming || isTempDanger || isGasDanger;
  const isWarning = isTempWarning || isGasWarning;

  // Format thời điểm cập nhật cuối
  const formatLastSeen = () => {
    if (!device.latest_telemetry_time && !device.last_seen) return 'Chưa có dữ liệu';
    const ts = device.latest_telemetry_time
      ? device.latest_telemetry_time * 1000
      : new Date(device.last_seen!).getTime();
    return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleMute = async (durationSec: 30 | 60 | 120) => {
    setIsMuteMenuOpen(false);
    await executeCommand(
      device.id,
      'MUTE_BUZZER',
      { duration_sec: durationSec },
      `Tắt còi ${durationSec}s [${device.id}]`
    );
  };

  const handleTestAlarm = async () => {
    await executeCommand(
      device.id,
      'TEST_ALARM',
      { duration_sec: 5 },
      `Test còi 5s [${device.id}]`
    );
  };

  return (
    <div
      className={`rounded-3xl border transition-all duration-300 p-5 flex flex-col justify-between relative overflow-hidden backdrop-blur-xl ${
        isDanger
          ? 'border-red-500/80 bg-red-950/25 shadow-xl shadow-red-900/30 ring-1 ring-red-500/50'
          : isWarning
          ? 'border-amber-500/60 bg-amber-950/15 shadow-lg shadow-amber-900/20'
          : 'border-gray-800 hover:border-gray-700 bg-gray-900/50 shadow-md'
      }`}
    >
      {/* Thanh viền trạng thái cảnh báo trên cùng */}
      {isDanger && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 animate-pulse" />
      )}

      {/* Badge hiển thị trạng thái đang chờ ACK */}
      {isWaitingAck && (
        <div className="absolute top-0 right-0 left-0 bg-cyan-950/90 border-b border-cyan-500/40 text-cyan-300 px-3 py-1 text-[11px] font-bold flex items-center justify-center gap-1.5 z-10 animate-pulse">
          <Loader2 size={12} className="animate-spin text-cyan-400" />
          <span>Đang chờ phản hồi ACK từ thiết bị (tối đa 10s)...</span>
        </div>
      )}

      <div>
        {/* Header card: Tên, Vị trí & Badge Online/Offline */}
        <div className={`flex items-start justify-between gap-3 mb-3 ${isWaitingAck ? 'mt-4' : ''}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-white truncate tracking-wide" title={device.name}>
                {device.name}
              </h3>
              {isMuted && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40 font-medium flex items-center gap-1 shadow-sm">
                  <VolumeX className="w-3 h-3 text-amber-400" /> Đã tắt còi
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="truncate">{device.location}</span>
            </div>
            <div className="text-[11px] font-mono text-gray-500 mt-0.5">ID: {device.id}</div>
          </div>

          {/* Badge Online/Offline/Decommissioned */}
          <div className="flex-shrink-0">
            {isDecommissioned ? (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-800 text-gray-400 border border-gray-700">
                Đã thu hồi
              </span>
            ) : (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 border shadow-sm ${
                  isOnline
                    ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/50'
                    : 'bg-rose-950/70 text-rose-300 border-rose-800/60'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                />
                {isOnline ? 'TRỰC TUYẾN' : 'NGOẠI TUYẾN'}
              </span>
            )}
          </div>
        </div>

        {/* Lưới 4 chỉ số cảm biến (Nhiệt độ, Khí Gas, Lửa, Còi báo) */}
        <div className="grid grid-cols-2 gap-2.5 my-3">
          {/* 1. Nhiệt độ & Độ ẩm */}
          <div
            className={`p-3 rounded-2xl border transition-colors ${
              isTempDanger
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : isTempWarning
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                : 'bg-gray-950/60 border-gray-800 text-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400 font-medium">Nhiệt độ</span>
              <div
                className={`p-1.5 rounded-lg ${
                  isTempDanger ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                <Thermometer className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-lg font-extrabold font-mono ${
                isTempDanger ? 'text-red-400' : isTempWarning ? 'text-amber-400' : 'text-white'
              }`}
            >
              {temp > 0 ? `${temp.toFixed(1)}°C` : '--'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
              <Droplets className="w-3 h-3 text-cyan-400" />
              <span>Độ ẩm: {humidity > 0 ? `${humidity.toFixed(0)}%` : '--'}</span>
            </div>
          </div>

          {/* 2. Khí Gas (PPM) */}
          <div
            className={`p-3 rounded-2xl border transition-colors ${
              isGasDanger
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : isGasWarning
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                : 'bg-gray-950/60 border-gray-800 text-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400 font-medium">Khí Gas (PPM)</span>
              <div
                className={`p-1.5 rounded-lg ${
                  isGasDanger ? 'bg-red-500/20 text-red-400' : 'bg-cyan-500/10 text-cyan-400'
                }`}
              >
                <Wind className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-lg font-extrabold font-mono ${
                isGasDanger ? 'text-red-400' : isGasWarning ? 'text-amber-400' : 'text-white'
              }`}
            >
              {gas > 0 ? `${gas.toFixed(1)}` : '--'}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={`Ngưỡng: ${device.gas_threshold} ppm`}>
              Ngưỡng: {device.gas_threshold} ppm
            </div>
          </div>

          {/* 3. Cảm biến lửa (Flame Sensor) */}
          <div
            className={`p-3 rounded-2xl border transition-colors ${
              hasFlame
                ? 'bg-red-950/80 border-red-500 text-red-100'
                : 'bg-gray-950/60 border-gray-800 text-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400 font-medium">Cảm biến Lửa</span>
              <div
                className={`p-1.5 rounded-lg ${
                  hasFlame ? 'bg-red-600 text-white animate-bounce' : 'bg-emerald-500/10 text-emerald-400'
                }`}
              >
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-sm font-bold mt-1 ${
                hasFlame ? 'text-red-400 animate-pulse' : 'text-emerald-400'
              }`}
            >
              {hasFlame ? '🔥 CÓ LỬA!' : 'An toàn'}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">Trạng thái quang học</div>
          </div>

          {/* 4. Còi báo động (Buzzer Alarm) */}
          <div
            className={`p-3 rounded-2xl border transition-colors ${
              isAlarming
                ? 'bg-red-950/80 border-red-500 text-red-100'
                : 'bg-gray-950/60 border-gray-800 text-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-400 font-medium">Còi báo động</span>
              <div
                className={`p-1.5 rounded-lg ${
                  isAlarming ? 'bg-red-600 text-white animate-spin' : 'bg-gray-800 text-gray-400'
                }`}
              >
                <Bell className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-sm font-bold mt-1 ${
                isAlarming ? 'text-red-400 animate-pulse' : 'text-gray-300'
              }`}
            >
              {isAlarming ? '🚨 ĐANG HÚ' : 'Yên lặng'}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">Còi còi/chuông cục bộ</div>
          </div>
        </div>

        {/* Thời điểm nhận tin cuối */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-3 px-1">
          <Clock className="w-3 h-3" />
          <span>Cập nhật: {formatLastSeen()}</span>
        </div>
      </div>

      {/* Footer Card: Nút Hành động */}
      <div className="space-y-2 pt-3 border-t border-gray-800/80 mt-auto">
        <div className="flex items-center gap-2">
          {/* Nút Xem chi tiết */}
          <button
            type="button"
            onClick={() => onSelect(device)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-all shadow-sm active:scale-98"
          >
            <Eye className="w-4 h-4 text-cyan-400" />
            Chi tiết & Đồ thị
          </button>

          {/* Nút Test còi (Disabled với VIEWER) */}
          {isViewer ? (
            <button
              type="button"
              disabled
              className="flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-500 text-xs cursor-not-allowed opacity-50"
              title="Tài khoản Viewer (Chỉ đọc): Không có quyền phát lệnh (Chốt chặn 403)"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Test (403)
            </button>
          ) : (
            <button
              type="button"
              disabled={isWaitingAck}
              onClick={handleTestAlarm}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm disabled:opacity-50"
              title="Gửi lệnh TEST_ALARM tới ESP32"
            >
              {isWaitingAck ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5 text-rose-400" />}
              Test còi
            </button>
          )}
        </div>

        {/* Nút Tắt còi (30s / 60s / 120s) */}
        <div className="relative">
          {isViewer ? (
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-500 text-xs cursor-not-allowed opacity-50"
              title="Tài khoản Viewer: Không có quyền tắt còi (Chốt chặn 403 Forbidden)"
            >
              <ShieldAlert className="w-4 h-4 text-gray-500" />
              Tắt còi (Chỉ đọc - 403)
            </button>
          ) : (
            <div>
              <button
                type="button"
                disabled={isWaitingAck}
                onClick={() => setIsMuteMenuOpen((prev) => !prev)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-98 shadow-sm disabled:opacity-50"
              >
                {isWaitingAck ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-amber-400" />
                )}
                <span>Tắt còi (30s / 60s / 120s)</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-amber-400" />
              </button>

              {/* Menu chọn thời gian tắt còi */}
              {isMuteMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 p-1.5 rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl z-20 flex flex-col gap-1 text-xs animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-[10px] text-gray-400 font-semibold border-b border-gray-800">
                    Chọn thời gian tắt còi tạm thời:
                  </div>
                  <button
                    onClick={() => handleMute(30)}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-amber-500/20 text-gray-200 hover:text-amber-300 font-medium transition-colors"
                  >
                    <span>Tắt còi 30 giây</span>
                    <span className="font-mono text-amber-400 text-[11px]">30s</span>
                  </button>
                  <button
                    onClick={() => handleMute(60)}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-amber-500/20 text-gray-200 hover:text-amber-300 font-medium transition-colors"
                  >
                    <span>Tắt còi 60 giây (Mặc định)</span>
                    <span className="font-mono text-amber-400 text-[11px]">60s</span>
                  </button>
                  <button
                    onClick={() => handleMute(120)}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-amber-500/20 text-gray-200 hover:text-amber-300 font-medium transition-colors"
                  >
                    <span>Tắt còi 120 giây (2 phút)</span>
                    <span className="font-mono text-amber-400 text-[11px]">120s</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
