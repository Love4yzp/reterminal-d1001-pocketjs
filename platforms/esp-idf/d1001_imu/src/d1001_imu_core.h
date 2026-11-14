#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "d1001_imu_types.h"

bool d1001_imu_core_encode_accel(d1001_imu_odr odr,
                                 d1001_imu_accel_range range,
                                 uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_accel_mode(d1001_imu_odr odr, uint8_t current,
                                      uint8_t *out);

bool d1001_imu_core_encode_gyro(d1001_imu_odr odr, d1001_imu_gyro_range range,
                                uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_ctrl3(bool active_low, bool open_drain,
                                 uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_int1_route(const d1001_imu_int1_route *route,
                                      uint8_t *out);

void d1001_imu_core_decode_sample(const uint8_t bytes[14],
                                  d1001_imu_accel_range accel_range,
                                  d1001_imu_gyro_range gyro_range,
                                  d1001_imu_sample *out);

bool d1001_imu_core_encode_tap_cfg(const d1001_imu_tap_config *config,
                                   uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_tap_threshold(
    const d1001_imu_tap_config *config, uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_tap_duration(
    const d1001_imu_tap_config *config, uint8_t *out);

bool d1001_imu_core_encode_tap_mode(const d1001_imu_tap_config *config,
                                    uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_wakeup_threshold(
    const d1001_imu_wakeup_config *config, uint8_t current, uint8_t *out);

bool d1001_imu_core_encode_wakeup_duration(
    const d1001_imu_wakeup_config *config, uint8_t current, uint8_t *out);

void d1001_imu_core_decode_tap_source(uint8_t value,
                                      d1001_imu_tap_source *out);

void d1001_imu_core_decode_wakeup_source(uint8_t value,
                                         d1001_imu_wakeup_source *out);
