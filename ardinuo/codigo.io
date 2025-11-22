#include <Wire.h>
#include <BH1750.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define TCA_ADDR 0x70   // Dirección I2C del multiplexor TCA9548A

// === Sensores BH1750 ===
// Canales 0 a 6 (7 sensores con dirección 0x23)
BH1750 s0(0x23);  // CH0
BH1750 s1(0x23);  // CH1
BH1750 s2(0x23);  // CH2
BH1750 s3(0x23);  // CH3
BH1750 s4(0x23);  // CH4
BH1750 s5(0x23);  // CH5
BH1750 s6(0x23);  // CH6

// Canal 7 → dos sensores (uno en 0x23 y otro en 0x5C)
BH1750 s7A(0x23); // Sensor A del canal 7
BH1750 s7B(0x5C); // Sensor B del canal 7

// ========================
// CONFIGURACIÓN WiFi
// ========================

// ⚠️ Reemplaza estos datos por tu red REAL.
// Lo más fácil: hotspot de tu celular.
const char* ssid     = "S22 de Mario";       // <-- pon aquí el nombre de la red WiFi
const char* password = "vjgw3101";   // <-- pon aquí la contraseña

// IP de la LAPTOP donde corre el backend (no pongas 127.0.0.1)
const char* serverUrl = "http://10.180.213.104:3000/api/lecturas";
// Ejemplo: si tu laptop tiene IPv4 192.168.1.50 → "http://192.168.1.50:3000/api/lecturas"


// ------------------------------------------------------
// Seleccionar canal en el TCA9548A
// ------------------------------------------------------
void tcaSelect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
  delay(3);   // pequeña pausa para que quede estable
}

// ------------------------------------------------------
// Inicializar un sensor en un canal
// ------------------------------------------------------
bool initOnChannel(uint8_t ch, BH1750 &dev) {
  tcaSelect(ch);
  bool ok = dev.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
  delay(10);
  return ok;
}

// ------------------------------------------------------
// Leer un sensor en un canal
// ------------------------------------------------------
float readOnChannel(uint8_t ch, BH1750 &dev) {
  tcaSelect(ch);
  delay(10);                      // pequeño delay antes de leer
  float lux = dev.readLightLevel();
  return lux;
}

// ------------------------------------------------------
// Enviar POST con lux al backend
// Body: { "sensor_id": X, "lux": Y }
// ------------------------------------------------------
void enviarLectura(int sensorId, float lux) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi NO conectado, no se envía.");
    return;
  }

  if (isnan(lux)) {
    Serial.print("Lux inválido en sensor ");
    Serial.println(sensorId);
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Construimos JSON: {"sensor_id":X,"lux":Y}
  String cuerpo = "{";
  cuerpo += "\"sensor_id\":" + String(sensorId) + ",";
  cuerpo += "\"lux\":" + String(lux, 2);
  cuerpo += "}";

  int codigo = http.POST(cuerpo);
  Serial.print("POST sensor ");
  Serial.print(sensorId);
  Serial.print(" → HTTP ");
  Serial.println(codigo);

  if (codigo > 0) {
    String respuesta = http.getString();
    Serial.println("Respuesta: " + respuesta);
  } else {
    Serial.println("Error en POST");
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // I2C en ESP32: SDA = 21, SCL = 22
  Wire.begin(21, 22);

  // ========================
  // Conexión WiFi
  // ========================
  Serial.println("Conectando a WiFi...");
  WiFi.begin(ssid, password);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 40) { // ~20 seg
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi CONECTADO.");
    Serial.print("IP del ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nNO se pudo conectar a WiFi.");
  }

  // ========================
  // Inicializar sensores
  // ========================
  Serial.println("Inicializando sensores...");

  if (!initOnChannel(0, s0)) Serial.println("Fallo sensor CH0");
  if (!initOnChannel(1, s1)) Serial.println("Fallo sensor CH1");
  if (!initOnChannel(2, s2)) Serial.println("Fallo sensor CH2");
  if (!initOnChannel(3, s3)) Serial.println("Fallo sensor CH3");
  if (!initOnChannel(4, s4)) Serial.println("Fallo sensor CH4");
  if (!initOnChannel(5, s5)) Serial.println("Fallo sensor CH5");
  if (!initOnChannel(6, s6)) Serial.println("Fallo sensor CH6");

  // Canal 7 → sensor A (0x23)
  if (!initOnChannel(7, s7A)) Serial.println("Fallo sensor CH7-A (0x23)");

  // Canal 7 → sensor B (0x5C)
  if (!initOnChannel(7, s7B)) Serial.println("Fallo sensor CH7-B (0x5C)");

  Serial.println("Sensores listos.\n");
}

void loop() {

  // ========================
  // Leer todos los sensores
  // ========================
  float c0  = readOnChannel(0, s0);
  float c1  = readOnChannel(1, s1);
  float c2  = readOnChannel(2, s2);
  float c3  = readOnChannel(3, s3);
  float c4  = readOnChannel(4, s4);
  float c5  = readOnChannel(5, s5);
  float c6  = readOnChannel(6, s6);

  // Canal 7 → dos sensores
  float c7A = readOnChannel(7, s7A);
  float c7B = readOnChannel(7, s7B);

  // ========================
  // Mostrar por Serial
  // ========================
  Serial.println("Canal | Lux");
  Serial.println("----------------------");
  Serial.printf("CH0   | %.2f lx\n", c0);
  Serial.printf("CH1   | %.2f lx\n", c1);
  Serial.printf("CH2   | %.2f lx\n", c2);
  Serial.printf("CH3   | %.2f lx\n", c3);
  Serial.printf("CH4   | %.2f lx\n", c4);
  Serial.printf("CH5   | %.2f lx\n", c5);
  Serial.printf("CH6   | %.2f lx\n", c6);
  Serial.printf("CH7-A | %.2f lx (0x23)\n", c7A);
  Serial.printf("CH7-B | %.2f lx (0x5C)\n\n", c7B);

  // ========================
  // Enviar lecturas al servidor
  // ========================
  // IMPORTANTE: estos IDs deben existir en la tabla "sensores"
  enviarLectura(1, c0);   // Sensor CH0
  enviarLectura(2, c1);   // Sensor CH1
  enviarLectura(3, c2);   // Sensor CH2
  enviarLectura(4, c3);   // Sensor CH3
  enviarLectura(5, c4);   // Sensor CH4
  enviarLectura(6, c5);   // Sensor CH5
  enviarLectura(7, c6);   // Sensor CH6
  enviarLectura(8, c7A);  // Sensor CH7-A
  enviarLectura(9, c7B);  // Sensor CH7-B

  delay(1000); // Esperar 1 segundo
}
