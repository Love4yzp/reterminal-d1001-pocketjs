/* PCF8563 addresses, register layout and BCD conversion follow Seeed's
 * bsp_pcf8563.c and bsp_pcf8563.h at 5074d3b. The RTC stores UTC. */
#include "d1001_drivers.h"

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "esp_bit_defs.h"
#include "esp_check.h"

#define PCF8563_ADDRESS 0x51U
#define PCF8563_CONTROL1 0x00U
#define PCF8563_SECONDS 0x02U
#define PCF8563_STOP BIT(5)
#define PCF8563_VL BIT(7)
#define PCF8563_I2C_TIMEOUT_MS 100

static esp_err_t read_registers(i2c_master_dev_handle_t device, uint8_t reg,
                                uint8_t *bytes, size_t length) {
  return i2c_master_transmit_receive(device, &reg, 1, bytes, length,
                                     PCF8563_I2C_TIMEOUT_MS);
}

static esp_err_t write_registers(i2c_master_dev_handle_t device, uint8_t reg,
                                 const uint8_t *bytes, size_t length) {
  uint8_t frame[8];
  if (length == 0U || length > sizeof frame - 1U)
    return ESP_ERR_INVALID_SIZE;
  frame[0] = reg;
  memcpy(frame + 1U, bytes, length);
  return i2c_master_transmit(device, frame, length + 1U,
                             PCF8563_I2C_TIMEOUT_MS);
}

static uint8_t from_bcd(uint8_t value) {
  return (uint8_t)(value >> 4U) * 10U + (value & 0x0fU);
}

static uint8_t to_bcd(uint8_t value) {
  return (uint8_t)(value / 10U << 4U) | (value % 10U);
}

esp_err_t d1001_rtc_open(i2c_master_bus_handle_t bus,
                         i2c_master_dev_handle_t *out) {
  if (bus == NULL || out == NULL)
    return ESP_ERR_INVALID_ARG;
  *out = NULL;
  const i2c_device_config_t config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = PCF8563_ADDRESS,
      .scl_speed_hz = 400000,
  };
  esp_err_t result = i2c_master_bus_add_device(bus, &config, out);
  if (result != ESP_OK)
    return result;

  uint8_t control = 0;
  result = read_registers(*out, PCF8563_CONTROL1, &control, 1);
  if (result == ESP_OK && (control & PCF8563_STOP) != 0U) {
    control &= (uint8_t)~PCF8563_STOP;
    result = write_registers(*out, PCF8563_CONTROL1, &control, 1);
  }
  if (result != ESP_OK) {
    (void)d1001_rtc_close(out);
    return result;
  }
  return ESP_OK;
}

esp_err_t d1001_rtc_read(i2c_master_dev_handle_t device, time_t *out) {
  if (device == NULL || out == NULL)
    return ESP_ERR_INVALID_ARG;
  uint8_t bytes[7];
  ESP_RETURN_ON_ERROR(read_registers(device, PCF8563_SECONDS, bytes,
                                    sizeof bytes),
                      "pcf8563", "read time");
  if ((bytes[0] & PCF8563_VL) != 0U)
    return ESP_ERR_INVALID_STATE;

  struct tm utc = {
      .tm_sec = from_bcd(bytes[0] & 0x7fU),
      .tm_min = from_bcd(bytes[1] & 0x7fU),
      .tm_hour = from_bcd(bytes[2] & 0x3fU),
      .tm_mday = from_bcd(bytes[3] & 0x3fU),
      .tm_wday = from_bcd(bytes[4] & 0x07U),
      .tm_mon = from_bcd(bytes[5] & 0x1fU) - 1,
      .tm_year = from_bcd(bytes[6]) + 100,
  };
  if (utc.tm_sec > 59 || utc.tm_min > 59 || utc.tm_hour > 23 ||
      utc.tm_mday < 1 || utc.tm_mday > 31 || utc.tm_mon < 0 ||
      utc.tm_mon > 11 || utc.tm_wday > 6)
    return ESP_ERR_INVALID_RESPONSE;
  *out = timegm(&utc);
  return *out < 0 ? ESP_ERR_INVALID_RESPONSE : ESP_OK;
}

esp_err_t d1001_rtc_write(i2c_master_dev_handle_t device, time_t epoch) {
  if (device == NULL)
    return ESP_ERR_INVALID_ARG;
  struct tm utc;
  if (gmtime_r(&epoch, &utc) == NULL || utc.tm_year < 100 ||
      utc.tm_year > 199)
    return ESP_ERR_INVALID_ARG;
  const uint8_t bytes[] = {
      to_bcd(utc.tm_sec),
      to_bcd(utc.tm_min),
      to_bcd(utc.tm_hour),
      to_bcd(utc.tm_mday),
      to_bcd(utc.tm_wday),
      to_bcd(utc.tm_mon + 1),
      to_bcd(utc.tm_year - 100),
  };
  return write_registers(device, PCF8563_SECONDS, bytes, sizeof bytes);
}

esp_err_t d1001_rtc_close(i2c_master_dev_handle_t *device) {
  if (device == NULL || *device == NULL)
    return ESP_OK;
  const esp_err_t result = i2c_master_bus_rm_device(*device);
  if (result == ESP_OK)
    *device = NULL;
  return result;
}
