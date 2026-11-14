#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  D1001_IMU_ODR_POWER_DOWN = 0,
  D1001_IMU_ODR_12_5_HZ = 1,
  D1001_IMU_ODR_26_HZ = 2,
  D1001_IMU_ODR_52_HZ = 3,
  D1001_IMU_ODR_104_HZ = 4,
  D1001_IMU_ODR_208_HZ = 5,
  D1001_IMU_ODR_416_HZ = 6,
  D1001_IMU_ODR_833_HZ = 7,
  D1001_IMU_ODR_1666_HZ = 8,
  D1001_IMU_ODR_3332_HZ = 9,
  D1001_IMU_ODR_6664_HZ = 10,
  D1001_IMU_ODR_1_6_HZ = 11,
} d1001_imu_odr;

typedef enum {
  D1001_IMU_ACCEL_2G = 0,
  D1001_IMU_ACCEL_16G = 1,
  D1001_IMU_ACCEL_4G = 2,
  D1001_IMU_ACCEL_8G = 3,
} d1001_imu_accel_range;

typedef enum {
  D1001_IMU_GYRO_250_DPS = 0,
  D1001_IMU_GYRO_125_DPS = 1,
  D1001_IMU_GYRO_500_DPS = 2,
  D1001_IMU_GYRO_1000_DPS = 4,
  D1001_IMU_GYRO_2000_DPS = 6,
} d1001_imu_gyro_range;

typedef struct {
  d1001_imu_odr accel_odr;
  d1001_imu_odr gyro_odr;
  d1001_imu_accel_range accel_range;
  d1001_imu_gyro_range gyro_range;
} d1001_imu_config;

typedef struct {
  float x;
  float y;
  float z;
} d1001_imu_vector3;

typedef struct {
  d1001_imu_vector3 acceleration_mps2;
  d1001_imu_vector3 angular_rate_dps;
  float temperature_c;
} d1001_imu_sample;

typedef struct {
  bool x_enabled;
  bool y_enabled;
  bool z_enabled;
  uint8_t threshold;
  uint8_t shock;
  uint8_t quiet;
  uint8_t duration;
  bool double_tap_enabled;
  bool latched;
} d1001_imu_tap_config;

typedef struct {
  uint8_t threshold;
  uint8_t duration;
} d1001_imu_wakeup_config;

typedef struct {
  bool single_tap;
  bool double_tap;
  bool wakeup;
  bool free_fall;
  bool orientation_6d;
} d1001_imu_int1_route;

typedef struct {
  uint8_t raw;
  bool event;
  bool single_tap;
  bool double_tap;
  bool negative_sign;
  bool x_tap;
  bool y_tap;
  bool z_tap;
} d1001_imu_tap_source;

typedef struct {
  uint8_t raw;
  bool event;
  bool sleep_state;
  bool free_fall;
  bool x_wakeup;
  bool y_wakeup;
  bool z_wakeup;
} d1001_imu_wakeup_source;

#ifdef __cplusplus
}
#endif
