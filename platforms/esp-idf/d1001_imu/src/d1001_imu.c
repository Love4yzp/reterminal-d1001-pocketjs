#include "d1001_imu.h"

#include <stddef.h>
#include <stdint.h>

#include "d1001_imu_core.h"
#include "driver/gpio.h"

#define LSM6DS3_WHO_AM_I 0x0fU
#define LSM6DS3_ID 0x6aU
#define LSM6DS3_CTRL1_XL 0x10U
#define LSM6DS3_CTRL2_G 0x11U
#define LSM6DS3_CTRL3_C 0x12U
#define LSM6DS3_CTRL6_C 0x15U
#define LSM6DS3_WAKE_UP_SRC 0x1bU
#define LSM6DS3_TAP_SRC 0x1cU
#define LSM6DS3_D6D_SRC 0x1dU
#define LSM6DS3_OUT_TEMP_L 0x20U
#define LSM6DS3_TAP_CFG 0x58U
#define LSM6DS3_TAP_THS_6D 0x59U
#define LSM6DS3_INT_DUR2 0x5aU
#define LSM6DS3_WAKE_UP_THS 0x5bU
#define LSM6DS3_WAKE_UP_DUR 0x5cU
#define LSM6DS3_MD1_CFG 0x5eU
#define LSM6DS3_BASIC_INT_ENABLE 0x80U
#define LSM6DS3_I2C_TIMEOUT_MS 100

static esp_err_t read_registers(i2c_master_dev_handle_t device, uint8_t reg,
                                uint8_t *bytes, size_t length) {
  return i2c_master_transmit_receive(device, &reg, 1, bytes, length,
                                     LSM6DS3_I2C_TIMEOUT_MS);
}

static esp_err_t read_register(i2c_master_dev_handle_t device, uint8_t reg,
                               uint8_t *value) {
  return read_registers(device, reg, value, 1);
}

static esp_err_t write_register(i2c_master_dev_handle_t device, uint8_t reg,
                                uint8_t value) {
  const uint8_t frame[] = {reg, value};
  return i2c_master_transmit(device, frame, sizeof frame,
                             LSM6DS3_I2C_TIMEOUT_MS);
}

static esp_err_t update_register(i2c_master_dev_handle_t device, uint8_t reg,
                                 uint8_t mask, uint8_t value) {
  uint8_t current = 0;
  esp_err_t result = read_register(device, reg, &current);
  if (result != ESP_OK)
    return result;
  return write_register(device, reg,
                        (uint8_t)((current & (uint8_t)~mask) | (value & mask)));
}

static esp_err_t ready(d1001_imu *imu) {
  if (imu == NULL)
    return ESP_ERR_INVALID_ARG;
  return imu->device != NULL ? ESP_OK : ESP_ERR_INVALID_STATE;
}

esp_err_t d1001_imu_open(i2c_master_bus_handle_t system_i2c,
                         const d1001_imu_config *config, d1001_imu *out) {
  if (system_i2c == NULL || out == NULL)
    return ESP_ERR_INVALID_ARG;
  const d1001_imu_config initial =
      config != NULL
          ? *config
          : (d1001_imu_config){
                .accel_odr = D1001_IMU_ODR_104_HZ,
                .gyro_odr = D1001_IMU_ODR_104_HZ,
                .accel_range = D1001_IMU_ACCEL_2G,
                .gyro_range = D1001_IMU_GYRO_2000_DPS,
            };
  uint8_t encoded = 0;
  if (!d1001_imu_core_encode_accel(initial.accel_odr, initial.accel_range, 0,
                                   &encoded) ||
      !d1001_imu_core_encode_gyro(initial.gyro_odr, initial.gyro_range, 0,
                                  &encoded))
    return ESP_ERR_INVALID_ARG;

  *out = (d1001_imu){0};
  const i2c_device_config_t device_config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = D1001_IMU_I2C_ADDRESS,
      .scl_speed_hz = 400000,
  };
  esp_err_t result =
      i2c_master_bus_add_device(system_i2c, &device_config, &out->device);
  if (result != ESP_OK)
    return result;

  uint8_t id = 0;
  result = read_register(out->device, LSM6DS3_WHO_AM_I, &id);
  if (result == ESP_OK && id != LSM6DS3_ID)
    result = ESP_ERR_NOT_FOUND;
  uint8_t ctrl3 = 0;
  if (result == ESP_OK)
    result = read_register(out->device, LSM6DS3_CTRL3_C, &ctrl3);
  if (result == ESP_OK &&
      !d1001_imu_core_encode_ctrl3(true, false, ctrl3, &ctrl3))
    result = ESP_ERR_INVALID_ARG;
  if (result == ESP_OK)
    result = write_register(out->device, LSM6DS3_CTRL3_C, ctrl3);
  if (result == ESP_OK)
    result = d1001_imu_set_accel_config(out, initial.accel_odr,
                                        initial.accel_range);
  if (result == ESP_OK)
    result = d1001_imu_set_gyro_config(out, initial.gyro_odr,
                                       initial.gyro_range);
  if (result != ESP_OK) {
    (void)d1001_imu_close(out);
    return result;
  }
  return ESP_OK;
}

