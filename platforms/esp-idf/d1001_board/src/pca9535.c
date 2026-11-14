#include "pca9535.h"

#include "esp_check.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

#define PCA9535_OUTPUT_REG 0x02U
#define PCA9535_DIRECTION_REG 0x06U
#define PCA9535_DEFAULT_DIRECTION 0xfaffU
/* Preserve every existing output except the three camera control lines.
 * P13 (speaker amplifier) also stays low from the first output write. */
#define PCA9535_DEFAULT_OUTPUT \
  (0xf3ffU & ~(D1001_PCA9535_CAMERA_POWER | D1001_PCA9535_CAMERA_PWDN | \
               D1001_PCA9535_CAMERA_RESET))
#define PCA9535_TIMEOUT_MS 1000

static const char *TAG = "d1001_pca9535";
static i2c_master_dev_handle_t device;
static bool initialized;
static StaticSemaphore_t lock_storage;
static SemaphoreHandle_t lock;
static portMUX_TYPE lock_guard = portMUX_INITIALIZER_UNLOCKED;
static uint16_t direction = PCA9535_DEFAULT_DIRECTION;
static uint16_t output = PCA9535_DEFAULT_OUTPUT;

static esp_err_t write_register_locked(uint8_t reg, uint16_t value) {
  const uint8_t data[] = {reg, value & 0xffU, value >> 8};
  return i2c_master_transmit(device, data, sizeof data, PCA9535_TIMEOUT_MS);
}

static esp_err_t take_lock(void) {
  /* Static storage survives teardown, so waiters never see a deleted mutex. */
  portENTER_CRITICAL(&lock_guard);
  if (lock == NULL)
    lock = xSemaphoreCreateMutexStatic(&lock_storage);
  portEXIT_CRITICAL(&lock_guard);
  return xSemaphoreTake(lock, portMAX_DELAY) == pdTRUE
             ? ESP_OK
             : ESP_ERR_INVALID_STATE;
}

esp_err_t d1001_pca9535_init(i2c_master_bus_handle_t bus) {
  ESP_RETURN_ON_FALSE(bus != NULL, ESP_ERR_INVALID_ARG, TAG, "missing I2C bus");
  ESP_RETURN_ON_ERROR(take_lock(), TAG, "PCA9535 lock");
  if (device != NULL) {
    xSemaphoreGive(lock);
    return ESP_ERR_INVALID_STATE;
  }
  const i2c_device_config_t config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = 0x20,
      .scl_speed_hz = 400000,
  };
  esp_err_t err = i2c_master_bus_add_device(bus, &config, &device);
  if (err == ESP_OK) {
    /* Preload the latch before enabling any outputs. */
    err = write_register_locked(PCA9535_OUTPUT_REG, output);
    if (err == ESP_OK)
      err = write_register_locked(PCA9535_DIRECTION_REG, direction);
  }
  if (err != ESP_OK) {
    /* Board rollback removes the device even if its first write failed. */
    ESP_LOGE(TAG, "PCA9535 init failed: %s", esp_err_to_name(err));
  }
  initialized = err == ESP_OK;
  xSemaphoreGive(lock);
  return err;
}

esp_err_t d1001_pca9535_deinit(void) {
  ESP_RETURN_ON_ERROR(take_lock(), TAG, "PCA9535 lock");
  initialized = false;
  const esp_err_t err = device != NULL ? i2c_master_bus_rm_device(device) : ESP_OK;
  if (err == ESP_OK) {
    device = NULL;
    direction = PCA9535_DEFAULT_DIRECTION;
    output = PCA9535_DEFAULT_OUTPUT;
  }
  xSemaphoreGive(lock);
  return err;
}

esp_err_t d1001_pca9535_set_direction(uint16_t mask, bool is_output) {
  ESP_RETURN_ON_ERROR(take_lock(), TAG, "PCA9535 lock");
  if (!initialized) {
    xSemaphoreGive(lock);
    return ESP_ERR_INVALID_STATE;
  }
  const uint16_t next =
      is_output ? (uint16_t)(direction & ~mask) : (uint16_t)(direction | mask);
  const esp_err_t err = write_register_locked(PCA9535_DIRECTION_REG, next);
  if (err == ESP_OK)
    direction = next;
  xSemaphoreGive(lock);
  return err;
}

esp_err_t d1001_pca9535_set_level(uint16_t mask, bool high) {
  ESP_RETURN_ON_ERROR(take_lock(), TAG, "PCA9535 lock");
  if (!initialized) {
    xSemaphoreGive(lock);
    return ESP_ERR_INVALID_STATE;
  }
  const uint16_t next =
      high ? (uint16_t)(output | mask) : (uint16_t)(output & ~mask);
  const esp_err_t err = write_register_locked(PCA9535_OUTPUT_REG, next);
  if (err == ESP_OK)
    output = next;
  xSemaphoreGive(lock);
  return err;
}
