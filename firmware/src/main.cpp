#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "driver/gpio.h"
#include <PubSubClient.h>
#include "DHTesp.h"
#include <ArduinoJson.h>
#include <time.h>

// ===================== 1. THÔNG TIN FIRMWARE & CHÂN PHẦN CỨNG (ESP32-S3) =====================
#define FIRMWARE_VERSION "v1.0.0"

#define BOOT_BTN_PIN     0   // Nút BOOT trên bo: Nhấn giữ 3 giây để bật Wi-Fi AP Onboarding
#define STATUS_LED_PIN   2   // GPIO 2: Sáng đứng (ACTIVE), Nháy chậm (MAINTENANCE), Tắt (DECOMMISSIONED)
#define MQ2_PIN          4   // GPIO 4: Chân A0 của cảm biến khói/gas MQ-2
#define FLAME_PIN        5   // GPIO 5: Chân D0 của cảm biến lửa KY-026 3 chân (LOW = Có lửa)
#define DHTPIN           6   // GPIO 6: Chân DATA của cảm biến nhiệt ẩm DHT22
#define BUZZER_PIN       7   // GPIO 7: Chân S của Module Passive Buzzer KY-006 (Chân - nối GND)

#define BUZZER_LEDC_CH   0   // Kênh phần cứng LEDC PWM riêng cho Buzzer

// ===================== 2. ĐỊNH NGHĨA VÒNG ĐỜI THIẾT BỊ (DEVICE LIFECYCLE) =====================
// Chu trình chuẩn theo README: ONBOARDING -> ACTIVE <-> MAINTENANCE -> DECOMMISSIONED
enum LifecycleState {
  STATE_ONBOARDING = 0,     // Chờ cấp phát ID / Cấu hình mạng
  STATE_ACTIVE = 1,         // Đang hoạt động giám sát & gửi Telemetry (BẬT)
  STATE_MAINTENANCE = 2,    // Chế độ bảo trì / Tạm tắt báo động cục bộ (TẮT TẠM THỜI)
  STATE_DECOMMISSIONED = 3  // Đã thu hồi quyền kết nối: Cấm đẩy Telemetry vào mạng (KHÓA)
};

const char* lifecycleToString(LifecycleState st) {
  switch (st) {
    case STATE_ONBOARDING:     return "ONBOARDING";
    case STATE_ACTIVE:         return "ACTIVE";
    case STATE_MAINTENANCE:    return "MAINTENANCE";
    case STATE_DECOMMISSIONED: return "DECOMMISSIONED";
    default:                   return "UNKNOWN";
  }
}

// ===================== 3. QUẢN LÝ LƯU TRỮ NVS FLASH & BIẾN TOÀN CỤC =====================
Preferences  prefs;
WebServer    webServer(80);
DHTesp       dhtSensor;
WiFiClient   espClient;
PubSubClient mqttClient(espClient);

// Thông số cấu hình động (Nạp từ Flash NVS, thay đổi qua Web/MQTT không cần nạp lại code)
String         cfgDeviceId    = "ESP32_FIRE_001";
String         cfgDeviceToken = "";
String         cfgWifiSsid    = "Key";
String         cfgWifiPass    = "keys2021";
String         cfgMqttBroker  = "broker.emqx.io";
int            cfgMqttPort    = 1883;
String         cfgMqttUser    = "";
String         cfgMqttPass    = "";
LifecycleState lifecycleState = STATE_ACTIVE;
bool           apPortalActive = false;

// Ngưỡng báo động (Mặc định tự động hiệu chuẩn theo môi trường hoặc nhận từ UPDATE_THRESHOLD)
float gasThresholdPpm         = 420.0;
float tempThresholdC          = 45.0;
float baselineGasPpm          = 350.0;
const float GAS_DELTA_TRIGGER = 55.0; // Tăng 55 ppm so với mức nền là kích hoạt báo động

// 4 MQTT Topics theo đúng đặc tả README.md
String topicTelemetry;
String topicStatus;
String topicCommands;
String topicAck;

// Danh sách Action Commands từ Backend / Dashboard
const char* ACT_MUTE_BUZZER      = "MUTE_BUZZER";
const char* ACT_TEST_ALARM       = "TEST_ALARM";
const char* ACT_UPDATE_THRESHOLD = "UPDATE_THRESHOLD";
const char* ACT_ACK_ALARM        = "ACKNOWLEDGE_ALARM"; // Operator xác nhận đã xử lý sự cố
const char* ACT_SET_LIFECYCLE    = "SET_LIFECYCLE";     // Chuyển trạng thái: ACTIVE / MAINTENANCE / DECOMMISSIONED
const char* ACT_SET_DEVICE_STATE = "SET_DEVICE_STATE";  // Bật/Tắt nhanh: params.enabled = true/false
const char* ACT_ENABLE_DEVICE    = "ENABLE_DEVICE";
const char* ACT_DISABLE_DEVICE   = "DISABLE_DEVICE";
const char* ACT_DECOMMISSION     = "DECOMMISSION_DEVICE";
const char* ACT_PROVISION_DEVICE = "PROVISION_DEVICE";  // Admin cấp phát device_id & token mới
const char* ACT_RECALIBRATE      = "RECALIBRATE_SENSORS";
const char* ACT_FACTORY_RESET    = "FACTORY_RESET";

