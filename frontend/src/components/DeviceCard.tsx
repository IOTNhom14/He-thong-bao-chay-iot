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

  // Ngưỡng cảnh báo
  const isTempDanger = temp >= device.temp_threshold;
  const isTempWarning = !isTempDanger && temp >= device.temp_threshold - 5 && temp > 0;

  const isGasDanger = gas >= device.gas_threshold;
  const isGasWarning = !isGasDanger && gas >= device.gas_threshold - 50 && gas > 0;

  // Cảnh báo khẩn cấp
  const isDanger = hasFlame || isAlarming || isTempDanger || isGasDanger;
  const isWarning = !isDanger && (isTempWarning || isGasWarning);

  // Tính tỷ lệ thanh đo
  const tempRatio = Math.min(100, Math.max(0, (temp / Math.max(device.temp_threshold * 1.25, 60)) * 100));
  const gasRatio = Math.min(100, Math.max(0, (gas / Math.max(device.gas_threshold * 1.25, 400)) * 100));

  const formatLastSeen = () => {
    if (!device.latest_telemetry_time && !device.last_seen) return 'Chưa có tin';
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
      className={`rounded-md border p-4 flex flex-col justify-between relative transition-colors ${
        isDanger
          ? 'border-red-600 bg-[#170e10]'
          : isWarning
          ? 'border-amber-600/70 bg-[#15120a]'
          : 'border-zinc-800 bg-[#111318] hover:border-zinc-700'
      }`}
    >
      {/* Notch chỉ thị trên đỉnh thẻ khi có sự cố */}
      {isDanger ? (
        <div className="absolute top-0 left-0 right-0 h-1 bg-red-600" />
      ) : isWarning ? (
        <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
      ) : null}

      {/* Banner chờ phản hồi ACK */}
      {isWaitingAck && (
        <div className="absolute top-0 right-0 left-0 bg-sky-950 border-b border-sky-500/40 text-sky-200 px-2 py-0.5 text-[11px] font-mono font-semibold flex items-center justify-center gap-1.5 z-10">
          <Loader2 size={12} className="animate-spin text-sky-400" />
          <span>Đang chờ ACK từ thiết bị...</span>
        </div>
      )}

      <div>
        {/* Header: Tên vị trí, ID & Trạng thái kết nối */}
        <div className={`flex items-start justify-between gap-2 pb-2.5 border-b border-zinc-800/80 ${isWaitingAck ? 'mt-4' : ''}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm text-zinc-100 truncate" title={device.name}>
                {device.name}
              </h3>
              {isMuted && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 font-medium">
                  MUTED
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 text-zinc-500 flex-shrink-0" />
              <span className="truncate">{device.location}</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-500 mt-0.5">ID: {device.id}</div>
          </div>

          <div className="flex-shrink-0">
            {isDecommissioned ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-zinc-900 text-zinc-500 border border-zinc-800">
                THU HỒI
              </span>
            ) : isDanger ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-red-950 text-red-300 border border-red-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> BÁO ĐỘNG
              </span>
            ) : isOnline ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> ONLINE
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-zinc-900 text-zinc-400 border border-zinc-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> OFFLINE
              </span>
            )}
          </div>
        </div>

        {/* Thanh đo mức Gauge Telemetry */}
        <div className="space-y-3 my-3">
          {/* 1. Nhiệt độ & Độ ẩm */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-zinc-500" /> Nhiệt độ:
              </span>
              <div className="font-mono tabular-nums">
                <span className={`font-bold text-sm ${isTempDanger ? 'text-red-400' : isTempWarning ? 'text-amber-400' : 'text-zinc-100'}`}>
                  {temp > 0 ? `${temp.toFixed(1)}°C` : '--'}
                </span>
                <span className="text-zinc-500 text-[11px] ml-1">/ {device.temp_threshold}°C</span>
              </div>
            </div>
            {/* Visual Level Bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-sm overflow-hidden mt-1.5">
              <div
                className={`h-full transition-all duration-300 ${
                  isTempDanger ? 'bg-red-500' : isTempWarning ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${tempRatio}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1">
              <span className="flex items-center gap-1">
                <Droplets className="w-3 h-3 text-zinc-500" /> Độ ẩm: {humidity > 0 ? `${humidity.toFixed(0)}%` : '--'}
              </span>
              <span>Ngưỡng ngắt: {device.temp_threshold}°C</span>
            </div>
          </div>

          {/* 2. Khí Gas (MQ-2) */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1">
                <Wind className="w-3.5 h-3.5 text-zinc-500" /> Khí Gas:
              </span>
              <div className="font-mono tabular-nums">
                <span className={`font-bold text-sm ${isGasDanger ? 'text-red-400' : isGasWarning ? 'text-amber-400' : 'text-zinc-100'}`}>
                  {gas > 0 ? `${gas.toFixed(0)}` : '--'}
                </span>
                <span className="text-zinc-500 text-[11px] ml-1">/ {device.gas_threshold} PPM</span>
              </div>
            </div>
            {/* Visual Level Bar */}
            <div className="w-full h-1.5 bg-zinc-800 rounded-sm overflow-hidden mt-1.5">
              <div
                className={`h-full transition-all duration-300 ${
                  isGasDanger ? 'bg-red-500' : isGasWarning ? 'bg-amber-500' : 'bg-sky-500'
                }`}
                style={{ width: `${gasRatio}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-1">
              <span>Nồng độ khí cháy</span>
              <span>Ngưỡng: {device.gas_threshold} PPM</span>
            </div>
          </div>

          {/* Trạng thái nhị phân: Cảm biến lửa & Còi */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className={`p-2 rounded border text-xs flex items-center justify-between ${
              hasFlame ? 'bg-red-950/70 border-red-600 text-red-300' : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400'
            }`}>
              <span className="flex items-center gap-1 text-[11px]">
                <Flame className="w-3.5 h-3.5" /> Lửa:
              </span>
              <strong className="font-mono font-bold text-[11px]">
                {hasFlame ? 'PHÁT HIỆN' : 'AN TOÀN'}
              </strong>
            </div>

            <div className={`p-2 rounded border text-xs flex items-center justify-between ${
              isAlarming ? 'bg-red-950/70 border-red-600 text-red-300' : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400'
            }`}>
              <span className="flex items-center gap-1 text-[11px]">
                <Bell className="w-3.5 h-3.5" /> Còi:
              </span>
              <strong className="font-mono font-bold text-[11px]">
                {isAlarming ? 'ĐANG HÚ' : 'YÊN LẶNG'}
              </strong>
            </div>
          </div>
        </div>

        {/* Cập nhật lần cuối */}
        <div className="flex items-center gap-1 text-[11px] text-zinc-500 mb-3 font-mono tabular-nums">
          <Clock className="w-3 h-3 text-zinc-600" />
          <span>Cập nhật: {formatLastSeen()}</span>
        </div>
      </div>

      {/* Footer tác chiến: Nút thao tác phần cứng */}
      <div className="space-y-1.5 pt-2.5 border-t border-zinc-800 mt-auto">
        <div className="flex items-center gap-1.5">
          {/* Nút Xem chi tiết */}
          <button
            type="button"
            onClick={() => onSelect(device)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-zinc-400" />
            <span>Chi tiết & Logs</span>
          </button>

          {/* Nút Test còi (5s) */}
          {isViewer ? (
            <button
              type="button"
              disabled
              className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-600 text-xs cursor-not-allowed opacity-50"
              title="Viewer: Chỉ đọc (Không có quyền phát lệnh)"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Khóa (403)</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isWaitingAck}
              onClick={handleTestAlarm}
              className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-700/60 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Phát lệnh test còi 5s tới ESP32"
            >
              {isWaitingAck ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5 text-red-400" />}
              <span>Test 5s</span>
            </button>
          )}
        </div>

        {/* Nút Tắt còi (Dropdown) */}
        <div className="relative">
          {isViewer ? (
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-600 text-xs cursor-not-allowed opacity-50"
              title="Viewer: Không có quyền tắt còi"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Tắt còi (Chỉ đọc)</span>
            </button>
          ) : (
            <div>
              <button
                type="button"
                disabled={isWaitingAck}
                onClick={() => setIsMuteMenuOpen((prev) => !prev)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded bg-amber-950/40 hover:bg-amber-900/40 text-amber-300 border border-amber-600/40 text-xs font-medium transition-colors disabled:opacity-50"
              >
                {isWaitingAck ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Ngắt còi tạm thời</span>
                <ChevronDown className="w-3 h-3 ml-0.5 text-amber-400" />
              </button>

              {/* Menu thời gian tắt còi */}
              {isMuteMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1.5 p-1 rounded-md bg-[#16181f] border border-zinc-700 shadow-xl z-20 flex flex-col gap-0.5 text-xs">
                  <div className="px-2 py-1 text-[10px] text-zinc-400 font-semibold border-b border-zinc-800">
                    Thời gian ngắt còi:
                  </div>
                  <button
                    type="button"
                    onClick={() => handleMute(30)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-amber-500/10 text-zinc-200 hover:text-amber-300 transition-colors"
                  >
                    <span>Ngắt còi 30 giây</span>
                    <span className="font-mono text-amber-400 text-[11px]">30s</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMute(60)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-amber-500/10 text-zinc-200 hover:text-amber-300 transition-colors"
                  >
                    <span>Ngắt còi 60 giây (Chuẩn)</span>
                    <span className="font-mono text-amber-400 text-[11px]">60s</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMute(120)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-amber-500/10 text-zinc-200 hover:text-amber-300 transition-colors"
                  >
                    <span>Ngắt còi 120 giây (2 phút)</span>
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
