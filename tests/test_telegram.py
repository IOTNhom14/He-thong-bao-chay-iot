import os
import sys
import json
import urllib.request
import urllib.error

from datetime import datetime

def load_env(env_path=".env"):
    """Tự động đọc biến môi trường từ file .env mà không cần cài đặt python-dotenv"""
    env_vars = {}
    if not os.path.exists(env_path):
        # Thử tìm ở thư mục cha nếu đang chạy từ thư mục con
        parent_env = os.path.join("..", env_path)
        if os.path.exists(parent_env):
            env_path = parent_env

    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    # Loại bỏ comment ở cuối dòng nếu có
                    val = val.split("#")[0].strip().strip('"').strip("'")
                    env_vars[key.strip()] = val
    return env_vars

def test_telegram_connection():
    env = load_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or env.get("TELEGRAM_CHAT_ID", "")

    print("=" * 60)
    print("KIỂM TRA KẾT NỐI TELEGRAM BOT (ĐỘC LẬP / ZERO-DEPENDENCY)")
    print("=" * 60)
    print(f"Bot Token : {token[:12]}... (đã ẩn một phần token)")
    print(f"Chat ID   : {chat_id}")

    if not token or not chat_id:
        print("\n[LỖI] TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa được điền trong .env!")
        return

    # 1. Kiểm tra thông tin Bot
    try:
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/getMe")
        with urllib.request.urlopen(req, timeout=5) as response:
            bot_info = json.loads(response.read().decode("utf-8"))
            if bot_info.get("ok"):
                username = bot_info["result"]["username"]
                name = bot_info["result"]["first_name"]
                print(f"[OK] Bot hợp lệ: @{username} ({name})")
    except Exception as e:
        print(f"[LỖI] Không thể kết nối tới Telegram API: {e}")
        return

    # 2. Gửi tin nhắn cảnh báo thử nghiệm chuẩn format hệ thống
    now_str = datetime.now().strftime("%H:%M:%S %d/%m/%Y")
    msg = (
        "🔥 <b>[BÁO ĐỘNG ĐỎ] PHÁT HIỆN CẢNH BÁO CHÁY THỬ NGHIỆM!</b> 🔥\n\n"
        "📍 <b>Vị trí:</b> Phòng Khách - Tầng 1 (<code>ESP32_FIRE_001</code>)\n"
        "🔥 <b>Phát hiện ngọn lửa:</b> <b>CÓ (NGUY HIỂM)</b>\n"
        "💨 <b>Nồng độ khói/Gas:</b> <b>785.4 PPM</b> (Ngưỡng: 400.0 PPM)\n"
        "🌡 <b>Nhiệt độ môi trường:</b> <b>68.5°C</b> (Ngưỡng: 55.0°C)\n"
        "🚨 <b>Còi báo động tại chỗ:</b> <b>ĐANG HÚ CÒI</b>\n"
        f"⏱ <b>Thời gian:</b> <code>{now_str}</code>\n\n"
        "<i>(Tin nhắn kích hoạt kiểm tra tính năng gửi cảnh báo sang Telegram)</i>"
    )
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": msg,
        "parse_mode": "HTML"
    }).encode("utf-8")

    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            if res_data.get("ok"):
                print("[THÀNH CÔNG] Đã gửi tin nhắn cảnh báo tới Telegram!")
                print(f"Message ID: {res_data['result']['message_id']}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"\n[THẤT BẠI] Telegram báo lỗi: {err_body}")
    except Exception as e:
        print(f"[LỖI NGOẠI LỆ]: {e}")

if __name__ == "__main__":
    test_telegram_connection()