// Biến dữ liệu cảm biến
float currentGasPpm  = 0.0;
float currentTemp    = 0.0;
float currentHum     = 0.0;
bool  flameDetected  = false;
bool  localAlarm     = false;
bool  isMuted        = false;

// Biến quét nhanh 50Hz (20ms) cho cảm biến lửa KY-026 3 chân & Chốt giữ báo động
unsigned long lastFlamePollMillis    = 0;
unsigned long flameHoldUntilMillis   = 0;
int           flameLowHitCount       = 0;
const unsigned long FLAME_HOLD_MS    = 4000; // Giữ cờ cháy tối thiểu 4s để các gói telemetry 1s luôn bắt kịp

// Quản lý bộ đếm thời gian Non-blocking
unsigned long muteEndTimeMillis      = 0;
bool          isTestAlarmActive      = false;
unsigned long testAlarmEndTimeMillis = 0;
unsigned long lastSirenToggleMillis  = 0;
bool          sirenHighTone          = false;
bool          buzzerIsRunning        = false;

// Chu kỳ thực thi: Đọc cảm biến và telemetry mỗi 1s
unsigned long lastSensorReadMillis   = 0;
unsigned long lastDhtReadMillis      = 0;
unsigned long lastTelemetryMillis    = 0;
unsigned long lastMqttRetryMillis    = 0;
unsigned long bootBtnPressStart      = 0;
const unsigned long SENSOR_INTERVAL    = 1000;
const unsigned long TELEMETRY_INTERVAL = 1000; // 1 giây / lần

// Khai báo nguyên mẫu hàm
void rebuildMqttTopics();
void evaluateEdgeAlarmLogic();
void calibrateSensorsBaseline();
void publishStatusOnline();

// ===================== 4. ĐIỀU KHIỂN ACTIVE BUZZER (XUẤT ÁP DC 3.3V TRỰC TIẾP) =====================


void initBuzzerHardware() {
  pinMode(BUZZER_PIN, OUTPUT);
  // Tăng khả năng cấp dòng của chân GPIO 7 trên ESP32-S3 lên mức tối đa (40mA) 
  // để còi kêu to tương đương khi chạm trực tiếp vào chân nguồn 3V3
  gpio_set_drive_capability((gpio_num_t)BUZZER_PIN, GPIO_DRIVE_CAP_3);
  digitalWrite(BUZZER_PIN, LOW);
}

// Hàm bật/tắt còi: Active Buzzer kêu to nhất khi cấp HIGH liên tục (hoặc ngắt nhịp Bíp-Bíp chậm)
void updateBuzzerSiren() {
  bool isNodeActive = (lifecycleState == STATE_ACTIVE);
  bool shouldRing   = (isNodeActive && localAlarm && !isMuted);

  if (!shouldRing) {
    if (buzzerIsRunning) {
      digitalWrite(BUZZER_PIN, LOW); // Tắt hẳn về 0V
      buzzerIsRunning = false;
    }
    return;
  }

  // Cấp thẳng 3.3V liên tục ra chân GPIO 7 để Active Buzzer kêu to và vang nhất
  // (Nếu bạn muốn kêu thành nhịp "Bíp... Bíp..." cách nhau 0.3 giây thay vì kêu liền một mạch, 
  // chỉ cần đổi dòng dưới thành: digitalWrite(BUZZER_PIN, (millis() % 600 < 400) ? HIGH : LOW); )
  if (!buzzerIsRunning) {
    digitalWrite(BUZZER_PIN, HIGH);
    buzzerIsRunning = true;
  }
}

void beepNotification(int count, int durationMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, LOW);
    if (i < count - 1) delay(80);
  }
}

// ===================== 5. LƯU & TẢI CẤU HÌNH VÒNG ĐỜI TỪ FLASH NVS =====================
void rebuildMqttTopics() {
  topicTelemetry = "fire_alert/devices/" + cfgDeviceId + "/telemetry";
  topicStatus    = "fire_alert/devices/" + cfgDeviceId + "/status";
  topicCommands  = "fire_alert/devices/" + cfgDeviceId + "/commands";
  topicAck       = "fire_alert/devices/" + cfgDeviceId + "/ack";
}

