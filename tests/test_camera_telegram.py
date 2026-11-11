"""
Kịch bản kiểm tra kết nối Camera Điện thoại (IP Webcam) và Gửi ảnh thử nghiệm tới Telegram
Chạy: python test_camera_telegram.py
"""
import os
import sys
import httpx
from dotenv import load_dotenv

# Nạp file .env từ thư mục hiện tại
load_dotenv(".env")

CAMERA_URL = os.getenv("CAMERA_SNAPSHOT_URL", "http://192.168.1.238:8080/shot.jpg")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

def main():
    print("=" * 60)
    print("  KIỂM TRA TÍCH HỢP CAMERA ĐIỆN THOẠI & TELEGRAM BOT")
    print("=" * 60)
    print(f"[1] Đang kết nối tới Camera điện thoại: {CAMERA_URL} ...")

    # 1. Chụp ảnh từ điện thoại
    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(CAMERA_URL)
            if resp.status_code == 200 and resp.content:
                photo_bytes = resp.content
                print(f" -> THÀNH CÔNG! Đã lấy ảnh: {len(photo_bytes):,} bytes.")
                # Lưu file ảnh cục bộ để người dùng có thể xem lại ngay
                output_file = "test_camera_snapshot.jpg"
                with open(output_file, "wb") as f:
                    f.write(photo_bytes)
                print(f" -> Đã lưu ảnh xem thử ra file: {output_file}")
            else:
                print(f" -> LỖI: Camera trả về mã HTTP {resp.status_code}")
                return
    except Exception as e:
        print(f" -> LỖI KẾT NỐI CAMERA: {e}")
        print("    Vui lòng kiểm tra:")
        print("    1. App IP Webcam trên điện thoại còn đang bật 'Start server' không?")
        print("    2. Điện thoại và máy tính có cùng kết nối chung một mạng WiFi không?")
        return

    # 2. Gửi ảnh tới Telegram
    print("\n[2] Kiểm tra gửi ảnh tới Telegram Bot...")
    if not BOT_TOKEN or not CHAT_ID:
        print(" -> [LƯU Ý]: TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID chưa được điền trong file .env.")
        print("    Để nhận ảnh chụp thực tế vào điện thoại:")
        print("    - Nhắn tin @BotFather trên Telegram để tạo Bot lấy TOKEN.")
        print("    - Nhắn tin @userinfobot để lấy CHAT_ID của bạn (hoặc ID nhóm chat).")
        print("    - Mở file .env điền:")
        print("        TELEGRAM_BOT_TOKEN=your_token_here")
        print("        TELEGRAM_CHAT_ID=your_chat_id_here")
        print("    Hệ thống backend hiện tại đang ở chế độ MOCK (Đã lưu ảnh snapshot cục bộ an toàn).")
        return

    print(f" -> Đang gửi ảnh tới Telegram Chat ID: {CHAT_ID}...")
    telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
    files = {"photo": ("fire_alert_snapshot.jpg", photo_bytes, "image/jpeg")}
    caption = (
        "<b>[HỆ THỐNG BÁO CHÁY IOT] KIỂM TRA CAMERA THÀNH CÔNG</b>\n"
        f"- Nguồn: <code>{CAMERA_URL}</code>\n"
        f"- Kích thước: {len(photo_bytes):,} bytes\n"
        "<i>Camera điện thoại đã được tích hợp hoàn tất vào hệ thống báo cháy!</i>"
    )
    data = {
        "chat_id": CHAT_ID,
        "caption": caption,
        "parse_mode": "HTML"
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            tg_resp = client.post(telegram_url, data=data, files=files)
            if tg_resp.status_code == 200:
                print(" -> TUYỆT VỜI! Đã gửi ảnh thành công tới Telegram Bot của bạn!")
            else:
                print(f" -> LỖI TELEGRAM API ({tg_resp.status_code}): {tg_resp.text}")
    except Exception as e:
        print(f" -> LỖI GỬI TELEGRAM: {e}")

if __name__ == "__main__":
    main()
