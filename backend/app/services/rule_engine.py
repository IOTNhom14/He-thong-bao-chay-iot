import time
from typing import Dict
from app.core.config import settings
from app.core.database import supabase
from app.schemas.mqtt import TelemetryPayload
from app.services.notification import send_alert_notification

# Lưu trữ mốc thời gian cảnh báo gần nhất cho từng thiết bị để chống spam tin nhắn (Cooldown)
_last_alert_timestamps: Dict[str, float] = {}

class FireRuleEngine:
    """
    Bộ quy tắc đánh giá rủi ro cháy nổ thời gian thực (Rule Engine).
    Kết hợp nhiều cảm biến (Sensor Fusion: Khói MQ-2, Nhiệt độ DHT22, Cảm biến Lửa).
    """

    @staticmethod
    def evaluate(data: TelemetryPayload, device: dict) -> None:
        smoke_threshold = float(device.get("smoke_threshold", 400.0))
        temp_threshold = float(device.get("temp_threshold", 55.0))
        location = device.get("location", "Chưa xác định")

        alert_type = None
        trigger_val = 0.0
        threshold_val = 0.0
        alert_msg = ""

        # MỨC 1: BÁO ĐỘNG ĐỎ KHẨN CẤP (Phát hiện lửa hoặc cả khói VÀ nhiệt độ đều vượt ngưỡng)
        if data.flame_detected or (data.gas_ppm > smoke_threshold and (data.temperature or 0) > temp_threshold):
            alert_type = "FIRE_EMERGENCY"
            trigger_val = data.gas_ppm
            threshold_val = smoke_threshold
            alert_msg = (
                f"<b>[BÁO ĐỘNG ĐỎ] PHÁT HIỆN CHÁY KHẨN CẤP!</b>\n"
                f"- Vị trí: <b>{location}</b> ({data.device_id})\n"
                f"- Phát hiện lửa: <b>{'CÓ' if data.flame_detected else 'KHÔNG'}</b>\n"
                f"- Nồng độ khói: <b>{data.gas_ppm} PPM</b> (Ngưỡng: {smoke_threshold} PPM)\n"
                f"- Nhiệt độ: <b>{data.temperature}°C</b> (Ngưỡng: {temp_threshold}°C)\n"
                f"- Còi tại chỗ: <b>{'ĐANG HÚ' if data.local_alarm else 'ĐÃ TẮT'}</b>"
            )
        # MỨC 2: CẢNH BÁO NỒNG ĐỘ KHÓI / KHÍ GAS CAO
        elif data.gas_ppm > smoke_threshold:
            alert_type = "SMOKE_WARNING"
            trigger_val = data.gas_ppm
            threshold_val = smoke_threshold
            alert_msg = (
                f"<b>[CẢNH BÁO] NỒNG ĐỘ KHÓI VƯỢT NGƯỠNG!</b>\n"
                f"- Vị trí: <b>{location}</b> ({data.device_id})\n"
                f"- Nồng độ khói: <b>{data.gas_ppm} PPM</b> (Ngưỡng: {smoke_threshold} PPM)\n"
                f"- Nhiệt độ hiện tại: {data.temperature}°C"
            )
        # MỨC 3: CẢNH BÁO NHIỆT ĐỘ TĂNG CAO BẤT THƯỜNG
        elif data.temperature and data.temperature > temp_threshold:
            alert_type = "HIGH_TEMP_WARNING"
            trigger_val = data.temperature
            threshold_val = temp_threshold
            alert_msg = (
                f"<b>[CẢNH BÁO] NHIỆT ĐỘ CAO BẤT THƯỜNG!</b>\n"
                f"- Vị trí: <b>{location}</b> ({data.device_id})\n"
                f"- Nhiệt độ: <b>{data.temperature}°C</b> (Ngưỡng: {temp_threshold}°C)"
            )

        if alert_type:
            now = time.time()
            last_sent = _last_alert_timestamps.get(data.device_id, 0.0)

            # Áp dụng cơ chế Cooldown chống nghẽn và spam tin nhắn
            if now - last_sent > settings.ALERT_COOLDOWN_SEC:
                _last_alert_timestamps[data.device_id] = now

                # 1. Ghi nhận sự kiện cảnh báo vào CSDL
                supabase.table("alerts").insert({
                    "device_id": data.device_id,
                    "alert_type": alert_type,
                    "trigger_value": trigger_val,
                    "threshold_value": threshold_val,
                    "status": "TRIGGERED"
                }).execute()

                # 2. Bắn thông báo khẩn cấp tới người dùng
                send_alert_notification(alert_msg)
                print(f"[RULE ENGINE] Đã kích hoạt cảnh báo {alert_type} cho thiết bị {data.device_id}")

rule_engine = FireRuleEngine()