void loadLifecycleConfig() {
  prefs.begin("fire_iot", false);
  cfgDeviceId     = prefs.getString("dev_id", "ESP32_FIRE_001");
  cfgDeviceToken  = prefs.getString("token", "");
  cfgWifiSsid     = prefs.getString("ssid", "Key");
  cfgWifiPass     = prefs.getString("pass", "keys2021");
  cfgMqttBroker   = prefs.getString("broker", "broker.emqx.io");
  cfgMqttPort     = prefs.getInt("port", 1883);
  cfgMqttUser     = prefs.getString("m_user", "");
  cfgMqttPass     = prefs.getString("m_pass", "");
  lifecycleState  = (LifecycleState)prefs.getInt("state", (int)STATE_ACTIVE);
  gasThresholdPpm = prefs.getFloat("gas_thr", 420.0);
  tempThresholdC  = prefs.getFloat("temp_thr", 45.0);
  prefs.end();

  rebuildMqttTopics();
  Serial.printf("\n[NVS] Device ID: %s | Lifecycle: %s | Broker: %s:%d\n",
                cfgDeviceId.c_str(), lifecycleToString(lifecycleState),
                cfgMqttBroker.c_str(), cfgMqttPort);
}

void saveLifecycleConfig() {
  prefs.begin("fire_iot", false);
  prefs.putString("dev_id", cfgDeviceId);
  prefs.putString("token", cfgDeviceToken);
  prefs.putString("ssid", cfgWifiSsid);
  prefs.putString("pass", cfgWifiPass);
  prefs.putString("broker", cfgMqttBroker);
  prefs.putInt("port", cfgMqttPort);
  prefs.putString("m_user", cfgMqttUser);
  prefs.putString("m_pass", cfgMqttPass);
  prefs.putInt("state", (int)lifecycleState);
  prefs.putFloat("gas_thr", gasThresholdPpm);
  prefs.putFloat("temp_thr", tempThresholdC);
  prefs.end();
}

// ===================== 6. XỬ LÝ CẢM BIẾN MQ-2 & KY-026 (3 CHÂN DIGITAL) =====================
#define ADC_SAMPLES 10
float readFilteredGasPpm() {
  long sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    sum += analogRead(MQ2_PIN);
    delay(2);
  }
  float avgRaw = sum / (float)ADC_SAMPLES;
  float ppm = (avgRaw / 4095.0) * 1800.0 + 100.0;
  return roundf(ppm * 10.0) / 10.0;
}

void calibrateSensorsBaseline() {
  Serial.println(F("[CALIB] Dang do muc nen khoi/gas (MQ-2)..."));
  float gasSum = 0;
  for (int i = 0; i < 8; i++) {
    gasSum += readFilteredGasPpm();
    delay(80);
  }
  baselineGasPpm  = gasSum / 8.0;
  gasThresholdPpm = roundf((baselineGasPpm + GAS_DELTA_TRIGGER) * 10.0) / 10.0;
  saveLifecycleConfig();
  Serial.printf("[CALIB] Muc nen: %.1f ppm -> Nguong bao dong: %.1f ppm\n",
                baselineGasPpm, gasThresholdPpm);
}

// Quét 50Hz (20ms/lần) trên chân D0 của KY-026 để bắt nhạy ngọn lửa nhỏ
void pollDigitalFlameSensorFast() {
  unsigned long now = millis();
  if (now - lastFlamePollMillis < 20) return;
  lastFlamePollMillis = now;

  if (lifecycleState != STATE_ACTIVE) {
    flameDetected = false;
    flameLowHitCount = 0;
    return;
  }

  if (digitalRead(FLAME_PIN) == LOW) {
    flameLowHitCount++;
    if (flameLowHitCount >= 2) { // 40ms liên tiếp ở mức LOW -> Xác nhận có lửa
      flameDetected = true;
      flameHoldUntilMillis = now + FLAME_HOLD_MS;
      evaluateEdgeAlarmLogic();
    }
  } else {
    flameLowHitCount = 0;
    if (now >= flameHoldUntilMillis) {
      flameDetected = false;
    }
  }
}

// ===================== 7. THUẬT TOÁN TẠI BIÊN (EDGE LOGIC - ZERO LATENCY) =====================
unsigned long getEpochTime() {
  time_t now;
  time(&now);
  if (now < 1700000000) return 0;
  return (unsigned long)now;
}

void evaluateEdgeAlarmLogic() {
  // Nếu thiết bị đang ở trạng thái MAINTENANCE, DECOMMISSIONED hoặc ONBOARDING -> Tắt báo động
  if (lifecycleState != STATE_ACTIVE) {
    localAlarm = false;
    isTestAlarmActive = false;
    updateBuzzerSiren();
    return;
  }

  unsigned long nowMs = millis();

  if (isMuted && nowMs >= muteEndTimeMillis) {
    isMuted = false;
    Serial.println(F("[EDGE] Het thoi gian Mute, khoi phuc canh bao."));
  }

  if (isTestAlarmActive && nowMs >= testAlarmEndTimeMillis) {
    isTestAlarmActive = false;
    Serial.println(F("[EDGE] Ket thuc chu trinh TEST_ALARM."));
  }

  bool dangerCondition = (flameDetected || (currentGasPpm >= gasThresholdPpm) || (currentTemp >= tempThresholdC));
  localAlarm = (dangerCondition || isTestAlarmActive);

  updateBuzzerSiren();
}

