import threading
import httpx
from app.core.config import settings

def _send_telegram_async(message: str) -> None:
    """Hàm gửi bất đồng bộ trong background thread để không chặn luồng chính"""
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        print(f"[NOTIFICATION MOCK]: {message}")
        return

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(url, json=payload)
    except Exception as e:
        print(f"[TELEGRAM NOTIFICATION ERROR]: Không thể gửi tin nhắn: {e}")

def send_alert_notification(message: str) -> None:
    """
    Gửi thông báo cảnh báo qua các kênh đã cấu hình (hiện tại: Telegram Bot).
    Dễ dàng mở rộng thêm kênh Zalo, SMS, Webhook trong hàm này.
    """
    threading.Thread(target=_send_telegram_async, args=(message,), daemon=True).start()
