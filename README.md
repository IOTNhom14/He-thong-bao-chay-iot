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

### 🔹 Chức năng Thu thập & Xử lý tại biên (Edge Logic)
- **Đọc dữ liệu liên tục:** Thu thập thông số từ cảm biến khói/khí gas (MQ-2) và cảm biến nhiệt độ, độ ẩm (DHT22).
- **Báo động cục bộ (Zero-latency):** Tự động phân tích giá trị cảm biến và kích hoạt còi hú / chớp đèn LED ngay lập tức tại hiện trường nếu vượt ngưỡng an toàn, hoàn toàn không phụ thuộc vào kết nối Internet.

### 🔹 Chức năng Truyền thông IoT & Trạng thái mạng
- **Đẩy dữ liệu môi trường (Telemetry):** Gửi dữ liệu định kỳ lên Server thông qua giao thức MQTT.
- **Theo dõi trạng thái thiết bị thời gian thực (Online/Offline):** Sử dụng cơ chế *Last Will and Testament (LWT)* và *Heartbeat*.
- **Tự động kết nối lại (Auto-reconnect):** Tự động khôi phục kết nối khi router Wi-Fi hoặc mạng gặp sự cố rồi hoạt động trở lại.

### 🔹 Chức năng Giám sát & Báo động đa kênh (Backend/Dashboard)
- **Web Dashboard:** Hiển thị biểu đồ dữ liệu nhiệt độ, nồng độ khói cập nhật liên tục theo thời gian thực.
- **Rule Engine:** Đánh giá dữ liệu bất thường và tự động gửi thông báo cảnh báo cháy khẩn cấp về điện thoại người dùng qua Telegram Bot.

### 🔹 Chức năng Quản lý vòng đời thiết bị (Device Lifecycle)
- **Quản lý trọn vẹn trạng thái thiết bị:** Đăng ký tạo mới (*Onboarding*) $\rightarrow$ Đang hoạt động (*Active*) $\rightarrow$ Mất kết nối (*Offline*) $\rightarrow$ Bảo trì (*Maintenance*) $\rightarrow$ Khóa / Thu hồi (*Decommissioned*).

### 🔹 Chức năng Điều khiển từ xa (Remote Control)
- **Điều khiển qua Web:** Cho phép người dùng gửi lệnh từ Web Dashboard xuống thiết bị để tắt còi báo động tạm thời (*Mute*) hoặc kích hoạt còi thử nghiệm (*Test Alarm*).
- **Cơ chế xác nhận (ACK):** Nhận gói tin phản hồi xác nhận từ thiết bị để báo cáo lệnh đã thực thi thành công.

---

## 2. Cơ chế phân quyền người dùng (Role-Based Access Control - RBAC)

Hệ thống áp dụng cơ chế xác thực bảo mật đa lớp (sử dụng Token JWT) và được chia thành 3 vai trò (*Roles*) rõ ràng với các quyền hạn quản lý khác nhau:

### 👑 Vai trò 1: Quản trị viên (Admin)
*Là người nắm quyền cao nhất, quản lý toàn bộ hệ thống.*
- **Quản lý người dùng:** Được phép tạo tài khoản mới, phân quyền, khóa hoặc xóa tài khoản của người dùng khác.
- **Quản lý thiết bị:** Có quyền khởi tạo thiết bị mới (cấp mã `device_id` và token xác thực riêng) hoặc thu hồi quyền kết nối (*Decommission*) để cấm thiết bị đẩy dữ liệu vào mạng.
- **Cấu hình toàn cục:** Thay đổi ngưỡng cảnh báo cháy mặc định (nhiệt độ, nồng độ khói).
- **Bảo mật & Giám sát:** Xem được nhật ký hệ thống (*Audit Logs*) để theo dõi lịch sử đăng nhập, lịch sử ai vừa nhấn nút tắt còi và thời gian thực hiện.

---

### 🛠 Vai trò 2: Người vận hành (Operator / Chủ sở hữu)
*Là người trực tiếp sử dụng thiết bị (ví dụ: chủ nhà, ban quản lý, bảo vệ tòa nhà).*
- **Giám sát:** Xem biểu đồ dữ liệu thời gian thực và trạng thái Online/Offline của các thiết bị mình được cấp quyền quản lý.
- **Điều khiển:** Được quyền nhấn nút "Tắt còi" khi có báo động giả hoặc nhấn nút "Test" còi từ xa.
- **Xử lý sự cố:** Được quyền thay đổi ngưỡng cảnh báo riêng cho thiết bị của mình và bấm "Xác nhận đã xử lý" (*Acknowledge*) khi sự cố cháy đã được khắc phục.
- **Hạn chế:** Không được xóa thiết bị, không được xem Audit Logs hệ thống và không có quyền quản lý tài khoản người dùng khác.

---

### 👁 Vai trò 3: Người xem (Viewer)
*Là người dùng có quyền hạn cơ bản nhất (ví dụ: cư dân sinh sống trong tòa nhà).*
- **Giám sát:** Chỉ được phép xem giao diện Dashboard (biểu đồ nhiệt độ, nồng độ khói, tình trạng hoạt động của thiết bị).
- **Xem lịch sử:** Xem danh sách lịch sử các vụ cảnh báo cháy đã từng xảy ra.
- **Hạn chế:** API Backend sẽ từ chối bằng mã lỗi `403 Forbidden` nếu người dùng này cố tình thao tác gửi lệnh tắt còi báo động, thay đổi ngưỡng cảnh báo hoặc can thiệp vào cấu hình hệ thống.