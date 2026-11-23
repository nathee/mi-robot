/*
 * ESP32 + RS485 Controller for Virtual Mi Robot Simulator
 * -------------------------------------------------------
 * Hardware Wiring:
 *   ESP32 GPIO17 (TX2) --> RS485 Module DI / TXD
 *   ESP32 GPIO16 (RX2) --> RS485 Module RO / RXD
 *   ESP32 GPIO4        --> RS485 Module DE + RE (set RS485_DE_PIN = -1 if using XY-485 auto-direction)
 *   RS485 A            --> USB-RS485 A (D+)
 *   RS485 B            --> USB-RS485 B (D-)
 *   GND                --> USB-RS485 GND
 *
 * Web Simulator Settings:
 *   Open "RS485" in header -> USB-RS485 Serial -> Baud: 115200 -> RS485 Addr: 01 -> Connect
 */

#include <Arduino.h>

#define RS485_RX_PIN   16
#define RS485_TX_PIN   17
#define RS485_DE_PIN   4     // Set to -1 if using XY-485 auto-direction RS485 module
#define RS485_BAUD     115200
#define ROBOT_ADDR     "01"

HardwareSerial RS485(2);

void rs485SendLine(const String &cmd) {
  if (RS485_DE_PIN >= 0) {
    digitalWrite(RS485_DE_PIN, HIGH); // Transmit mode
    delayMicroseconds(100);
  }
  RS485.print(cmd);
  RS485.print("\r\n");
  RS485.flush();
  if (RS485_DE_PIN >= 0) {
    delayMicroseconds(100);
    digitalWrite(RS485_DE_PIN, LOW);  // Receive mode
  }
  Serial.println("[TX RS485] " + cmd);
}

void readRs485Reply(unsigned long waitMs = 300) {
  unsigned long start = millis();
  while (millis() - start < waitMs) {
    if (RS485.available()) {
      String reply = RS485.readStringUntil('\n');
      reply.trim();
      if (reply.length() > 0) {
        Serial.println("[RX Virtual Robot] " + reply);
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  if (RS485_DE_PIN >= 0) {
    pinMode(RS485_DE_PIN, OUTPUT);
    digitalWrite(RS485_DE_PIN, LOW);
  }
  RS485.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  delay(1000);
  Serial.println("ESP32 RS485 Virtual Mirobot Controller Ready!");
}

void loop() {
  // 1. Go Home (WLKATA RS485 addressed G-code)
  rs485SendLine(String("@") + ROBOT_ADDR + " M21 G90 X0 Y0 Z0 A0 B0 C0 F3000");
  readRs485Reply(1800);

  // 2. Open Gripper
  rs485SendLine(String("@") + ROBOT_ADDR + " M5");
  readRs485Reply(400);

  // 3. Move to Pick pose
  rs485SendLine(String("@") + ROBOT_ADDR + " M21 G90 X-35 Y22 Z-28 A0 B-15 C0 F3000");
  readRs485Reply(1800);

  // 4. Close Gripper
  rs485SendLine(String("@") + ROBOT_ADDR + " M3 S1000");
  readRs485Reply(600);

  // 5. Move to Place pose (JSON format is also supported!)
  rs485SendLine("@01 {\"j\":[45, 26, -32, 0, -12, -20], \"grip\":1}");
  readRs485Reply(2200);

  // 6. Release & Query Virtual Robot Status
  rs485SendLine(String("@") + ROBOT_ADDR + " M5");
  readRs485Reply(500);

  rs485SendLine(String("@") + ROBOT_ADDR + " ?");
  readRs485Reply(600);
}