// ===================== 8. GIAO DIỆN WEB ONBOARDING & QUẢN LÝ VÒNG ĐỜI (ZERO-CODE UI) =====================
void handleWebRoot() {
  String html = F("<!DOCTYPE html><html><head><meta charset='utf-8'>"
                  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                  "<title>He Thong Bao Chay IoT - Nhom 14</title>"
                  "<style>body{font-family:Arial,sans-serif;max-width:500px;margin:16px auto;padding:12px;background:#f0f2f5}"
                  ".card{background:#fff;padding:16px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:14px}"
                  "h2,h3{margin-top:0;color:#d93025}label{display:block;margin-top:8px;font-weight:bold;font-size:13px}"
                  "input,select{width:100%;padding:8px;margin-top:4px;box-sizing:border-box;border:1px solid #ccc;border-radius:5px}"
                  "button{width:100%;padding:10px;margin-top:10px;border:none;border-radius:5px;color:#fff;font-weight:bold;cursor:pointer}"
                  ".btn-green{background:#1e8e3e}.btn-orange{background:#f29900}.btn-red{background:#d93025}.btn-blue{background:#1a73e8}"
                  "</style></head><body>");

  html += "<div class='card'><h2>Edge Portal - Bao Chay IoT</h2>";
  html += "<p><b>Device ID:</b> " + cfgDeviceId + " (" + String(FIRMWARE_VERSION) + ")<br>";
  html += "<b>Vong doi (Lifecycle):</b> <span style='color:#1a73e8;font-weight:bold'>" + String(lifecycleToString(lifecycleState)) + "</span><br>";
  html += "<b>Khoi/Gas:</b> " + String(currentGasPpm, 1) + " / " + String(gasThresholdPpm, 1) + " ppm<br>";
  html += "<b>Nhiet do:</b> " + String(currentTemp, 1) + " / " + String(tempThresholdC, 1) + " C | <b>Do am:</b> " + String(currentHum, 1) + "%<br>";
  html += "<b>Lua (KY-026):</b> " + String(flameDetected ? "<b style='color:red'>PHAT HIEN CO LUA!</b>" : "An toan") + "</p>";

  // Nút bật/tắt nhanh và chuyển đổi trạng thái vòng đời
  bool isAct = (lifecycleState == STATE_ACTIVE);
  html += "<form action='/toggle' method='POST'><button class='" + String(isAct ? "btn-orange" : "btn-green") + "'>" +
          String(isAct ? "TAM TAT THIET BI (CHUYEN SANG BAO TRI)" : "BAT THIET BI (CHUYEN SANG ACTIVE)") + "</button></form>";
  html += "<form action='/test_alarm' method='POST'><button class='btn-red'>TEST COI BAO DONG (5 GIAY)</button></form>";
  html += "<form action='/recal' method='POST'><button class='btn-blue'>TU DONG LAY MOC NEN KHI GAS (CALIB)</button></form></div>";

  // Form Onboarding & Cấu hình thiết bị
  html += "<div class='card'><h3>Onboarding & Quan Ly Vong Doi</h3><form action='/save' method='POST'>";
  html += "<label>Ma Thiet Bi (device_id):</label><input name='dev_id' value='" + cfgDeviceId + "' required>";
  html += "<label>Token Xac Thuc (device_token - Tuy chon):</label><input name='token' value='" + cfgDeviceToken + "'>";
  html += "<label>Trang Thai Vong Doi:</label><select name='state'>";
  html += "<option value='1'" + String(lifecycleState == STATE_ACTIVE ? " selected" : "") + ">ACTIVE (Dang hoat dong)</option>";
  html += "<option value='2'" + String(lifecycleState == STATE_MAINTENANCE ? " selected" : "") + ">MAINTENANCE (Bao tri / Tam tat)</option>";
  html += "<option value='3'" + String(lifecycleState == STATE_DECOMMISSIONED ? " selected" : "") + ">DECOMMISSIONED (Thu hoi / Khoa)</option></select>";
  html += "<label>Wi-Fi SSID:</label><input name='ssid' value='" + cfgWifiSsid + "' required>";
  html += "<label>Wi-Fi Password:</label><input name='pass' type='password' value='" + cfgWifiPass + "'>";
  html += "<label>MQTT Broker (IP / Domain):</label><input name='broker' value='" + cfgMqttBroker + "' required>";
  html += "<label>MQTT Port:</label><input name='port' type='number' value='" + String(cfgMqttPort) + "' required>";
  html += "<label>Nguong Khoi/Gas (smoke_threshold - ppm):</label><input name='gas_thr' type='number' step='0.1' value='" + String(gasThresholdPpm, 1) + "'>";
  html += "<label>Nguong Nhiet Do (temp_threshold - C):</label><input name='temp_thr' type='number' step='0.1' value='" + String(tempThresholdC, 1) + "'>";
  html += "<button type='submit' class='btn-blue'>LUU CAU HINH & CAP PHAT</button></form></div></body></html>";

  webServer.send(200, "text/html", html);
}

