#pragma once

#include "d1001_imu_types.h"

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_IMU_I2C_ADDRESS 0x6aU
#define D1001_IMU_INT1_GPIO 19
#define D1001_IMU_INT2_GPIO (-1)

/**
 * ISR-safe notification callback; it must not call any I2C or sensor API.
 * If the shared GPIO service uses ESP_INTR_FLAG_IRAM, the callback and its
 * entire call chain must be in IRAM; callback_arg and all data accessed by
 * that chain must be in internal RAM (not PSRAM or flash).
 */
typedef void (*d1001_imu_isr_callback)(void *arg);

typedef struct {
  i2c_master_dev_handle_t device;
  d1001_imu_config config;
  int int1_gpio;
  bool int1_registered;
  d1001_imu_isr_callback int1_callback;
  void *int1_callback_arg;
} d1001_imu;

/**
 * Open the sensor on the board's existing system I2C bus. A NULL config selects
 * 104 Hz, +/-2 g and +/-2000 deg/s. The caller owns the context storage.
 */
esp_err_t d1001_imu_open(i2c_master_bus_handle_t system_i2c,
                         const d1001_imu_config *config, d1001_imu *out);

esp_err_t d1001_imu_close(d1001_imu *imu);

/** 1.6 Hz selects low-power mode; other ODRs select high-performance mode. */
esp_err_t d1001_imu_set_accel_config(d1001_imu *imu, d1001_imu_odr odr,
                                     d1001_imu_accel_range range);

esp_err_t d1001_imu_set_gyro_config(d1001_imu *imu, d1001_imu_odr odr,
                                    d1001_imu_gyro_range range);

/** Read one temperature, gyroscope and accelerometer sample. */
esp_err_t d1001_imu_read_sample(d1001_imu *imu, d1001_imu_sample *out);

/**
 * Configure tap detection. Threshold is 0..31 (1 LSB = FS_XL / 32); shock and
 * quiet are 0..3; duration is 0..15. Timing fields use the units in INT_DUR2.
 * Latched controls the shared basic-interrupt LIR bit.
 */
esp_err_t d1001_imu_set_tap_config(d1001_imu *imu,
                                   const d1001_imu_tap_config *config);

/** Configure wake-up threshold (0..63, 1 LSB = FS_XL / 64) and duration (0..3). */
esp_err_t d1001_imu_set_wakeup_config(d1001_imu *imu,
                                      const d1001_imu_wakeup_config *config);

/** Read and decode the event source; reading also clears a latched request. */
esp_err_t d1001_imu_read_tap_source(d1001_imu *imu,
                                    d1001_imu_tap_source *out);

esp_err_t d1001_imu_read_wakeup_source(d1001_imu *imu,
                                       d1001_imu_wakeup_source *out);

/** Read raw D6D_SRC flags; reading also clears a latched 6D request. */
esp_err_t d1001_imu_read_d6d_source(d1001_imu *imu, uint8_t *out);

/**
 * Route selected embedded events to INT1 through MD1_CFG. Any nonempty route
 * enables TAP_CFG.INTERRUPTS_ENABLE, preserving LIR and all other fields.
 * An empty route clears MD1_CFG but leaves TAP_CFG unchanged.
 */
esp_err_t d1001_imu_set_int1_route(d1001_imu *imu,
                                   const d1001_imu_int1_route *route);

/**
 * Register an active-low, falling-edge INT1 notification. Use
 * D1001_IMU_INT1_GPIO for the board default; -1 unregisters the callback.
 * This changes only GPIO state, not MD1_CFG or event-detection registers.
 * The imu context must remain in internal RAM until unregister/close finishes;
 * registration rejects an external-RAM context with ESP_ERR_INVALID_ARG.
 * For an IRAM shared service, callback/callback_arg must meet the callback
 * contract above. The driver does not validate the callback's call chain.
 */
esp_err_t d1001_imu_register_int1(d1001_imu *imu, int int1_gpio,
                                  d1001_imu_isr_callback callback,
                                  void *callback_arg);

esp_err_t d1001_imu_unregister_int1(d1001_imu *imu);

#ifdef __cplusplus
}
#endif
