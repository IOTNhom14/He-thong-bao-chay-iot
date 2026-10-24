import json
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
from pydantic import ValidationError

from app.core.config import settings
from app.core.database import supabase
from app.schemas.mqtt import TelemetryPayload, StatusPayload, AckPayload
from app.services.rule_engine import rule_engine
from app.services.notification import send_alert_notification

class MQTTWorker:
    """
    Dịch vụ nền quản lý kết nối MQTT Broker và điều phối xử lý bản tin IoT
    """
    def __init__(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="FastAPI_Backend_Worker")
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def start(self) -> None:
        print(f"[MQTT] Đang kết nối tới Broker {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}...")
        self.client.connect_async(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
        self.client.loop_start()

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()
        print("[MQTT] Đã ngắt kết nối an toàn khỏi Broker.")

    def on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            print("[MQTT] Đã kết nối Broker thành công! Đang đăng ký các Topic...")
            client.subscribe("fire_alert/devices/+/telemetry", qos=1)
            client.subscribe("fire_alert/devices/+/status", qos=1)
            client.subscribe("fire_alert/devices/+/ack", qos=1)
        else:
            print(f"[MQTT ERROR] Kết nối thất bại với mã lỗi: {reason_code}")

    def publish_command(self, device_id: str, payload: dict) -> None:
        """Gửi lệnh điều khiển xuống vi điều khiển ESP32"""
        topic = f"fire_alert/devices/{device_id}/commands"
        self.client.publish(topic, json.dumps(payload), qos=1)
        print(f"[MQTT] Đã phát lệnh xuống topic {topic}: {payload}")

    def on_message(self, client, userdata, msg):
        topic = msg.topic
        try:
            raw_data = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            print(f"[MQTT DROP] Bản tin không phải định dạng JSON hợp lệ: {topic}")
            return

        if topic.endswith("/telemetry"):
            self._handle_telemetry(raw_data)
        elif topic.endswith("/status"):
            self._handle_status(raw_data)
        elif topic.endswith("/ack"):
            self._handle_ack(raw_data)

    def _handle_telemetry(self, raw_data: dict) -> None:
        try:
            data = TelemetryPayload(**raw_data)
        except ValidationError as e:
            print(f"[VALIDATION ERROR] Từ chối telemetry sai schema: {e}")
            return

        # 1. Kiểm tra thiết bị trong CSDL (Xác thực và Quản lý vòng đời)
        dev_res = supabase.table("devices").select("*").eq("device_id", data.device_id).execute()
        if not dev_res.data:
            print(f"[SECURITY] Từ chối telemetry từ thiết bị chưa đăng ký: {data.device_id}")
            return

        device = dev_res.data[0]
        if device.get("status") == "DECOMMISSIONED":
            print(f"[SECURITY BLOCK] Thiết bị {data.device_id} đã bị thu hồi vĩnh viễn! Từ chối nhận dữ liệu.")
            return

        # 2. Cập nhật thời điểm hoạt động gần nhất (last_seen) & kích hoạt ACTIVE
        now_iso = datetime.now(timezone.utc).isoformat()
        update_fields = {"last_seen": now_iso}
        if device.get("status") != "ACTIVE":
            update_fields["status"] = "ACTIVE"
        supabase.table("devices").update(update_fields).eq("device_id", data.device_id).execute()

        # 3. Lưu trữ bản ghi telemetry vào bảng time-series
        supabase.table("telemetry").insert({
            "device_id": data.device_id,
            "gas_ppm": data.gas_ppm,
            "temperature": data.temperature,
            "humidity": data.humidity,
            "flame_detected": data.flame_detected,
            "local_alarm": data.local_alarm
        }).execute()

        # 4. Kích hoạt Rule Engine thẩm định cảnh báo
        rule_engine.evaluate(data, device)

    def _handle_status(self, raw_data: dict) -> None:
        try:
            data = StatusPayload(**raw_data)
        except ValidationError:
            return

        dev_res = supabase.table("devices").select("status, location").eq("device_id", data.device_id).execute()
        if not dev_res.data or dev_res.data[0].get("status") == "DECOMMISSIONED":
            return

        new_status = "ACTIVE" if data.status == "ONLINE" else "OFFLINE"
        now_iso = datetime.now(timezone.utc).isoformat()
        
        update_payload = {"status": new_status, "last_seen": now_iso}
        if data.firmware_version:
            update_payload["firmware_version"] = data.firmware_version

        supabase.table("devices").update(update_payload).eq("device_id", data.device_id).execute()
        print(f"[DEVICE STATUS] Thiết bị {data.device_id} chuyển trạng thái: {new_status}")

        # Khi nhận tín hiệu LWT (thiết bị offline đột ngột)
        if new_status == "OFFLINE":
            supabase.table("alerts").insert({
                "device_id": data.device_id,
                "alert_type": "DEVICE_OFFLINE",
                "status": "TRIGGERED"
            }).execute()
            send_alert_notification(
                f"<b>[CẢNH BÁO LWT] MẤT KẾT NỐI THIẾT BỊ</b>\n"
                f"Thiết bị <b>{data.device_id}</b> tại <b>{dev_res.data[0].get('location')}</b> vừa mất kết nối đột ngột!"
            )

    def _handle_ack(self, raw_data: dict) -> None:
        try:
            data = AckPayload(**raw_data)
        except ValidationError:
            return

        cmd_id_str = data.command_id.replace("cmd_", "")
        if cmd_id_str.isdigit():
            new_status = "ACKNOWLEDGED" if data.status == "SUCCESS" else "FAILED"
            supabase.table("command_logs").update({
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", int(cmd_id_str)).execute()
            print(f"[COMMAND ACK] Thiết bị {data.device_id} xác nhận lệnh #{cmd_id_str}: {new_status}")

mqtt_worker = MQTTWorker()
