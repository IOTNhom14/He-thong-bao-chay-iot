import React, { useEffect, useState } from 'react';
import { BellRing, VolumeX, Volume2, AlertTriangle, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { audioAlert } from '../utils/audioAlert';

interface AlarmBannerProps {
  alarmEvent: {
    device_id: string;
    flame_detected: boolean;
    local_alarm: boolean;
    temperature: number;
    gas_ppm: number;
    timestamp: number;
  } | null;
  onMute: (deviceId: string, durationSec?: 30 | 60 | 120) => void;
}

export const AlarmBanner: React.FC<AlarmBannerProps> = ({ alarmEvent, onMute }) => {
  const { isViewer } = useAuth();
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  const hasAlarm = Boolean(alarmEvent && (alarmEvent.flame_detected || alarmEvent.local_alarm));

  // Tự động phát âm thanh khi có sự cố cháy / còi hú
  useEffect(() => {
    if (hasAlarm && !isAudioMuted) {
      audioAlert.startAlarm();
    } else {
      audioAlert.stopAlarm();
    }

    return () => {
      audioAlert.stopAlarm();
    };
  }, [hasAlarm, isAudioMuted]);

  if (!alarmEvent || !hasAlarm) {
    return null;
  }

  const toggleLocalAudio = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    audioAlert.muteLocal(nextMuted);
  };

  return (
    <div className="w-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 animate-alarm-pulse text-white px-4 py-3 shadow-2xl transition-all border-b border-red-400/40">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Thông tin sự cố */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-black/40 text-yellow-300 animate-bounce flex items-center justify-center">
            {alarmEvent.flame_detected ? <Flame className="w-6 h-6 animate-pulse" /> : <BellRing className="w-6 h-6 animate-spin" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold tracking-wider text-sm uppercase bg-red-950/90 text-yellow-300 px-3 py-1 rounded-md border border-red-400 flex items-center gap-1.5 shadow-sm">
                🚨 {alarmEvent.flame_detected ? 'PHÁT HIỆN LỬA NGUY HIỂM!' : 'CÒI BÁO ĐỘNG ĐANG HÚ!'}
              </span>
              <span className="font-mono text-sm font-bold bg-black/40 px-2 py-0.5 rounded border border-white/20">
                Thiết bị: {alarmEvent.device_id}
              </span>
            </div>
            <div className="text-xs text-red-50 flex items-center gap-4 mt-1 font-medium">
              <span>Nhiệt độ: <b className="text-yellow-200 text-sm">{alarmEvent.temperature}°C</b></span>
              <span>Khí Gas: <b className="text-yellow-200 text-sm">{alarmEvent.gas_ppm} ppm</b></span>
              <span>Trạng thái lửa: <b className="text-yellow-300">{alarmEvent.flame_detected ? 'CÓ LỬA' : 'An toàn'}</b></span>
            </div>
          </div>
        </div>

        {/* Cụm nút điều khiển âm thanh và còi */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Nút bật/tắt âm thanh loa máy tính (Mọi role đều dùng được) */}
          <button
            type="button"
            onClick={toggleLocalAudio}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 ${
              isAudioMuted
                ? 'bg-black/60 text-yellow-300 hover:bg-black/80 border border-yellow-400/40'
                : 'bg-yellow-400 text-black hover:bg-yellow-300'
            }`}
            title="Bật/Tắt âm thanh còi hú phát từ loa trình duyệt"
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 animate-pulse" />}
            <span>{isAudioMuted ? 'Bật loa Web' : 'Tắt loa Web'}</span>
          </button>

          {/* Cụm nút tắt còi phần cứng ESP32 (Phân quyền: Chặn Viewer) */}
          {isViewer ? (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/50 text-amber-200 text-xs border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Viewer: Không có quyền Mute còi ESP32</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/20">
              <span className="text-xs font-bold text-yellow-300 px-2 flex items-center gap-1">
                <VolumeX className="w-3.5 h-3.5" /> Tắt còi ESP32:
              </span>
              <button
                type="button"
                onClick={() => onMute(alarmEvent.device_id, 30)}
                className="px-2.5 py-1.5 rounded-lg bg-white/90 hover:bg-white text-red-700 font-extrabold text-xs transition-transform active:scale-95 shadow-sm"
              >
                30s
              </button>
              <button
                type="button"
                onClick={() => onMute(alarmEvent.device_id, 60)}
                className="px-2.5 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-extrabold text-xs transition-transform active:scale-95 shadow-sm"
              >
                60s
              </button>
              <button
                type="button"
                onClick={() => onMute(alarmEvent.device_id, 120)}
                className="px-2.5 py-1.5 rounded-lg bg-white/90 hover:bg-white text-red-700 font-extrabold text-xs transition-transform active:scale-95 shadow-sm"
              >
                120s
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