void setupWebPortal() {
  webServer.on("/", HTTP_GET, handleWebRoot);

  webServer.on("/toggle", HTTP_POST, []() {
    lifecycleState = (lifecycleState == STATE_ACTIVE) ? STATE_MAINTENANCE : STATE_ACTIVE;
    saveLifecycleConfig();
    evaluateEdgeAlarmLogic();
    publishStatusOnline();
    beepNotification(1, 100);
    webServer.sendHeader("Location", "/");
    webServer.send(303);
  });

  webServer.on("/test_alarm", HTTP_POST, []() {
    lifecycleState = STATE_ACTIVE;
    isMuted = false;
    isTestAlarmActive = true;
    testAlarmEndTimeMillis = millis() + 5000UL;
    evaluateEdgeAlarmLogic();
    webServer.sendHeader("Location", "/");
    webServer.send(303);
  });

  webServer.on("/recal", HTTP_POST, []() {
    calibrateSensorsBaseline();
    beepNotification(2, 80);
    webServer.sendHeader("Location", "/");
    webServer.send(303);
  });

  webServer.on("/save", HTTP_POST, []() {
    bool reconnectNeeded = false;
    if (webServer.hasArg("dev_id") && webServer.arg("dev_id").length() > 0) {
      String newId = webServer.arg("dev_id");
      newId.trim();
      if (newId != cfgDeviceId) {
        cfgDeviceId = newId;
        rebuildMqttTopics();
        reconnectNeeded = true;
      }
    }
    if (webServer.hasArg("token")) cfgDeviceToken = webServer.arg("token");
    if (webServer.hasArg("state")) {
      lifecycleState = (LifecycleState)webServer.arg("state").toInt();
    }
    if (webServer.hasArg("ssid") && webServer.arg("ssid") != cfgWifiSsid) {
      cfgWifiSsid = webServer.arg("ssid");
      reconnectNeeded = true;
    }
    if (webServer.hasArg("pass") && webServer.arg("pass").length() > 0) {
      cfgWifiPass = webServer.arg("pass");
      reconnectNeeded = true;
    }
    if (webServer.hasArg("broker") && webServer.arg("broker") != cfgMqttBroker) {
      cfgMqttBroker = webServer.arg("broker");
      reconnectNeeded = true;
    }
    if (webServer.hasArg("port"))     cfgMqttPort     = webServer.arg("port").toInt();
    if (webServer.hasArg("gas_thr"))  gasThresholdPpm = webServer.arg("gas_thr").toFloat();
    if (webServer.hasArg("temp_thr")) tempThresholdC  = webServer.arg("temp_thr").toFloat();

    saveLifecycleConfig();
    evaluateEdgeAlarmLogic();
    publishStatusOnline();
    beepNotification(2, 100);

    webServer.send(200, "text/html", "<h3>Da luu cau hinh! Dang cap nhat he thong...</h3><script>setTimeout(()=>location.href='/',2000);</script>");
    if (reconnectNeeded) {
      delay(800);
      ESP.restart();
    }
  });

  webServer.begin();
}

void startOnboardingAccessPoint() {
  WiFi.mode(WIFI_AP_STA);
  String apName = "FireAlert-Node-" + cfgDeviceId;
  WiFi.softAP(apName.c_str());
  apPortalActive = true;
  Serial.printf("\n[ONBOARDING AP] Phat Wi-Fi: %s | Truy cap: http://192.168.4.1\n", apName.c_str());
}

// ===================== 9. GIAO TIẾP MQTT CHUẨN ĐẶC TẢ README.MD =====================
// (4) Bản tin Xác nhận lệnh (Command ACK) - Topic: fire_alert/devices/{device_id}/ack
void publishCommandAck(const char* cmdId, const char* status, const char* msg) {
  JsonDocument doc;
  doc["command_id"] = cmdId;
  doc["device_id"]  = cfgDeviceId;
  doc["status"]     = status;
  doc["message"]    = msg;

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(topicAck.c_str(), buffer, false);
  Serial.printf("[MQTT -> ACK] %s\n", buffer);
}

// (2) Bản tin Trạng thái Online - Topic: fire_alert/devices/{device_id}/status
void publishStatusOnline() {
  if (!mqttClient.connected()) return;

  JsonDocument statusDoc;
  statusDoc["device_id"]        = cfgDeviceId;
  statusDoc["status"]           = (lifecycleState == STATE_ACTIVE) ? "ONLINE" : "OFFLINE";
  statusDoc["firmware_version"] = FIRMWARE_VERSION;
  statusDoc["lifecycle_state"]  = lifecycleToString(lifecycleState);
  statusDoc["smoke_threshold"]  = gasThresholdPpm;
  statusDoc["temp_threshold"]   = tempThresholdC;

  char statusBuffer[256];
  serializeJson(statusDoc, statusBuffer);
  mqttClient.publish(topicStatus.c_str(), statusBuffer, true);
  Serial.printf("[MQTT -> STATUS] %s\n", statusBuffer);
}

