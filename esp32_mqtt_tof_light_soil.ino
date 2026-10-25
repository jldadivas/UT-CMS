#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>   // Library: "PubSubClient" by Nick O'Leary
#include <Adafruit_VL53L0X.h>
#include <BH1750.h>

// ================================
// CONFIGURATION
// ================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_BROKER   = "YOUR_RASPBERRY_PI_IP";
const int   MQTT_PORT     = 1883;

// Different topics and client ID from the other ESP32 sketch,
// so the two boards never overwrite each other on the broker.
const char* MQTT_TOPIC        = "esp32/tof_light_soil_data";
const char* MQTT_STATUS_TOPIC = "esp32/tof_light_soil_status";  // online/offline (Last Will)
const char* MQTT_CLIENT_ID    = "esp32-tof-light-soil";

// Leave MQTT_USER as "" for anonymous access.
const char* MQTT_USER     = "";
const char* MQTT_PASS     = "";

const unsigned long PUBLISH_INTERVAL_MS = 5000;   // publish every 5 seconds
const unsigned long WIFI_RETRY_MS       = 10000;  // retry Wi-Fi every 10 s
const unsigned long MQTT_RETRY_MS       = 5000;   // retry MQTT every 5 s

// ================================
// TOF SENSOR PINS
// ================================
#define TOF_SDA 21
#define TOF_SCL 22

// ================================
// BH1750 LIGHT SENSOR PINS
// ================================
#define LIGHT_SDA 18
#define LIGHT_SCL 19

// ================================
// SOIL MOISTURE SENSOR PIN
// ================================
#define SOIL_PIN 34   // ADC1 - safe to use with Wi-Fi

// ================================
// SEPARATE I2C BUSES
// ================================
TwoWire tofWire = TwoWire(0);
TwoWire lightWire = TwoWire(1);

// ================================
// SENSOR OBJECTS
// ================================
Adafruit_VL53L0X tof;
BH1750 lightMeter;

bool tofReady = false;
bool lightReady = false;

// ================================
// NETWORK GLOBALS
// ================================
WiFiClient   wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastPublish = 0;
unsigned long lastWifiTry = 0;
unsigned long lastMqttTry = 0;

// ================================
// WI-FI
// ================================
void connectWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Wait up to 15 s on first boot; loop() handles later drops without blocking
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi not connected yet, will keep retrying...");
  }
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastWifiTry >= WIFI_RETRY_MS) {
    lastWifiTry = now;
    Serial.println("Wi-Fi lost. Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ================================
// MQTT
// ================================
bool connectMQTT() {
  Serial.print("Connecting to MQTT broker ");
  Serial.print(MQTT_BROKER);
  Serial.print("... ");

  bool ok;
  if (strlen(MQTT_USER) > 0) {
    ok = mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS,
                            MQTT_STATUS_TOPIC, 1, true, "offline");
  } else {
    ok = mqttClient.connect(MQTT_CLIENT_ID, nullptr, nullptr,
                            MQTT_STATUS_TOPIC, 1, true, "offline");
  }

  if (ok) {
    Serial.println("connected.");
    mqttClient.publish(MQTT_STATUS_TOPIC, "online", true);
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
  return ok;
}

void maintainMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttTry >= MQTT_RETRY_MS) {
    lastMqttTry = now;
    connectMQTT();
  }
}

// ================================
// SENSORS + PUBLISH
// ================================
void publishSensorData() {
  // 1. ToF distance (null when not connected or out of range)
  char tofMmStr[16] = "null";
  char tofCmStr[16] = "null";

  if (tofReady) {
    VL53L0X_RangingMeasurementData_t measurement;
    tof.rangingTest(&measurement, false);

    if (measurement.RangeStatus != 4) {
      snprintf(tofMmStr, sizeof(tofMmStr), "%u", measurement.RangeMilliMeter);
      snprintf(tofCmStr, sizeof(tofCmStr), "%.1f", measurement.RangeMilliMeter / 10.0);
    }
  }

  // 2. BH1750 light (null when not connected or read error)
  char luxStr[16] = "null";

  if (lightReady) {
    float lux = lightMeter.readLightLevel();
    if (lux >= 0) {
      snprintf(luxStr, sizeof(luxStr), "%.2f", lux);
    }
  }

  // 3. Soil moisture
  int soilValue = analogRead(SOIL_PIN);

  // Build JSON
  char payload[256];
  snprintf(payload, sizeof(payload),
           "{\"tof_mm\":%s,\"tof_cm\":%s,"
           "\"lux\":%s,"
           "\"soil_raw\":%d,"
           "\"rssi\":%d}",
           tofMmStr, tofCmStr,
           luxStr,
           soilValue,
           WiFi.RSSI());

  Serial.print("Publishing to ");
  Serial.print(MQTT_TOPIC);
  Serial.print(": ");
  Serial.println(payload);

  if (!mqttClient.publish(MQTT_TOPIC, payload)) {
    Serial.println("Publish failed.");
  }
}

// ================================
// SETUP / LOOP
// ================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  Serial.println();
  Serial.println("================================");
  Serial.println(" ESP32 SENSOR NODE - MQTT");
  Serial.println(" ToF | BH1750 | Soil Moisture");
  Serial.println("================================");

  // Initialize ToF I2C bus
  if (tofWire.begin(TOF_SDA, TOF_SCL, 100000)) {
    Serial.println("ToF I2C bus initialized.");

    if (tof.begin(0x29, false, &tofWire)) {
      tofReady = true;
      Serial.println("ToF sensor: CONNECTED");
    } else {
      Serial.println("ToF sensor: NOT DETECTED");
      Serial.println("Check ToF wiring and sensor model.");
    }
  } else {
    Serial.println("ToF I2C bus initialization failed.");
  }

  // Initialize BH1750 on a separate I2C bus
  if (lightWire.begin(LIGHT_SDA, LIGHT_SCL, 100000)) {
    Serial.println("BH1750 I2C bus initialized.");

    if (lightMeter.begin(
          BH1750::CONTINUOUS_HIGH_RES_MODE,
          0x23,
          &lightWire)) {
      lightReady = true;
      Serial.println("BH1750: CONNECTED");
    } else {
      Serial.println("BH1750: NOT DETECTED");
      Serial.println("Check BH1750 wiring and I2C address.");
    }
  } else {
    Serial.println("BH1750 I2C bus initialization failed.");
  }

  Serial.println("Soil moisture sensor: READY");

  connectWiFi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(30);

  Serial.println("Starting readings...");
  Serial.println("================================");
}

void loop() {
  maintainWiFi();
  maintainMQTT();
  mqttClient.loop();   // keeps the MQTT connection alive

  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;

    if (mqttClient.connected()) {
      publishSensorData();
    } else {
      Serial.println("MQTT offline, skipping publish.");
    }
  }
}
