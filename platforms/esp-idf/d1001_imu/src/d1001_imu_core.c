#include "d1001_imu_core.h"

#include <stddef.h>

#define D1001_IMU_GRAVITY_MPS2 9.80665f

static int16_t raw_word(const uint8_t *bytes) {
  return (int16_t)((uint16_t)bytes[0] | (uint16_t)bytes[1] << 8U);
}

static bool valid_odr(d1001_imu_odr odr) {
  return odr >= D1001_IMU_ODR_POWER_DOWN && odr <= D1001_IMU_ODR_1_6_HZ;
}

static float accel_scale(d1001_imu_accel_range range) {
  switch (range) {
    case D1001_IMU_ACCEL_2G:
      return 0.061f * D1001_IMU_GRAVITY_MPS2 / 1000.0f;
    case D1001_IMU_ACCEL_4G:
      return 0.122f * D1001_IMU_GRAVITY_MPS2 / 1000.0f;
    case D1001_IMU_ACCEL_8G:
      return 0.244f * D1001_IMU_GRAVITY_MPS2 / 1000.0f;
    case D1001_IMU_ACCEL_16G:
      return 0.488f * D1001_IMU_GRAVITY_MPS2 / 1000.0f;
    default:
      return 0.0f;
  }
}

static float gyro_scale(d1001_imu_gyro_range range) {
  switch (range) {
    case D1001_IMU_GYRO_125_DPS:
      return 4.375f / 1000.0f;
    case D1001_IMU_GYRO_250_DPS:
      return 8.75f / 1000.0f;
    case D1001_IMU_GYRO_500_DPS:
      return 17.5f / 1000.0f;
    case D1001_IMU_GYRO_1000_DPS:
      return 35.0f / 1000.0f;
    case D1001_IMU_GYRO_2000_DPS:
      return 70.0f / 1000.0f;
    default:
      return 0.0f;
  }
}

bool d1001_imu_core_encode_accel(d1001_imu_odr odr,
                                 d1001_imu_accel_range range,
                                 uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_odr(odr) || accel_scale(range) == 0.0f)
    return false;
  *out = (uint8_t)((current & 0x03U) | (uint8_t)range << 2U |
                   (uint8_t)odr << 4U);
  return true;
}

bool d1001_imu_core_encode_accel_mode(d1001_imu_odr odr, uint8_t current,
                                      uint8_t *out) {
  if (out == NULL || !valid_odr(odr))
    return false;
  *out = (uint8_t)((current & 0xefU) |
                   (odr == D1001_IMU_ODR_1_6_HZ ? 0x10U : 0U));
  return true;
}

bool d1001_imu_core_encode_gyro(d1001_imu_odr odr, d1001_imu_gyro_range range,
                                uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_odr(odr) || odr == D1001_IMU_ODR_1_6_HZ ||
      gyro_scale(range) == 0.0f)
    return false;
  *out = (uint8_t)((current & 0x01U) | (uint8_t)range << 1U |
                   (uint8_t)odr << 4U);
  return true;
}

bool d1001_imu_core_encode_ctrl3(bool active_low, bool open_drain,
                                 uint8_t current, uint8_t *out) {
  if (out == NULL)
    return false;
  /* BLE must stay clear: sample decoding uses LSB at the lower address. */
  *out = (uint8_t)((current & 0x89U) | 0x44U | (active_low ? 0x20U : 0U) |
                   (open_drain ? 0x10U : 0U));
  return true;
}

bool d1001_imu_core_encode_int1_route(const d1001_imu_int1_route *route,
                                      uint8_t *out) {
  if (route == NULL || out == NULL)
    return false;
  *out = (uint8_t)((route->single_tap ? 0x40U : 0U) |
                   (route->wakeup ? 0x20U : 0U) |
                   (route->free_fall ? 0x10U : 0U) |
                   (route->double_tap ? 0x08U : 0U) |
                   (route->orientation_6d ? 0x04U : 0U));
  return true;
}

bool d1001_imu_core_encode_int1_tap_cfg(const d1001_imu_int1_route *route,
                                      uint8_t current, uint8_t *out) {
  uint8_t routed = 0;
  if (out == NULL || !d1001_imu_core_encode_int1_route(route, &routed))
    return false;
  /* Never disable the shared gate when removing this pin's routes. */
  *out = (uint8_t)(current | (routed != 0U ? 0x80U : 0U));
  return true;
}