// (3) Xử lý Lệnh điều khiển từ Backend FastAPI - Topic: fire_alert/devices/{device_id}/commands
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("\n[MQTT <- COMMAND] Topic: %s\n", topic);

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.printf("[LOI JSON] %s\n", error.c_str());
    return;
  }

  const char* cmdId  = doc["command_id"] | "cmd_unknown";
  const char* action = doc["action"]     | "";

  // 1. Lệnh tắt còi tạm thời (MUTE_BUZZER)
  if (strcmp(action, ACT_MUTE_BUZZER) == 0) {
    int durationSec = doc["params"]["duration_sec"] | 60;
    isMuted = true;
    muteEndTimeMillis = millis() + (durationSec * 1000UL);
    evaluateEdgeAlarmLogic();
    publishCommandAck(cmdId, "SUCCESS", "Executed MUTE_BUZZER");
  }
  // 2. Lệnh cập nhật ngưỡng cảnh báo từ xa (UPDATE_THRESHOLD)
  // Hỗ trợ cả khóa chuẩn trong README (smoke_threshold, temp_threshold) lẫn khóa cũ (gas_ppm, temperature)
  else if (strcmp(action, ACT_UPDATE_THRESHOLD) == 0) {
    if (!doc["params"]["smoke_threshold"].isNull()) {
      gasThresholdPpm = doc["params"]["smoke_threshold"].as<float>();
    } else if (!doc["params"]["gas_ppm"].isNull()) {
      gasThresholdPpm = doc["params"]["gas_ppm"].as<float>();
    }

    if (!doc["params"]["temp_threshold"].isNull()) {
      tempThresholdC = doc["params"]["temp_threshold"].as<float>();
    } else if (!doc["params"]["temperature"].isNull()) {
      tempThresholdC = doc["params"]["temperature"].as<float>();
    }

    saveLifecycleConfig();
    evaluateEdgeAlarmLogic();
    publishCommandAck(cmdId, "SUCCESS", "Executed UPDATE_THRESHOLD");
  }
  // 3. Lệnh kích hoạt còi thử nghiệm (TEST_ALARM)
  else if (strcmp(action, ACT_TEST_ALARM) == 0) {
    if (lifecycleState == STATE_DECOMMISSIONED) {
      publishCommandAck(cmdId, "FAILED", "Device is DECOMMISSIONED");
      return;
    }
    int durationSec = doc["params"]["duration_sec"] | 10;
    isMuted = false;
    isTestAlarmActive = true;
    testAlarmEndTimeMillis = millis() + (durationSec * 1000UL);
    evaluateEdgeAlarmLogic();
    publishCommandAck(cmdId, "SUCCESS", "Executed TEST_ALARM");
  }
  // 4. Lệnh Operator xác nhận đã xử lý sự cố cháy (ACKNOWLEDGE_ALARM)
  else if (strcmp(action, ACT_ACK_ALARM) == 0) {
    isMuted = true;
    isTestAlarmActive = false;
    flameDetected = false;
    flameHoldUntilMillis = 0;
    muteEndTimeMillis = millis() + 30000UL;
    evaluateEdgeAlarmLogic();
    publishCommandAck(cmdId, "SUCCESS", "Executed ACKNOWLEDGE_ALARM");
  }
  // 5. Nhóm lệnh Quản lý vòng đời & Bật/Tắt thiết bị (Admin / Operator)
  else if (strcmp(action, ACT_SET_LIFECYCLE) == 0 ||
           strcmp(action, ACT_SET_DEVICE_STATE) == 0 ||
           strcmp(action, ACT_ENABLE_DEVICE) == 0 ||
           strcmp(action, ACT_DISABLE_DEVICE) == 0 ||
           strcmp(action, ACT_DECOMMISSION) == 0) {

    if (strcmp(action, ACT_ENABLE_DEVICE) == 0) {
      lifecycleState = STATE_ACTIVE;
    } else if (strcmp(action, ACT_DISABLE_DEVICE) == 0) {
      lifecycleState = STATE_MAINTENANCE;
    } else if (strcmp(action, ACT_DECOMMISSION) == 0) {
      lifecycleState = STATE_DECOMMISSIONED;
    } else if (!doc["params"]["state"].isNull()) {
      String st = doc["params"]["state"].as<String>();
      st.toUpperCase();
      if (st == "ACTIVE")              lifecycleState = STATE_ACTIVE;
      else if (st == "MAINTENANCE")    lifecycleState = STATE_MAINTENANCE;
      else if (st == "DECOMMISSIONED") lifecycleState = STATE_DECOMMISSIONED;
    } else if (!doc["params"]["enabled"].isNull()) {
      lifecycleState = doc["params"]["enabled"].as<bool>() ? STATE_ACTIVE : STATE_MAINTENANCE;
    }

    saveLifecycleConfig();
    evaluateEdgeAlarmLogic();
    publishStatusOnline();
    beepNotification(1, 100);

    String msg = String("Executed lifecycle transition to ") + lifecycleToString(lifecycleState);
    publishCommandAck(cmdId, "SUCCESS", msg.c_str());
  }
  // 6. Lệnh Admin cấp phát mã device_id và token mới (PROVISION_DEVICE - Onboarding)
  else if (strcmp(action, ACT_PROVISION_DEVICE) == 0) {
    const char* newId = doc["params"]["new_device_id"] | "";
    if (strlen(newId) == 0) {
      publishCommandAck(cmdId, "FAILED", "Missing params.new_device_id");
      return;
    }

    if (!doc["params"]["device_token"].isNull()) {
      cfgDeviceToken = doc["params"]["device_token"].as<String>();
    }
    lifecycleState = STATE_ACTIVE;

    publishCommandAck(cmdId, "SUCCESS", "Executed PROVISION_DEVICE");
    mqttClient.unsubscribe(topicCommands.c_str());

    cfgDeviceId = String(newId);
    saveLifecycleConfig();
    rebuildMqttTopics();
    beepNotification(2, 100);

    mqttClient.disconnect(); // Tự động kết nối lại bằng device_id mới
  }
  // 7. Lệnh đo lại mức nền cảm biến (RECALIBRATE_SENSORS)
  else if (strcmp(action, ACT_RECALIBRATE) == 0) {
    calibrateSensorsBaseline();
    publishCommandAck(cmdId, "SUCCESS", "Executed RECALIBRATE_SENSORS");
  }
  // 8. Lệnh khôi phục cài đặt gốc (FACTORY_RESET)
  else if (strcmp(action, ACT_FACTORY_RESET) == 0) {
    publishCommandAck(cmdId, "SUCCESS", "Executed FACTORY_RESET");
    delay(300);
    prefs.begin("fire_iot", false);
    prefs.clear();
    prefs.end();
    ESP.restart();
  }
  else {
    publishCommandAck(cmdId, "FAILED", "Unknown action");
  }
}

