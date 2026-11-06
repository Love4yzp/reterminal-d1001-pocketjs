/* LSM6DS3 register addresses and scale factors derive from Seeed's
 * bsp_lsm6ds3.c and lsm6ds3tr-c_reg.c at 5074d3b. */
#include "d1001_drivers.h"

#include <stddef.h>
#include <stdint.h>

#include "esp_check.h"

#define LSM6DS3_ADDRESS 0x6aU
#define LSM6DS3_WHO_AM_I 0x0fU
#define LSM6DS3_ID 0x6aU
#define LSM6DS3_CTRL1_XL 0x10U
#define LSM6DS3_CTRL2_G 0x11U
#define LSM6DS3_CTRL3_C 0x12U
#define LSM6DS3_OUT_TEMP_L 0x20U
#define LSM6DS3_I2C_TIMEOUT_MS 100

static esp_err_t read_registers(i2c_master_dev_handle_t device, uint8_t reg,
                                uint8_t *bytes, size_t length) {
  return i2c_master_transmit_receive(device, &reg, 1, bytes, length,
                                     LSM6DS3_I2C_TIMEOUT_MS);
}

static esp_err_t write_register(i2c_master_dev_handle_t device, uint8_t reg,
                                uint8_t value) {
  const uint8_t frame[] = {reg, value};
  return i2c_master_transmit(device, frame, sizeof frame,
                             LSM6DS3_I2C_TIMEOUT_MS);
}

static int16_t raw_word(const uint8_t *bytes) {
  return (int16_t)((uint16_t)bytes[0] | (uint16_t)bytes[1] << 8U);
}

esp_err_t d1001_imu_open(i2c_master_bus_handle_t bus,
                         i2c_master_dev_handle_t *out) {
  if (bus == NULL || out == NULL)
    return ESP_ERR_INVALID_ARG;
  *out = NULL;
  const i2c_device_config_t config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = LSM6DS3_ADDRESS,
      .scl_speed_hz = 400000,
  };
  esp_err_t result = i2c_master_bus_add_device(bus, &config, out);
  if (result != ESP_OK)
    return result;

  uint8_t id = 0;
  result = read_registers(*out, LSM6DS3_WHO_AM_I, &id, 1);
  if (result == ESP_OK && id != LSM6DS3_ID)
    result = ESP_ERR_NOT_FOUND;
  if (result == ESP_OK)
    result = write_register(*out, LSM6DS3_CTRL1_XL, 0x40U);
  if (result == ESP_OK)
    result = write_register(*out, LSM6DS3_CTRL2_G, 0x4cU);
  if (result == ESP_OK)
    result = write_register(*out, LSM6DS3_CTRL3_C, 0x44U);
  if (result != ESP_OK) {
    (void)d1001_imu_close(out);
    return result;
  }
  return ESP_OK;
}

esp_err_t d1001_imu_read(i2c_master_dev_handle_t device,
                         d1001_imu_sample *out) {
  if (device == NULL || out == NULL)
    return ESP_ERR_INVALID_ARG;
  uint8_t bytes[14];
  ESP_RETURN_ON_ERROR(read_registers(device, LSM6DS3_OUT_TEMP_L, bytes,
                                    sizeof bytes),
                      "lsm6ds3", "read samples");
  out->angular_rate.x = raw_word(bytes + 2) * 0.070f;
  out->angular_rate.y = raw_word(bytes + 4) * 0.070f;
  out->angular_rate.z = raw_word(bytes + 6) * 0.070f;
  out->acceleration.x = raw_word(bytes + 8) * 0.061f * 9.80665f / 1000.0f;
  out->acceleration.y = raw_word(bytes + 10) * 0.061f * 9.80665f / 1000.0f;
  out->acceleration.z = raw_word(bytes + 12) * 0.061f * 9.80665f / 1000.0f;
  out->chip_celsius = raw_word(bytes) / 256.0f + 25.0f;
  return ESP_OK;
}

esp_err_t d1001_imu_close(i2c_master_dev_handle_t *device) {
  if (device == NULL || *device == NULL)
    return ESP_OK;
  const esp_err_t result = i2c_master_bus_rm_device(*device);
  if (result == ESP_OK)
    *device = NULL;
  return result;
}
