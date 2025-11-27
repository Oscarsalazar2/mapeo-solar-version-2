#include <Wire.h>
#include <BH1750.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define TCA_ADDR 0x70   // Dirección del multiplexor TCA9548A

// === Sensores BH1750 en cada canal del TCA9548A ===
BH1750 s0;
BH1750 s1;
BH1750 s2;
BH1750 s3;
BH1750 s4;
BH1750 s5;
BH1750 s6;
BH1750 s7A(0x23);   // Canal 7 – sensor A
BH1750 s7B(0x5C);   // Canal 7 – sensor B

// === WiFi y servidor ===
const char* ssid     = "S22 de Mario";
const char* password = "vjgw3101";

// ⚠️ IP de tu LAPTOP donde corre Fastify
const char* serverUrl = "http://10.226.92.104:3000/api/lecturas-multi";

// ==========================
// Seleccionar canal del TCA
// ==========================
void tcaSelect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
  delay(3);
}

// Lectura segura (si da error, regresa 0)
float leerBH1750(BH1750 &sensor) {
  float val = sensor.readLightLevel();
  if (val < 0) {
    Serial.println("[BH1750] Device is not configured!");
    val = 0;
  }
  return val;
}

// ==========================
// Enviar TODAS las lecturas
// ==========================
void enviarLecturasBatch(float lecturas[]) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠ WiFi desconectado, no se envía batch");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  http.begin(client, serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Crear JSON con todas las lecturas
  String json = "{ \"lecturas\": [";

  for (int i = 0; i < 9; i++) {
    json += "{";
    json += "\"sensor_id\":" + String(i + 1) + ",";
    json += "\"lux\":" + String((int)lecturas[i]);
    json += "}";
    if (i < 8) json += ",";
  }

  json += "] }";

  Serial.println("JSON enviado:");
  Serial.println(json);

  int code = http.POST(json);
  Serial.print("POST Batch -> ");
  Serial.println(code);

  if (code > 0) {
    Serial.println("Respuesta servidor:");
    Serial.println(http.getString());
  } else {
    Serial.print("Error HTTP: ");
    Serial.println(code);
  }

  http.end();
}

// ==========================
void setup() {
  Serial.begin(115200);
  Wire.begin();

  // ======================
  // Conexión a WiFi
  // ======================
  WiFi.begin(ssid, password);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado.");
  Serial.print("IP del ESP32: ");
  Serial.println(WiFi.localIP());

  // ======================
  // Inicializar BH1750
  // ======================
  tcaSelect(0); s0.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  tcaSelect(1); s1.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  tcaSelect(2); s2.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  tcaSelect(3); s3.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  tcaSelect(4); s4.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  tcaSelect(5); s5.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  tcaSelect(6); s6.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);

  tcaSelect(7);
  s7A.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);
  s7B.begin(BH1750::CONTINUOUS_HIGH_RES_MODE); delay(200);

  Serial.println("Sensores BH1750 listos.");
}

// ==========================
void loop() {

  float L[9];

  // === Lectura canales 0–6 ===
  tcaSelect(0); L[0] = leerBH1750(s0);
  tcaSelect(1); L[1] = leerBH1750(s1);
  tcaSelect(2); L[2] = leerBH1750(s2);
  tcaSelect(3); L[3] = leerBH1750(s3);
  tcaSelect(4); L[4] = leerBH1750(s4);
  tcaSelect(5); L[5] = leerBH1750(s5);
  tcaSelect(6); L[6] = leerBH1750(s6);

  // === Canal 7 dos sensores ===
  tcaSelect(7);
  L[7] = leerBH1750(s7A);
  L[8] = leerBH1750(s7B);

  Serial.println("Lecturas OK, enviando batch...");
  enviarLecturasBatch(L);

  delay(1000); // 1 segundo
}
