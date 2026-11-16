import threading
from typing import Optional
import httpx
from app.core.config import settings

def capture_camera_snapshot(camera_url: Optional[str] = None, timeout: float = 3.5) -> Optional[bytes]:
    """
    Lấy một frame JPEG từ endpoint ảnh hoặc MJPEG stream của camera.
    """
    target_url = camera_url or getattr(settings, "CAMERA_SNAPSHOT_URL", "")
    if not target_url:
        return None

    auth = None
    if settings.CAMERA_HTTP_USERNAME or settings.CAMERA_HTTP_PASSWORD:
        auth = (settings.CAMERA_HTTP_USERNAME, settings.CAMERA_HTTP_PASSWORD)

    client_timeout = httpx.Timeout(connect=5.0, read=timeout, write=5.0, pool=5.0)
    try:
        with httpx.Client(timeout=client_timeout, follow_redirects=True, auth=auth) as client:
            with client.stream("GET", target_url) as resp:
                if resp.status_code != 200:
                    print(f"[CAMERA WARN] Phản hồi HTTP {resp.status_code} từ {target_url}")
                    return None

                content_type = resp.headers.get("content-type", "").lower()
                if content_type.startswith("image/"):
                    image = resp.read()
                    if image:
                        print(f"[CAMERA] Đã chụp ảnh thành công từ {target_url} ({len(image)} bytes)")
                        return image
                    return None

                if "multipart/" not in content_type and not target_url.rstrip("/").endswith(("/video", "/mjpeg")):
                    print(f"[CAMERA WARN] Endpoint không trả về ảnh hoặc MJPEG: {content_type or 'unknown'}")
                    return None

                buffer = bytearray()
                for chunk in resp.iter_bytes():
                    buffer.extend(chunk)
                    start = buffer.find(b"\xff\xd8")
                    if start >= 0:
                        end = buffer.find(b"\xff\xd9", start + 2)
                        if end >= 0:
                            image = bytes(buffer[start:end + 2])
                            print(f"[CAMERA] Đã trích frame JPEG từ MJPEG {target_url} ({len(image)} bytes)")
                            return image
                    if len(buffer) > 2 * 1024 * 1024:
                        del buffer[:-64 * 1024]
    except httpx.HTTPError as exc:
        print(f"[CAMERA ERROR] Không thể kết nối tới Camera ({target_url}): {exc}")
    return None

def _send_telegram_worker(message: str, camera_url: Optional[str] = None, attach_photo: bool = True) -> None:
    """Hàm gửi bất đồng bộ trong background thread để không chặn luồng chính"""
    photo_bytes: Optional[bytes] = None
    if attach_photo:
        photo_bytes = capture_camera_snapshot(camera_url)

    # Nếu chưa cấu hình Telegram Bot Token hoặc Chat ID, ghi log chế độ giả lập (Mock mode)
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        if photo_bytes:
            print(f"[NOTIFICATION MOCK] [TELEGRAM PHOTO ({len(photo_bytes)} bytes) + CAPTION]:\n{message}")
        else:
            print(f"[NOTIFICATION MOCK] [TELEGRAM TEXT ONLY]:\n{message}")
        return

    # Nếu có ảnh chụp từ Camera, gửi dạng ảnh kèm caption qua sendPhoto
    if photo_bytes:
        photo_url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendPhoto"
        files = {
            "photo": ("fire_alert_snapshot.jpg", photo_bytes, "image/jpeg")
        }
        data = {
            "chat_id": settings.TELEGRAM_CHAT_ID,
            "caption": message[:1024],  # Giới hạn ký tự caption của Telegram sendPhoto
            "parse_mode": "HTML"
        }
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(photo_url, data=data, files=files)
                if resp.status_code == 200:
                    print("[TELEGRAM] Đã gửi ảnh hiện trường chụp từ Camera thành công!")
                    return
                else:
                    print(f"[TELEGRAM WARN] Gửi ảnh thất bại ({resp.status_code}): {resp.text}. Sẽ fallback sang tin nhắn text.")
        except Exception as e:
            print(f"[TELEGRAM PHOTO ERROR]: {e}. Chuyển sang fallback gửi tin nhắn văn bản...")

    # Fallback gửi tin nhắn văn bản thông thường nếu không lấy được ảnh hoặc sendPhoto bị lỗi
    text_url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(text_url, json=payload)
            print("[TELEGRAM] Đã gửi tin nhắn cảnh báo văn bản thành công!")
    except Exception as e:
        print(f"[TELEGRAM NOTIFICATION ERROR]: Không thể gửi tin nhắn: {e}")

def send_alert_notification(
    message: str,
    camera_url: Optional[str] = None,
    attach_photo: bool = True
) -> None:
    """
    Gửi thông báo cảnh báo qua các kênh đã cấu hình (hiện tại: Telegram Bot kèm ảnh Camera).
    Chạy trong background thread để không chặn luồng MQTT Worker / WebSocket.
    """
    target_cam = camera_url or getattr(settings, "CAMERA_SNAPSHOT_URL", "")
    threading.Thread(
        target=_send_telegram_worker,
        args=(message, target_cam, attach_photo),
        daemon=True
    ).start()
