import json
import time
import sys
import paho.mqtt.client as mqtt

BROKER_HOST = "localhost"
BROKER_PORT = 1883
DEVICE_ID = "ESP32_FIRE_001"

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print(f"[SIMULATOR] Ket noi Broker MQTT thanh cong tai {BROKER_HOST}:{BROKER_PORT}")
    else:
        print(f"[SIMULATOR] Loi ket noi: {rc}")

def simulate_fire_alert():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="ESP32_Simulator")
    client.on_connect = on_connect

    try:
        client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
        client.loop_start()
        time.sleep(1)

        # 1. Bắn bản tin Online
        status_topic = f"fire_alert/devices/{DEVICE_ID}/status"
        status_payload = {
            "device_id": DEVICE_ID,
            "status": "ONLINE",
            "firmware_version": "v1.0.0"
        }
        client.publish(status_topic, json.dumps(status_payload), qos=1)
        print(f"[SIMULATOR] Da ban Status ONLINE vao {status_topic}")
        time.sleep(1)

        # 2. Bắn bản tin Telemetry VUOT NGUONG (BAO CHAY) de kich hoat Telegram Bot
        telemetry_topic = f"fire_alert/devices/{DEVICE_ID}/telemetry"
        fire_payload = {
            "device_id": DEVICE_ID,
            "timestamp": int(time.time()),
            "gas_ppm": 750.5,         # Ngưỡng mặc định là 400 PPM -> VƯỢT NGƯỠNG
            "temperature": 68.0,      # Ngưỡng mặc định là 55°C -> VƯỢT NGƯỠNG
            "humidity": 45.0,
            "flame_detected": True,   # Phát hiện lửa
            "local_alarm": True,
            "is_muted": False
        }
        client.publish(telemetry_topic, json.dumps(fire_payload), qos=1)
        print(f"[SIMULATOR] Da ban Telemetry BÁO CHÁY vao {telemetry_topic}:")
        print(json.dumps(fire_payload, indent=2))

        time.sleep(3)
        client.loop_stop()
        client.disconnect()
        print("\n[SIMULATOR] Hoan tat gia lap ban tin bao chay!")
    except Exception as e:
        print(f"[SIMULATOR ERROR]: {e}")

if __name__ == "__main__":
    simulate_fire_alert()
