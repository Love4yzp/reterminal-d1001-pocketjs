#include "pca9535.h"

#include "esp_check.h"

#define PCA9535_OUTPUT_REG 0x02U
#define PCA9535_DIRECTION_REG 0x06U
#define PCA9535_DEFAULT_DIRECTION 0xfaffU
#define PCA9535_DEFAULT_OUTPUT 0xfbffU
#define PCA9535_TIMEOUT_MS 1000

static const char *TAG = "d1001_pca9535";
static i2c_master_dev_handle_t device;
static uint16_t direction = PCA9535_DEFAULT_DIRECTION;
static uint16_t output = PCA9535_DEFAULT_OUTPUT;

static esp_err_t write_register(uint8_t reg, uint16_t value) {
  uint8_t data[] = {reg, value & 0xffU, value >> 8};
  return i2c_master_transmit(device, data, sizeof(data), PCA9535_TIMEOUT_MS);
}

esp_err_t d1001_pca9535_init(i2c_master_bus_handle_t bus) {
  ESP_RETURN_ON_FALSE(bus != NULL, ESP_ERR_INVALID_ARG, TAG, "missing I2C bus");
  const i2c_device_config_t config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = 0x20,
      .scl_speed_hz = 400000,
  };
  ESP_RETURN_ON_ERROR(i2c_master_bus_add_device(bus, &config, &device), TAG,
                      "add PCA9535");
  ESP_RETURN_ON_ERROR(write_register(PCA9535_DIRECTION_REG, direction), TAG,
                      "set default directions");
  ESP_RETURN_ON_ERROR(write_register(PCA9535_OUTPUT_REG, output), TAG,
                      "set default outputs");
  return ESP_OK;
}

esp_err_t d1001_pca9535_set_direction(uint16_t mask, bool is_output) {
  const uint16_t next =
      is_output ? (uint16_t)(direction & ~mask) : (uint16_t)(direction | mask);
  ESP_RETURN_ON_ERROR(write_register(PCA9535_DIRECTION_REG, next), TAG,
                      "set directions");
  direction = next;
  return ESP_OK;
}

esp_err_t d1001_pca9535_set_level(uint16_t mask, bool high) {
  const uint16_t next =
      high ? (uint16_t)(output | mask) : (uint16_t)(output & ~mask);
  ESP_RETURN_ON_ERROR(write_register(PCA9535_OUTPUT_REG, next), TAG,
                      "set outputs");
  output = next;
  return ESP_OK;
}
