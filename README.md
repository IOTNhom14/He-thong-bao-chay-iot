# He-thong-bao-chay

- **README.md**: giới thiệu, kiến trúc, hướng dẫn cài đặt và chạy.
- **firmware/**: mã nguồn cho ESP32 hoặc bo mạch nhúng.
- **backend/**: API, xử lý telemetry, quản lý thiết bị.
- **frontend/**: giao diện web hoặc mobile.
- **database/**: schema, migration hoặc dữ liệu mẫu.
- **deployment/**: Docker Compose, cấu hình broker hoặc hướng dẫn triển khai.
- **hardware/**: sơ đồ nối dây, danh sách linh kiện và hình ảnh prototype.
- **tests/**: mã kiểm thử và kịch bản kiểm thử.
- **docs/**: báo cáo, slide và các tài liệu thiết kế.

---

## 1. Tóm tắt các chức năng chính của hệ thống

Hệ thống là một giải pháp IoT toàn diện từ thiết bị biên (Edge) lên đám mây (Cloud), bao gồm các cụm chức năng cốt lõi sau:

### Chức năng Thu thập & Xử lý tại biên (Edge Logic)
- **Đọc dữ liệu liên tục:** Thu thập thông số từ cảm biến khói/khí gas (MQ-2) và cảm biến nhiệt độ, độ ẩm (DHT22).
- **Báo động cục bộ (Zero-latency):** Tự động phân tích giá trị cảm biến và kích hoạt còi hú / chớp đèn LED ngay lập tức tại hiện trường nếu vượt ngưỡng an toàn, hoàn toàn không phụ thuộc vào kết nối Internet.

### Chức năng Truyền thông IoT & Trạng thái mạng
- **Đẩy dữ liệu môi trường (Telemetry):** Gửi dữ liệu định kỳ lên Server thông qua giao thức MQTT.
- **Theo dõi trạng thái thiết bị thời gian thực (Online/Offline):** Sử dụng cơ chế *Last Will and Testament (LWT)* và *Heartbeat*.
- **Tự động kết nối lại (Auto-reconnect):** Tự động khôi phục kết nối khi router Wi-Fi hoặc mạng gặp sự cố rồi hoạt động trở lại.

### Chức năng Giám sát & Báo động đa kênh (Backend/Dashboard)
- **Web Dashboard:** Hiển thị biểu đồ dữ liệu nhiệt độ, độ ẩm, nồng độ khói cập nhật liên tục theo thời gian thực.
- **Giám sát hình ảnh Camera hiện trường:** Hỗ trợ gán Camera IP / điện thoại (IP Webcam / ESP32-CAM) cho từng node, xem Snapshot & Live Stream (MJPEG) trực tiếp trên Web Dashboard.
- **Rule Engine:** Đánh giá dữ liệu bất thường và tự động gửi thông báo cảnh báo cháy khẩn cấp (kèm ảnh chụp Camera hiện trường nếu có) về điện thoại người dùng qua Telegram Bot.

### Chức năng Quản lý vòng đời thiết bị (Device Lifecycle)
- **Quản lý trọn vẹn trạng thái thiết bị:** Đăng ký tạo mới (*Onboarding* / *Provisioning*) $\rightarrow$ Đang hoạt động (*Active*) $\rightarrow$ Mất kết nối (*Offline*) $\rightarrow$ Bảo trì (*Maintenance*) $\rightarrow$ Khóa / Thu hồi (*Decommissioned*).

### Chức năng Điều khiển từ xa & Đồng bộ cấu hình (Remote Control)
- **Điều khiển qua Web:** Cho phép gửi lệnh từ Web Dashboard xuống thiết bị để tắt còi báo động tạm thời (*Mute Buzzer*), kích hoạt còi thử nghiệm (*Test Alarm*), hoặc cập nhật ngưỡng cảnh báo (*Update Threshold* — đồng bộ cả Database lẫn bộ nhớ Flash trên ESP32).
- **Cơ chế xác nhận (ACK):** Nhận gói tin phản hồi xác nhận từ thiết bị để báo cáo lệnh đã thực thi thành công (`SENT` $\rightarrow$ `ACKNOWLEDGED`).

---

## 2. Cơ chế phân quyền người dùng (Role-Based Access Control - RBAC)

Hệ thống áp dụng cơ chế xác thực bảo mật bằng JWT Token (hỗ trợ cả Local PyJWT và Supabase Auth) và phân quyền chi tiết cho 3 vai trò (*Roles*) kết hợp kiểm tra quyền sở hữu thiết bị (`assigned_user_id`):

### Vai trò 1: Quản trị viên (Admin)
*Là người nắm quyền cao nhất, quản lý toàn bộ hệ thống.*
- **Quản lý người dùng:** Tạo tài khoản mới, đổi vai trò, khóa/mở khóa, xóa tài khoản và **gán / hủy gán thiết bị phụ trách (`assigned_user_id`)** cho từng Operator.
- **Quản lý thiết bị:** Khởi tạo thiết bị mới, cấp phát lại ID (`PROVISION_DEVICE`), chuyển trạng thái vòng đời (`ACTIVE`, `MAINTENANCE`, `DECOMMISSIONED`) và xóa liên kết thiết bị đã thu hồi.
- **Toàn quyền giám sát & điều khiển:** Xem, điều khiển, đổi ngưỡng, gán/gỡ camera và xác nhận cảnh báo cho **mọi thiết bị** trong hệ thống.
- **Bảo mật & Giám sát:** Xem **Nhật ký Audit Logs** để theo dõi các thao tác quản trị nhạy cảm (onboard/thu hồi thiết bị, gửi lệnh điều khiển, xác nhận sự cố, quản lý user...).

---

### Vai trò 2: Người vận hành (Operator / Chủ sở hữu)
*Là người trực tiếp phụ trách một hoặc nhiều thiết bị được Admin phân công.*
- **Giám sát chung:** Được xem toàn bộ danh sách thiết bị, biểu đồ Telemetry, Camera hiện trường và lịch sử cảnh báo trên Dashboard (tương tự `Viewer`).
- **Điều khiển & Cấu hình (chỉ trên thiết bị được gán `assigned_user_id`):** Được quyền nhấn nút "Tắt còi", "Test còi", thay đổi ngưỡng cảnh báo (`smoke_threshold`, `temp_threshold`), gán/gỡ Camera và bấm "Xác nhận đã xử lý" (*Acknowledge Alert*).
- **Hạn chế:** Với các thiết bị **không được gán cho mình**, giao diện sẽ tự động khóa chỉ đọc (giống `Viewer`) và Backend sẽ chặn bằng mã lỗi `403 Forbidden`. Không được truy cập trang quản trị `/admin`, không được thêm/xóa thiết bị, không được xem Audit Logs và không được quản lý tài khoản người dùng.

---

### Vai trò 3: Người xem (Viewer)
*Là người dùng có quyền hạn cơ bản nhất (chỉ đọc - Read-only).*
- **Giám sát:** Được phép xem Dashboard (biểu đồ nhiệt độ, nồng độ khói, tình trạng hoạt động thiết bị, Camera) và xem lịch sử cảnh báo / lịch sử lệnh.
- **Hạn chế:** Giao diện khóa toàn bộ nút thao tác và API Backend từ chối bằng mã lỗi `403 Forbidden` nếu cố tình gửi lệnh tắt/test còi, đổi ngưỡng, gán camera hay xác nhận sự cố.

### Tài khoản mẫu mặc định (Seed Data)
Có thể khởi tạo bằng `python3 backend/scripts/seed_users.py` và đăng nhập bằng **Username** hoặc **Email**:

| Vai trò | Username | Email | Mật khẩu mặc định |
| :--- | :--- | :--- | :--- |
| `ADMIN` | `admin` | `admin@firealert.iot` | `Admin@123456` |
| `OPERATOR` | `operator` | `operator@firealert.iot` | `Operator@123456` |
| `VIEWER` | `viewer` | `viewer@firealert.iot` | `Viewer@123456` |

---

## 3. Định dạng Payload (MQTT Message Format)

### (1) Bản tin Telemetry
- **Topic:** `fire_alert/devices/{device_id}/telemetry`
- **Chiều:** ESP32 $\rightarrow$ MQTT Broker $\rightarrow$ Backend
- **Tần suất:** Gửi định kỳ 3 giây / lần từ ESP32

```json
{
  "device_id": "ESP32_FIRE_001",
  "timestamp": 1729812000,
  "gas_ppm": 420.5,
  "temperature": 32.4,
  "humidity": 65.0,
  "units": {
    "gas": "ppm",
    "temperature": "C",
    "humidity": "%"
  },
  "flame_detected": true,
  "local_alarm": true,
  "is_muted": false
}
```

---

### (2) Bản tin Trạng thái & LWT (Last Will and Testament)
- **Topic:** `fire_alert/devices/{device_id}/status`
- **Chiều:** ESP32 / Broker $\rightarrow$ Backend
- **Thời điểm:** Gửi khi vừa kết nối mạng thành công (Online) hoặc do Broker tự động bắn khi thiết bị mất kết nối đột ngột (Offline)

**Trường hợp Online** *(kèm phiên bản firmware)*:
```json
{
  "device_id": "ESP32_FIRE_001",
  "status": "ONLINE",
  "firmware_version": "v1.0.0"
}
```

**Trường hợp Offline (LWT)**:
```json
{
  "device_id": "ESP32_FIRE_001",
  "status": "OFFLINE",
  "reason": "CONNECTION_LOST"
}
```

---

### (3) Bản tin Lệnh điều khiển (Control Commands)
- **Topic:** `fire_alert/devices/{device_id}/commands`
- **Chiều:** Backend (FastAPI) $\rightarrow$ MQTT Broker $\rightarrow$ ESP32

**Lệnh tắt còi tạm thời (Mute Buzzer)**:
```json
{
  "command_id": "cmd_15",
  "action": "MUTE_BUZZER",
  "params": {
    "duration_sec": 60
  }
}
```

**Lệnh cập nhật ngưỡng cảnh báo từ xa (Update Thresholds)**:
```json
{
  "command_id": "cmd_16",
  "action": "UPDATE_THRESHOLD",
  "params": {
    "smoke_threshold": 350.0,
    "temp_threshold": 50.0
  }
}
```

---

### (4) Bản tin Xác nhận lệnh (Command ACK)
- **Topic:** `fire_alert/devices/{device_id}/ack`
- **Chiều:** ESP32 $\rightarrow$ MQTT Broker $\rightarrow$ Backend (FastAPI)
- **Mục đích:** Báo cáo kết quả thực thi lệnh điều khiển từ thiết bị về cho máy chủ

```json
{
  "command_id": "cmd_15",
  "device_id": "ESP32_FIRE_001",
  "status": "SUCCESS",
  "message": "Executed MUTE_BUZZER"
}
```

---

## 4. Hướng dẫn cài đặt và khởi chạy hệ thống (Quickstart)

### 4.1. Yêu cầu môi trường
- Đã cài đặt **Docker** và **Docker Compose**.
- Đã cài đặt **Python 3.10+** (nếu muốn chạy các script kiểm thử độc lập).

---

### 4.2. Thiết lập cấu hình môi trường
Sao chép tệp cấu hình mẫu và điền các thông số Supabase, Telegram Bot của bạn:

```bash
# 1. Sao chép tệp biến môi trường mẫu
cp .env.example .env

# 2. Mở file .env và cập nhật thông số của bạn:
# - SUPABASE_URL: URL dự án Supabase (không kèm /rest/v1/)
# - SUPABASE_SERVICE_ROLE_KEY: Khóa Service Role bí mật
# - TELEGRAM_BOT_TOKEN: Token từ @BotFather
# - TELEGRAM_CHAT_ID: Chat ID nhận cảnh báo từ @userinfobot
# - CAMERA_SNAPSHOT_URL / CAMERA_HTTP_USERNAME / CAMERA_HTTP_PASSWORD: (Tùy chọn) Camera IP gửi ảnh Telegram
```

---

### 4.3. Khởi chạy hệ thống bằng Docker Compose

Toàn bộ dịch vụ (**MQTT Broker Mosquitto**, **FastAPI Backend Worker**, và **React Web Frontend**) được đóng gói và khởi chạy tự động:

```bash
# Di chuyển vào thư mục deployment
cd deployment

# Build và khởi chạy các container ở chế độ chạy nền
docker compose up -d --build
```

Kiểm tra trạng thái các dịch vụ đang chạy:
```bash
docker compose ps
```

Sau khi khởi chạy thành công:
- **Giao diện Web Dashboard (Frontend):** [http://localhost:3000](http://localhost:3000)
- **Tài liệu API Swagger UI:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Kiểm tra trạng thái hệ thống (Health Check):** [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- **Cổng kết nối MQTT Broker:** `localhost:1883`

---

### 4.4. Kiểm tra và Chạy thử nghiệm (Testing)

#### (1) Kiểm tra kết nối Telegram Bot:
Chạy script kiểm tra trực tiếp (không yêu cầu cài thêm thư viện ngoài):
```bash
python3 tests/test_telegram.py
```
*(Hoặc chạy bên trong Docker Container)*:
```bash
docker compose exec backend python tests/test_telegram.py
```

#### (2) Giả lập thiết bị ESP32 gửi dữ liệu báo cháy qua MQTT:
Gửi gói tin giả lập nồng độ khói 750 PPM, nhiệt độ 65°C và có lửa để kiểm thử Rule Engine và kích hoạt cảnh báo Telegram tự động:
```bash
docker compose exec backend python -c "
import json, time, paho.mqtt.client as mqtt

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='Simulated_ESP32')
client.connect('mosquitto', 1883, 60)
client.loop_start()
time.sleep(0.5)

topic = 'fire_alert/devices/ESP32_FIRE_001/telemetry'
payload = {
    'device_id': 'ESP32_FIRE_001',
    'timestamp': int(time.time()),
    'gas_ppm': 750.5,
    'temperature': 65.0,
    'humidity': 45.0,
    'flame_detected': True,
    'local_alarm': True,
    'is_muted': False
}

client.publish(topic, json.dumps(payload), qos=1)
print('[SUCCESS] Đã gửi gói tin telemetry báo cháy giả lập qua MQTT!')
time.sleep(1)
client.loop_stop()
"
```

Xem log hoạt động thời gian thực của Backend:
```bash
docker compose logs -f backend
```

---

### 4.5. Dừng hệ thống
Khi muốn tắt toàn bộ các container và dịch vụ nền:
```bash
cd deployment
docker compose down
```