esp_err_t d1001_imu_close(d1001_imu *imu) {
  if (imu == NULL)
    return ESP_ERR_INVALID_ARG;
  esp_err_t result = d1001_imu_unregister_int1(imu);
  if (result != ESP_OK)
    return result;
  if (imu->device != NULL) {
    result = i2c_master_bus_rm_device(imu->device);
    if (result != ESP_OK)
      return result;
  }
  *imu = (d1001_imu){0};
  return ESP_OK;
}

esp_err_t d1001_imu_set_accel_config(d1001_imu *imu, d1001_imu_odr odr,
                                     d1001_imu_accel_range range) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  uint8_t value = 0;
  if (!d1001_imu_core_encode_accel(odr, range, 0, &value))
    return ESP_ERR_INVALID_ARG;

  uint8_t current = 0;
  uint8_t mode = 0;
  esp_err_t result = read_register(imu->device, LSM6DS3_CTRL1_XL, &current);
  if (result == ESP_OK)
    result = read_register(imu->device, LSM6DS3_CTRL6_C, &mode);
  if (result != ESP_OK)
    return result;
  if (!d1001_imu_core_encode_accel(odr, range, current, &value) ||
      !d1001_imu_core_encode_accel_mode(odr, mode, &mode))
    return ESP_ERR_INVALID_ARG;

  result = write_register(imu->device, LSM6DS3_CTRL6_C, mode);
  if (result == ESP_OK)
    result = write_register(imu->device, LSM6DS3_CTRL1_XL, value);
  if (result == ESP_OK) {
    imu->config.accel_odr = odr;
    imu->config.accel_range = range;
  }
  return result;
}

esp_err_t d1001_imu_set_gyro_config(d1001_imu *imu, d1001_imu_odr odr,
                                    d1001_imu_gyro_range range) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  uint8_t current = 0;
  esp_err_t result = read_register(imu->device, LSM6DS3_CTRL2_G, &current);
  if (result != ESP_OK)
    return result;
  uint8_t value = 0;
  if (!d1001_imu_core_encode_gyro(odr, range, current, &value))
    return ESP_ERR_INVALID_ARG;
  result = write_register(imu->device, LSM6DS3_CTRL2_G, value);
  if (result == ESP_OK) {
    imu->config.gyro_odr = odr;
    imu->config.gyro_range = range;
  }
  return result;
}

esp_err_t d1001_imu_read_sample(d1001_imu *imu, d1001_imu_sample *out) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  if (out == NULL)
    return ESP_ERR_INVALID_ARG;
  uint8_t bytes[14];
  const esp_err_t result = read_registers(imu->device, LSM6DS3_OUT_TEMP_L,
                                          bytes, sizeof bytes);
  if (result != ESP_OK)
    return result;
  d1001_imu_core_decode_sample(bytes, imu->config.accel_range,
                               imu->config.gyro_range, out);
  return ESP_OK;
}

esp_err_t d1001_imu_set_tap_config(d1001_imu *imu,
                                   const d1001_imu_tap_config *config) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  uint8_t duration = 0;
  if (!d1001_imu_core_encode_tap_duration(config, &duration))
    return ESP_ERR_INVALID_ARG;

  uint8_t tap_cfg = 0;
  uint8_t tap_threshold = 0;
  uint8_t tap_mode = 0;
  esp_err_t result = read_register(imu->device, LSM6DS3_TAP_CFG, &tap_cfg);
  if (result == ESP_OK)
    result = read_register(imu->device, LSM6DS3_TAP_THS_6D, &tap_threshold);
  if (result == ESP_OK)
    result = read_register(imu->device, LSM6DS3_WAKE_UP_THS, &tap_mode);
  if (result != ESP_OK)
    return result;
  if (!d1001_imu_core_encode_tap_cfg(config, tap_cfg, &tap_cfg) ||
      !d1001_imu_core_encode_tap_threshold(config, tap_threshold,
                                           &tap_threshold) ||
      !d1001_imu_core_encode_tap_mode(config, tap_mode, &tap_mode))
    return ESP_ERR_INVALID_ARG;

  result = write_register(imu->device, LSM6DS3_TAP_THS_6D, tap_threshold);
  if (result == ESP_OK)
    result = write_register(imu->device, LSM6DS3_INT_DUR2, duration);
  if (result == ESP_OK)
    result = write_register(imu->device, LSM6DS3_WAKE_UP_THS, tap_mode);
  if (result == ESP_OK)
    result = write_register(imu->device, LSM6DS3_TAP_CFG, tap_cfg);
  return result;
}

