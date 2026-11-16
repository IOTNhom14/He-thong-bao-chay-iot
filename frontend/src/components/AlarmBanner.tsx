import React, { useEffect, useState } from 'react';
import { Flame, BellRing, VolumeX, Volume2, AlertTriangle, Camera, CameraOff, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { audioAlert } from '../utils/audioAlert';
import { useDeviceStore } from '../store/deviceStore';

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
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Tìm thông tin thiết bị đang báo động để lấy đúng Camera riêng của Node đó
  const alarmedDevice = useDeviceStore((state) => (alarmEvent ? state.devices[alarmEvent.device_id] : null));
  const activeStream =
    alarmedDevice?.camera_stream_url ||
    (alarmedDevice?.camera_url?.includes('/shot.jpg')
      ? alarmedDevice.camera_url.replace('/shot.jpg', '/video')
      : alarmedDevice?.camera_url);

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
    <aside aria-label="Cảnh báo khẩn cấp" className="w-full bg-[#b91c1c] text-white px-4 py-2.5 border-b-2 border-red-950 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Nhận diện sự cố */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-black/40 flex items-center justify-center text-white border border-white/20 flex-shrink-0">
            {alarmEvent.flame_detected ? <Flame className="w-5 h-5 text-amber-300" /> : <BellRing className="w-5 h-5 text-amber-300" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs uppercase bg-black/60 text-amber-300 px-2 py-0.5 rounded border border-amber-400/40 tracking-wider">
                {alarmEvent.flame_detected ? 'CẢNH BÁO: PHÁT HIỆN NGỌN LỬA' : 'CẢNH BÁO: CÒI BÁO ĐỘNG KÍCH HOẠT'}
              </span>
              <span className="font-mono text-xs font-bold text-white bg-black/40 px-2 py-0.5 rounded border border-white/20">
                NODE: {alarmEvent.device_id}
              </span>
            </div>
            <div className="text-xs text-red-100 flex items-center gap-4 mt-1 font-mono tabular-nums">
              <span>Nhiệt độ: <strong className="text-white text-sm">{alarmEvent.temperature}°C</strong></span>
              <span>Khí Gas: <strong className="text-white text-sm">{alarmEvent.gas_ppm} ppm</strong></span>
              <span>Lửa: <strong className={alarmEvent.flame_detected ? 'text-amber-300 font-bold' : 'text-white'}>{alarmEvent.flame_detected ? 'PHÁT HIỆN' : 'An toàn'}</strong></span>
            </div>
          </div>
        </div>

        {/* Cụm phím điều khiển tác chiến */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Nút mở Camera hiện trường */}
          <button
            type="button"
            onClick={() => setShowCameraModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-black/60 hover:bg-black/80 text-amber-300 border border-amber-400/50 transition-colors font-mono"
            title="Xem camera điện thoại hiện trường thời gian thực"
          >
            <Camera className="w-4 h-4 text-amber-300" />
            <span>XEM CAMERA HIỆN TRƯỜNG</span>
          </button>

          {/* Nút bật/tắt loa web */}
          <button
            type="button"
            onClick={toggleLocalAudio}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
              isAudioMuted
                ? 'bg-black/60 text-amber-300 border-amber-400/50 hover:bg-black/80'
                : 'bg-white text-red-900 border-white hover:bg-red-50'
            }`}
            title="Bật/Tắt âm thanh từ loa trình duyệt"
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{isAudioMuted ? 'Mở loa máy' : 'Tắt loa máy'}</span>
          </button>

          {/* Điều khiển còi phần cứng ESP32 */}
          {isViewer ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/40 text-amber-200 text-xs border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Chế độ xem: Không có quyền ngắt còi trạm</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded border border-white/20">
              <span className="text-[11px] font-semibold text-zinc-300 px-1.5 flex items-center gap-1">
                <VolumeX className="w-3.5 h-3.5 text-amber-300" /> Ngắt còi:
              </span>
              <button
                type="button"
                onClick={() => onMute(alarmEvent.device_id, 30)}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-mono text-xs border border-zinc-700 transition-colors"
              >
                30s
              </button>
              <button
                type="button"
                onClick={() => onMute(alarmEvent.device_id, 60)}
                className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold font-mono text-xs transition-colors"
              >
                60s
              </button>
              <button
                type="button"
                onClick={() => onMute(alarmEvent.device_id, 120)}
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-mono text-xs border border-zinc-700 transition-colors"
              >
                120s
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal hiển thị luồng Camera trực tiếp */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-3xl bg-[#111318] border border-zinc-800 rounded-md shadow-2xl flex flex-col overflow-hidden text-zinc-200">
            {/* Header Modal */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-[#0e1015]">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-red-400" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-100">
                  CAMERA HIỆN TRƯỜNG • VÙNG BÁO CHÁY [{alarmEvent.device_id}] {alarmedDevice?.location ? `(${alarmedDevice.location})` : ''}
                </h3>
                {activeStream ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                    ● LIVE STREAM
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                    CHƯA CÓ CAMERA
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowCameraModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Video Feed hoặc Thông báo chưa gán cam */}
            {activeStream ? (
              <>
                <div className="p-2 bg-black flex items-center justify-center min-h-[320px] max-h-[65vh] overflow-hidden">
                  <img
                    src={activeStream}
                    alt={`Live Camera Feed ${alarmEvent.device_id}`}
                    className="max-h-[60vh] w-full object-contain rounded border border-zinc-900"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = activeStream.replace('/video', '/shot.jpg');
                    }}
                  />
                </div>

                {/* Footer Modal */}
                <div className="p-2.5 bg-[#0e1015] border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-zinc-400 text-[11px]">
                    Nguồn phát riêng của node: <code>{activeStream}</code>
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={activeStream.replace('/video', '')}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 transition-colors"
                    >
                      Mở trang điều khiển gốc
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowCameraModal(false)}
                      className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-10 text-center space-y-3 bg-[#0e1015]">
                <CameraOff size={36} className="text-zinc-600 mx-auto" />
                <h4 className="text-sm font-bold text-zinc-200 font-mono">KHU VỰC NÀY CHƯA ĐƯỢC GẮN CAMERA RIÊNG</h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Node cảm biến <strong>{alarmEvent.device_id}</strong> ({alarmedDevice?.location || 'Chưa rõ vị trí'}) hiện chưa có camera giám sát hình ảnh riêng. Hệ thống đã tự động gửi cảnh báo khẩn cấp dạng văn bản an toàn qua Telegram.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(false)}
                    className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
                  >
                    Đã hiểu & Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