// ===================== 10. KẾT NỐI WI-FI & MQTT (KÈM LWT CHUẨN README) =====================
void connectWiFi() {
  Serial.printf("\n[Wi-Fi] Dang ket noi toi: %s ", cfgWifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfgWifiSsid.c_str(), cfgWifiPass.c_str());

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 24) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(250);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[Wi-Fi] THANH CONG! IP: %s (Mở trình duyệt truy cập http://%s để quản lý)\n",
                  WiFi.localIP().toString().c_str(), WiFi.localIP().toString().c_str());
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println(F("\n[Wi-Fi] Khong the ket noi! Chuyen sang che do Onboarding AP + Edge Logic..."));
    startOnboardingAccessPoint();
  }
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttRetryMillis < 3000) return;
  lastMqttRetryMillis = now;

  mqttClient.setServer(cfgMqttBroker.c_str(), cfgMqttPort);
  Serial.printf("[MQTT] Ket noi Broker %s:%d (ID: %s)... ",
                cfgMqttBroker.c_str(), cfgMqttPort, cfgDeviceId.c_str());

  // Bản tin LWT chuẩn theo Mục 3.(2) trong README.md
  JsonDocument lwtDoc;
  lwtDoc["device_id"] = cfgDeviceId;
  lwtDoc["status"]    = "OFFLINE";
  lwtDoc["reason"]    = "CONNECTION_LOST";
  char lwtBuffer[140];
  serializeJson(lwtDoc, lwtBuffer);

  String clientId = cfgDeviceId + "_" + String(random(1000, 9999));
  const char* user = (cfgMqttUser.length() > 0) ? cfgMqttUser.c_str() : nullptr;
  const char* pass = (cfgDeviceToken.length() > 0) ? cfgDeviceToken.c_str() :
                     ((cfgMqttPass.length() > 0) ? cfgMqttPass.c_str() : nullptr);

  bool connected = false;
  if (user != nullptr || pass != nullptr) {
    connected = mqttClient.connect(clientId.c_str(), user ? user : cfgDeviceId.c_str(), pass ? pass : "",
                                   topicStatus.c_str(), 1, true, lwtBuffer);
  } else {
    connected = mqttClient.connect(clientId.c_str(), topicStatus.c_str(), 1, true, lwtBuffer);
  }

  if (connected) {
    Serial.println(F("ONLINE!"));
    publishStatusOnline();
    mqttClient.subscribe(topicCommands.c_str(), 1);
    Serial.printf("[MQTT] Da Subscribe: %s\n", topicCommands.c_str());
  } else {
    Serial.printf("That bai (rc=%d). Thu lai sau 3s...\n", mqttClient.state());
  }
}