esp_err_t d1001_imu_set_wakeup_config(d1001_imu *imu,
                                      const d1001_imu_wakeup_config *config) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  uint8_t threshold = 0;
  uint8_t duration = 0;
  if (!d1001_imu_core_encode_wakeup_threshold(config, 0, &threshold) ||
      !d1001_imu_core_encode_wakeup_duration(config, 0, &duration))
    return ESP_ERR_INVALID_ARG;
  esp_err_t result = read_register(imu->device, LSM6DS3_WAKE_UP_THS,
                                   &threshold);
  if (result == ESP_OK)
    result = read_register(imu->device, LSM6DS3_WAKE_UP_DUR, &duration);
  if (result != ESP_OK)
    return result;
  if (!d1001_imu_core_encode_wakeup_threshold(config, threshold, &threshold) ||
      !d1001_imu_core_encode_wakeup_duration(config, duration, &duration))
    return ESP_ERR_INVALID_ARG;

  result = write_register(imu->device, LSM6DS3_WAKE_UP_THS, threshold);
  if (result == ESP_OK)
    result = write_register(imu->device, LSM6DS3_WAKE_UP_DUR, duration);
  if (result == ESP_OK)
    result = update_register(imu->device, LSM6DS3_TAP_CFG,
                             LSM6DS3_BASIC_INT_ENABLE,
                             LSM6DS3_BASIC_INT_ENABLE);
  return result;
}

esp_err_t d1001_imu_read_tap_source(d1001_imu *imu,
                                    d1001_imu_tap_source *out) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  if (out == NULL)
    return ESP_ERR_INVALID_ARG;
  uint8_t value = 0;
  const esp_err_t result =
      read_register(imu->device, LSM6DS3_TAP_SRC, &value);
  if (result == ESP_OK)
    d1001_imu_core_decode_tap_source(value, out);
  return result;
}

esp_err_t d1001_imu_read_wakeup_source(d1001_imu *imu,
                                       d1001_imu_wakeup_source *out) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  if (out == NULL)
    return ESP_ERR_INVALID_ARG;
  uint8_t value = 0;
  const esp_err_t result =
      read_register(imu->device, LSM6DS3_WAKE_UP_SRC, &value);
  if (result == ESP_OK)
    d1001_imu_core_decode_wakeup_source(value, out);
  return result;
}

esp_err_t d1001_imu_read_d6d_source(d1001_imu *imu, uint8_t *out) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  if (out == NULL)
    return ESP_ERR_INVALID_ARG;
  return read_register(imu->device, LSM6DS3_D6D_SRC, out);
}

esp_err_t d1001_imu_set_int1_route(d1001_imu *imu,
                                   const d1001_imu_int1_route *route) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  uint8_t value = 0;
  if (!d1001_imu_core_encode_int1_route(route, &value))
    return ESP_ERR_INVALID_ARG;
  return write_register(imu->device, LSM6DS3_MD1_CFG, value);
}

static void handle_int1_isr(void *arg) {
  d1001_imu *imu = arg;
  if (imu->int1_callback != NULL)
    imu->int1_callback(imu->int1_callback_arg);
}

esp_err_t d1001_imu_register_int1(d1001_imu *imu, int int1_gpio,
                                  d1001_imu_isr_callback callback,
                                  void *callback_arg) {
  const esp_err_t state = ready(imu);
  if (state != ESP_OK)
    return state;
  if (int1_gpio == -1)
    return d1001_imu_unregister_int1(imu);
  if (callback == NULL || !GPIO_IS_VALID_GPIO(int1_gpio))
    return ESP_ERR_INVALID_ARG;
  if (imu->int1_registered)
    return ESP_ERR_INVALID_STATE;

  esp_err_t result = gpio_install_isr_service(0);
  if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
    return result;
  const gpio_config_t config = {
      .pin_bit_mask = 1ULL << (uint8_t)int1_gpio,
      .mode = GPIO_MODE_INPUT,
      .pull_up_en = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type = GPIO_INTR_DISABLE,
  };
  result = gpio_config(&config);
  if (result != ESP_OK)
    return result;

  imu->int1_callback = callback;
  imu->int1_callback_arg = callback_arg;
  result = gpio_isr_handler_add((gpio_num_t)int1_gpio, handle_int1_isr, imu);
  if (result != ESP_OK) {
    imu->int1_callback = NULL;
    imu->int1_callback_arg = NULL;
    (void)gpio_reset_pin((gpio_num_t)int1_gpio);
    return result;
  }
  imu->int1_gpio = int1_gpio;
  imu->int1_registered = true;

  result = gpio_set_intr_type((gpio_num_t)int1_gpio, GPIO_INTR_NEGEDGE);
  if (result == ESP_OK)
    result = gpio_intr_enable((gpio_num_t)int1_gpio);
  if (result != ESP_OK) {
    (void)d1001_imu_unregister_int1(imu);
    return result;
  }
  return ESP_OK;
}

esp_err_t d1001_imu_unregister_int1(d1001_imu *imu) {
  if (imu == NULL)
    return ESP_ERR_INVALID_ARG;
  if (!imu->int1_registered)
    return ESP_OK;

  const gpio_num_t gpio = (gpio_num_t)imu->int1_gpio;
  const esp_err_t result = gpio_isr_handler_remove(gpio);
  if (result != ESP_OK)
    return result;
  imu->int1_gpio = -1;
  imu->int1_registered = false;
  imu->int1_callback = NULL;
  imu->int1_callback_arg = NULL;
  return gpio_reset_pin(gpio);
}
