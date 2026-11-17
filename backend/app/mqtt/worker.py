import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
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
        client_id = f"FastAPI_Backend_Worker_{uuid.uuid4().hex[:12]}"
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message
        self._connected_event = threading.Event()
        self._message_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="mqtt-message")

    def start(self) -> None:
        if settings.MQTT_BROKER_USER and settings.MQTT_BROKER_PASSWORD:
            self.client.username_pw_set(settings.MQTT_BROKER_USER, settings.MQTT_BROKER_PASSWORD)
        print(f"[MQTT] Đang kết nối tới Broker {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}...")
        self.client.connect_async(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
        self.client.loop_start()

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()
        self._connected_event.clear()
        self._message_executor.shutdown(wait=True, cancel_futures=True)
        print("[MQTT] Đã ngắt kết nối an toàn khỏi Broker.")

    def on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self._connected_event.set()
            print("[MQTT] Đã kết nối Broker thành công! Đang đăng ký các Topic...")
            client.subscribe("fire_alert/devices/+/telemetry", qos=1)
            client.subscribe("fire_alert/devices/+/status", qos=1)
            client.subscribe("fire_alert/devices/+/ack", qos=1)
        else:
            print(f"[MQTT ERROR] Kết nối thất bại với mã lỗi: {reason_code}")

    def on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self._connected_event.clear()
        print(f"[MQTT] Mất kết nối broker (mã lỗi: {reason_code}); đang tự động kết nối lại...")

    def publish_command(self, device_id: str, payload: dict) -> None:
        """Gửi lệnh điều khiển xuống vi điều khiển ESP32"""
        if not self.client.is_connected() and not self._connected_event.wait(timeout=5):
            raise RuntimeError("MQTT worker chưa kết nối broker sau 5 giây chờ reconnect")

        topic = f"fire_alert/devices/{device_id}/commands"
        encoded_payload = json.dumps(payload)
        for attempt in range(2):
            result = self.client.publish(topic, encoded_payload, qos=1)
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                print(f"[MQTT] Đã phát lệnh xuống topic {topic}: {payload}")
                return

            if result.rc != mqtt.MQTT_ERR_NO_CONN or attempt == 1:
                raise RuntimeError(f"Không thể phát lệnh MQTT (mã lỗi {result.rc})")

            self._connected_event.clear()
            if not self._connected_event.wait(timeout=5):
                raise RuntimeError("MQTT worker mất kết nối khi phát lệnh và không reconnect kịp thời")
            time.sleep(0.1)

    def on_message(self, client, userdata, msg):
        topic = msg.topic
        try:
            raw_data = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            print(f"[MQTT DROP] Bản tin không phải định dạng JSON hợp lệ: {topic}")
            return

        self._message_executor.submit(self._dispatch_message, topic, raw_data)

    def _dispatch_message(self, topic: str, raw_data: dict) -> None:
        try:
            if topic.endswith("/telemetry"):
                self._handle_telemetry(raw_data)
            elif topic.endswith("/status"):
                self._handle_status(raw_data)
            elif topic.endswith("/ack"):
                self._handle_ack(raw_data)
        except Exception as exc:
            print(f"[MQTT ERROR] Lỗi xử lý bản tin {topic}: {exc}")

    def _handle_telemetry(self, raw_data: dict) -> None:
        try:
            data = TelemetryPayload(**raw_data)
        except ValidationError as e:
            print(f"[VALIDATION ERROR] Từ chối telemetry sai schema: {e}")
            return

        # 1. Kiểm tra thiết bị trong CSDL (Xác thực và Quản lý vòng đời)
        device = None
        try:
            dev_res = supabase.table("devices").select("*").eq("device_id", data.device_id).execute()
            if dev_res.data:
                device = dev_res.data[0]
        except Exception as db_exc:
            print(f"[MQTT DB] Không thể truy vấn Supabase devices: {db_exc}")

        if not device:
            print(f"[SECURITY] Từ chối telemetry từ thiết bị chưa đăng ký: {data.device_id}")
            return

        if device.get("status") == "DECOMMISSIONED":
            print(f"[SECURITY BLOCK] Thiết bị {data.device_id} đã bị thu hồi vĩnh viễn! Từ chối nhận dữ liệu.")
            return

        # 2. Cập nhật thời điểm hoạt động gần nhất (last_seen) & kích hoạt ACTIVE
        now_iso = datetime.now(timezone.utc).isoformat()
        update_fields = {"last_seen": now_iso}
        if device.get("status") != "ACTIVE":
            update_fields["status"] = "ACTIVE"
        try:
            supabase.table("devices").update(update_fields).eq("device_id", data.device_id).execute()
        except Exception:
            pass

        # 3. Lưu trữ bản ghi telemetry vào bảng time-series
        telemetry_dict = {
            "device_id": data.device_id,
            "gas_ppm": data.gas_ppm,
            "temperature": data.temperature,
            "humidity": data.humidity,
            "flame_detected": data.flame_detected,
            "local_alarm": data.local_alarm,
            "timestamp": data.timestamp,
        }
        try:
            supabase.table("telemetry").insert(telemetry_dict).execute()
        except Exception:
            pass

        # 4. Kích hoạt Rule Engine thẩm định cảnh báo
        rule_engine.evaluate(data, device)

    def _handle_status(self, raw_data: dict) -> None:
        try:
            data = StatusPayload(**raw_data)
        except ValidationError:
            return

        device = None
        try:
            dev_res = supabase.table("devices").select("status, location").eq("device_id", data.device_id).execute()
            if dev_res.data:
                device = dev_res.data[0]
        except Exception:
            pass

        if not device or device.get("status") == "DECOMMISSIONED":
            return

        if data.lifecycle_state == "DECOMMISSIONED":
            new_status = "DECOMMISSIONED"
        elif data.lifecycle_state == "MAINTENANCE":
            new_status = "MAINTENANCE"
        elif data.lifecycle_state == "ACTIVE" or data.status == "ONLINE":
            new_status = "ACTIVE"
        else:
            new_status = "OFFLINE"
        now_iso = datetime.now(timezone.utc).isoformat()
        
        update_payload = {"status": new_status, "last_seen": now_iso}
        if data.firmware_version:
            update_payload["firmware_version"] = data.firmware_version

        try:
            supabase.table("devices").update(update_payload).eq("device_id", data.device_id).execute()
        except Exception:
            pass

        print(f"[DEVICE STATUS] Thiết bị {data.device_id} chuyển trạng thái: {new_status}")

        # Khi nhận tín hiệu LWT (thiết bị offline đột ngột)
        if new_status == "OFFLINE":
            try:
                supabase.table("alerts").insert({
                    "device_id": data.device_id,
                    "alert_type": "DEVICE_OFFLINE",
                    "status": "TRIGGERED"
                }).execute()
            except Exception:
                pass
            send_alert_notification(
                f"<b>[CẢNH BÁO LWT] MẤT KẾT NỐI THIẾT BỊ</b>\n"
                f"Thiết bị <b>{data.device_id}</b> tại <b>{device.get('location', 'Hiện trường')}</b> vừa mất kết nối đột ngột!"
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
                "ack_message": data.message,
                "ack_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", int(cmd_id_str)).execute()
            print(f"[COMMAND ACK] Thiết bị {data.device_id} xác nhận lệnh #{cmd_id_str}: {new_status}")

mqtt_worker = MQTTWorker()