// ===================== 11. BẢN TIN TELEMETRY ĐỊNH KỲ 1 GIÂY / LẦN =====================
void publishTelemetry() {
  // Nếu thiết bị đã bị Admin thu hồi quyền kết nối (DECOMMISSIONED) hoặc đang bảo trì (MAINTENANCE)
  // thì không đẩy Telemetry vào mạng đúng theo đặc tả RBAC Mục 2 trong README.md
  if (!mqttClient.connected() || lifecycleState != STATE_ACTIVE) return;

  JsonDocument doc;
  doc["device_id"]   = cfgDeviceId;
  doc["timestamp"]   = getEpochTime();
  doc["gas_ppm"]     = serialized(String(currentGasPpm, 1));
  doc["temperature"] = serialized(String(currentTemp, 1));
  doc["humidity"]    = serialized(String(currentHum, 1));

  JsonObject units = doc["units"].to<JsonObject>();
  units["gas"]         = "ppm";
  units["temperature"] = "C";
  units["humidity"]    = "%";

  doc["flame_detected"] = flameDetected;
  doc["local_alarm"]    = localAlarm;
  doc["is_muted"]       = isMuted;

  char payload[380];
  serializeJson(doc, payload);

  // Publish với QoS = 0/1 theo chuẩn PubSubClient
  mqttClient.publish(topicTelemetry.c_str(), payload, false);
  Serial.printf("[MQTT -> TELEMETRY] %s\n", payload);
}

// ===================== 12. SETUP & VÒNG LẶP CHÍNH =====================
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(BOOT_BTN_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(FLAME_PIN, INPUT_PULLUP);

  // Khởi tạo PWM phần cứng cho Passive Buzzer KY-006
  initBuzzerHardware();
  beepNotification(2, 100);

  loadLifecycleConfig();

  dhtSensor.setup(DHTPIN, DHTesp::DHT22);
  calibrateSensorsBaseline();

  connectWiFi();
  setupWebPortal();

  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
}

void loop() {
  unsigned long now = millis();

  // 1. Phục vụ giao diện Web quản lý tại chỗ & Nút nhấn cứng BOOT (giữ 3s để bật AP Onboarding)
  webServer.handleClient();
  if (digitalRead(BOOT_BTN_PIN) == LOW) {
    if (bootBtnPressStart == 0) bootBtnPressStart = now;
    else if (now - bootBtnPressStart >= 3000 && !apPortalActive) {
      beepNotification(3, 90);
      startOnboardingAccessPoint();
    }
  } else {
    bootBtnPressStart = 0;
  }

  // 2. Quét 50Hz cảm biến lửa KY-026 (3 chân) & Duy trì tiếng còi hú Siren
  pollDigitalFlameSensorFast();
  updateBuzzerSiren();

  // 3. Duy trì kết nối mạng & Hiển thị trạng thái vòng đời qua đèn LED GPIO 2
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      connectMQTT();
    } else {
      mqttClient.loop();
    }
  }

  if (lifecycleState == STATE_ACTIVE) {
    digitalWrite(STATUS_LED_PIN, mqttClient.connected() ? HIGH : ((now % 400) < 200));
  } else if (lifecycleState == STATE_MAINTENANCE) {
    digitalWrite(STATUS_LED_PIN, (now % 2000) < 200); // Chớp nhẹ mỗi 2 giây khi đang Bảo trì
  } else {
    digitalWrite(STATUS_LED_PIN, LOW); // Tắt hẳn khi bị Decommissioned
  }

  // 4. Đọc DHT22 mỗi 2.5 giây
  if (lifecycleState == STATE_ACTIVE && (now - lastDhtReadMillis >= 2500)) {
    lastDhtReadMillis = now;
    TempAndHumidity dhtData = dhtSensor.getTempAndHumidity();
    if (dhtSensor.getStatus() == DHTesp::ERROR_NONE) {
      currentTemp = roundf(dhtData.temperature * 10.0) / 10.0;
      currentHum  = roundf(dhtData.humidity * 10.0) / 10.0;
    }
  }

  // 5. Đọc MQ-2 & Thực thi Edge Logic mỗi 1 giây
  if (now - lastSensorReadMillis >= SENSOR_INTERVAL) {
    lastSensorReadMillis = now;

    if (lifecycleState == STATE_ACTIVE) {
      int rawAdc = analogRead(MQ2_PIN);
      currentGasPpm = readFilteredGasPpm();
      int flamePinLevel = digitalRead(FLAME_PIN);

      evaluateEdgeAlarmLogic();

      Serial.printf("[EDGE | %s] Gas:%5.1f/%5.1f ppm (ADC:%4d) | Temp:%.1fC | Flame:%-3s (Pin5=%d) | Alarm:%-3s\n",
                    cfgDeviceId.c_str(), currentGasPpm, gasThresholdPpm, rawAdc, currentTemp,
                    flameDetected ? "YES" : "NO", flamePinLevel,
                    localAlarm ? "ON" : "OFF");
    } else {
      Serial.printf("[LIFECYCLE | %s] Thiet bi dang o trang thai: %s (Ngung bao dong & Telemetry)\n",
                    cfgDeviceId.c_str(), lifecycleToString(lifecycleState));
    }
  }

  // 6. Đẩy telemetry định kỳ mỗi 1 giây / lần (Đúng chuẩn Mục 3.(1) README.md)
  if (now - lastTelemetryMillis >= TELEMETRY_INTERVAL) {
    lastTelemetryMillis = now;
    publishTelemetry();
  }
}