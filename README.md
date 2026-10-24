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
- **Web Dashboard:** Hiển thị biểu đồ dữ liệu nhiệt độ, nồng độ khói cập nhật liên tục theo thời gian thực.
- **Rule Engine:** Đánh giá dữ liệu bất thường và tự động gửi thông báo cảnh báo cháy khẩn cấp về điện thoại người dùng qua Telegram Bot.

### Chức năng Quản lý vòng đời thiết bị (Device Lifecycle)
- **Quản lý trọn vẹn trạng thái thiết bị:** Đăng ký tạo mới (*Onboarding*) $\rightarrow$ Đang hoạt động (*Active*) $\rightarrow$ Mất kết nối (*Offline*) $\rightarrow$ Bảo trì (*Maintenance*) $\rightarrow$ Khóa / Thu hồi (*Decommissioned*).

### Chức năng Điều khiển từ xa (Remote Control)
- **Điều khiển qua Web:** Cho phép người dùng gửi lệnh từ Web Dashboard xuống thiết bị để tắt còi báo động tạm thời (*Mute*) hoặc kích hoạt còi thử nghiệm (*Test Alarm*).
- **Cơ chế xác nhận (ACK):** Nhận gói tin phản hồi xác nhận từ thiết bị để báo cáo lệnh đã thực thi thành công.

---

## 2. Cơ chế phân quyền người dùng (Role-Based Access Control - RBAC)

Hệ thống áp dụng cơ chế xác thực bảo mật đa lớp (sử dụng Token JWT) và được chia thành 3 vai trò (*Roles*) rõ ràng với các quyền hạn quản lý khác nhau:

### Vai trò 1: Quản trị viên (Admin)
*Là người nắm quyền cao nhất, quản lý toàn bộ hệ thống.*
- **Quản lý người dùng:** Được phép tạo tài khoản mới, phân quyền, khóa hoặc xóa tài khoản của người dùng khác.
- **Quản lý thiết bị:** Có quyền khởi tạo thiết bị mới (cấp mã `device_id` và token xác thực riêng) hoặc thu hồi quyền kết nối (*Decommission*) để cấm thiết bị đẩy dữ liệu vào mạng.
- **Cấu hình toàn cục:** Thay đổi ngưỡng cảnh báo cháy mặc định (nhiệt độ, nồng độ khói).
- **Bảo mật & Giám sát:** Xem được nhật ký hệ thống (*Audit Logs*) để theo dõi lịch sử đăng nhập, lịch sử ai vừa nhấn nút tắt còi và thời gian thực hiện.

---

### Vai trò 2: Người vận hành (Operator / Chủ sở hữu)
*Là người trực tiếp sử dụng thiết bị (ví dụ: chủ nhà, ban quản lý, bảo vệ tòa nhà).*
- **Giám sát:** Xem biểu đồ dữ liệu thời gian thực và trạng thái Online/Offline của các thiết bị mình được cấp quyền quản lý.
- **Điều khiển:** Được quyền nhấn nút "Tắt còi" khi có báo động giả hoặc nhấn nút "Test" còi từ xa.
- **Xử lý sự cố:** Được quyền thay đổi ngưỡng cảnh báo riêng cho thiết bị của mình và bấm "Xác nhận đã xử lý" (*Acknowledge*) khi sự cố cháy đã được khắc phục.
- **Hạn chế:** Không được xóa thiết bị, không được xem Audit Logs hệ thống và không có quyền quản lý tài khoản người dùng khác.

---

### Vai trò 3: Người xem (Viewer)
*Là người dùng có quyền hạn cơ bản nhất (ví dụ: cư dân sinh sống trong tòa nhà).*
- **Giám sát:** Chỉ được phép xem giao diện Dashboard (biểu đồ nhiệt độ, nồng độ khói, tình trạng hoạt động của thiết bị).
- **Xem lịch sử:** Xem danh sách lịch sử các vụ cảnh báo cháy đã từng xảy ra.
- **Hạn chế:** API Backend sẽ từ chối bằng mã lỗi `403 Forbidden` nếu người dùng này cố tình thao tác gửi lệnh tắt còi báo động, thay đổi ngưỡng cảnh báo hoặc can thiệp vào cấu hình hệ thống.

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
```

---

### 4.3. Khởi chạy hệ thống bằng Docker Compose

Toàn bộ dịch vụ (MQTT Broker Mosquitto và FastAPI Backend Worker) được đóng gói và khởi chạy tự động:

```bash
# Di chuyển vào thư mục deployment
cd deployment

# Khởi chạy các container ở chế độ chạy nền
docker compose up -d
```

Kiểm tra trạng thái các dịch vụ đang chạy:
```bash
docker compose ps
```

Sau khi khởi chạy thành công:
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