void d1001_imu_core_decode_sample(const uint8_t bytes[14],
                                  d1001_imu_accel_range accel_range,
                                  d1001_imu_gyro_range gyro_range,
                                  d1001_imu_sample *out) {
  const float accel_lsb = accel_scale(accel_range);
  const float gyro_lsb = gyro_scale(gyro_range);
  out->temperature_c = raw_word(bytes) / 256.0f + 25.0f;
  out->angular_rate_dps.x = raw_word(bytes + 2) * gyro_lsb;
  out->angular_rate_dps.y = raw_word(bytes + 4) * gyro_lsb;
  out->angular_rate_dps.z = raw_word(bytes + 6) * gyro_lsb;
  out->acceleration_mps2.x = raw_word(bytes + 8) * accel_lsb;
  out->acceleration_mps2.y = raw_word(bytes + 10) * accel_lsb;
  out->acceleration_mps2.z = raw_word(bytes + 12) * accel_lsb;
}

static bool valid_tap_config(const d1001_imu_tap_config *config) {
  return config != NULL && config->threshold <= 31U && config->shock <= 3U &&
         config->quiet <= 3U && config->duration <= 15U;
}

bool d1001_imu_core_encode_tap_cfg(const d1001_imu_tap_config *config,
                                   uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_tap_config(config))
    return false;
  *out = (uint8_t)((current & 0x70U) | 0x80U |
                   (config->latched ? 0x01U : 0U) |
                   (config->x_enabled ? 0x08U : 0U) |
                   (config->y_enabled ? 0x04U : 0U) |
                   (config->z_enabled ? 0x02U : 0U));
  return true;
}

bool d1001_imu_core_encode_tap_threshold(
    const d1001_imu_tap_config *config, uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_tap_config(config))
    return false;
  *out = (uint8_t)((current & 0xe0U) | config->threshold);
  return true;
}

bool d1001_imu_core_encode_tap_duration(
    const d1001_imu_tap_config *config, uint8_t *out) {
  if (out == NULL || !valid_tap_config(config))
    return false;
  *out = (uint8_t)(config->shock | (uint8_t)config->quiet << 2U |
                   (uint8_t)config->duration << 4U);
  return true;
}

bool d1001_imu_core_encode_tap_mode(const d1001_imu_tap_config *config,
                                    uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_tap_config(config))
    return false;
  *out = (uint8_t)((current & 0x7fU) |
                   (config->double_tap_enabled ? 0x80U : 0U));
  return true;
}

static bool valid_wakeup_config(const d1001_imu_wakeup_config *config) {
  return config != NULL && config->threshold <= 63U && config->duration <= 3U;
}

bool d1001_imu_core_encode_wakeup_threshold(
    const d1001_imu_wakeup_config *config, uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_wakeup_config(config))
    return false;
  *out = (uint8_t)((current & 0xc0U) | config->threshold);
  return true;
}

bool d1001_imu_core_encode_wakeup_duration(
    const d1001_imu_wakeup_config *config, uint8_t current, uint8_t *out) {
  if (out == NULL || !valid_wakeup_config(config))
    return false;
  *out = (uint8_t)((current & 0x9fU) | (uint8_t)config->duration << 5U);
  return true;
}

void d1001_imu_core_decode_tap_source(uint8_t value,
                                      d1001_imu_tap_source *out) {
  *out = (d1001_imu_tap_source){
      .raw = value,
      .event = (value & 0x40U) != 0U,
      .single_tap = (value & 0x20U) != 0U,
      .double_tap = (value & 0x10U) != 0U,
      .negative_sign = (value & 0x08U) != 0U,
      .x_tap = (value & 0x04U) != 0U,
      .y_tap = (value & 0x02U) != 0U,
      .z_tap = (value & 0x01U) != 0U,
  };
}

void d1001_imu_core_decode_wakeup_source(uint8_t value,
                                         d1001_imu_wakeup_source *out) {
  *out = (d1001_imu_wakeup_source){
      .raw = value,
      .event = (value & 0x08U) != 0U,
      .sleep_state = (value & 0x10U) != 0U,
      .free_fall = (value & 0x20U) != 0U,
      .x_wakeup = (value & 0x04U) != 0U,
      .y_wakeup = (value & 0x02U) != 0U,
      .z_wakeup = (value & 0x01U) != 0U,
  };
}
