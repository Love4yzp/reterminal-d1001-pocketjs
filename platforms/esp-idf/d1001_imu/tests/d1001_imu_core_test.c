#include "d1001_imu_core.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition)                                                     \
  do {                                                                       \
    if (!(condition)) {                                                      \
      fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__,           \
              #condition);                                                   \
      exit(1);                                                               \
    }                                                                        \
  } while (0)

#define CHECK_CLOSE(actual, expected) CHECK(fabsf((actual) - (expected)) < 0.0001f)

static void put_word(uint8_t *bytes, int16_t value) {
  const uint16_t raw = (uint16_t)value;
  bytes[0] = (uint8_t)raw;
  bytes[1] = (uint8_t)(raw >> 8U);
}

static void test_accel_encoding(void) {
  uint8_t value = 0;
  CHECK(d1001_imu_core_encode_accel(D1001_IMU_ODR_104_HZ, D1001_IMU_ACCEL_2G,
                                    0, &value));
  CHECK(value == 0x40U);
  CHECK(d1001_imu_core_encode_accel_mode(D1001_IMU_ODR_1_6_HZ, 0, &value));
  CHECK(value == 0x10U);
  CHECK(d1001_imu_core_encode_accel_mode(D1001_IMU_ODR_104_HZ, 0xffU, &value));
  CHECK(value == 0xefU);
  CHECK(!d1001_imu_core_encode_accel_mode((d1001_imu_odr)12, 0, &value));

  for (int odr = D1001_IMU_ODR_POWER_DOWN; odr <= D1001_IMU_ODR_1_6_HZ;
       ++odr) {
    CHECK(d1001_imu_core_encode_accel((d1001_imu_odr)odr, D1001_IMU_ACCEL_4G,
                                      0x03U, &value));
    CHECK(value == (uint8_t)(0x0bU | (uint8_t)odr << 4U));
  }

  CHECK(d1001_imu_core_encode_accel(D1001_IMU_ODR_26_HZ, D1001_IMU_ACCEL_16G,
                                    0, &value));
  CHECK(value == 0x24U);
  CHECK(!d1001_imu_core_encode_accel((d1001_imu_odr)-1, D1001_IMU_ACCEL_2G, 0,
                                     &value));
  CHECK(!d1001_imu_core_encode_accel((d1001_imu_odr)12, D1001_IMU_ACCEL_2G, 0,
                                     &value));
  CHECK(!d1001_imu_core_encode_accel(D1001_IMU_ODR_104_HZ,
                                     (d1001_imu_accel_range)4, 0, &value));
  CHECK(!d1001_imu_core_encode_accel(D1001_IMU_ODR_104_HZ, D1001_IMU_ACCEL_2G,
                                     0, NULL));
}

static void test_gyro_encoding(void) {
  uint8_t value = 0;
  CHECK(d1001_imu_core_encode_gyro(D1001_IMU_ODR_104_HZ,
                                   D1001_IMU_GYRO_2000_DPS, 0, &value));
  CHECK(value == 0x4cU);
  CHECK(d1001_imu_core_encode_gyro(D1001_IMU_ODR_26_HZ,
                                   D1001_IMU_GYRO_125_DPS, 0x01U, &value));
  CHECK(value == 0x23U);

  for (int odr = D1001_IMU_ODR_POWER_DOWN; odr <= D1001_IMU_ODR_6664_HZ;
       ++odr) {
    CHECK(d1001_imu_core_encode_gyro((d1001_imu_odr)odr,
                                     D1001_IMU_GYRO_250_DPS, 0, &value));
    CHECK(value == (uint8_t)odr << 4U);
  }
  CHECK(!d1001_imu_core_encode_gyro(D1001_IMU_ODR_1_6_HZ,
                                    D1001_IMU_GYRO_250_DPS, 0, &value));
  CHECK(!d1001_imu_core_encode_gyro((d1001_imu_odr)12,
                                    D1001_IMU_GYRO_250_DPS, 0, &value));
  CHECK(!d1001_imu_core_encode_gyro(D1001_IMU_ODR_104_HZ,
                                    (d1001_imu_gyro_range)3, 0, &value));
  CHECK(!d1001_imu_core_encode_gyro(D1001_IMU_ODR_104_HZ,
                                    (d1001_imu_gyro_range)5, 0, &value));
  CHECK(!d1001_imu_core_encode_gyro(D1001_IMU_ODR_104_HZ,
                                    (d1001_imu_gyro_range)7, 0, &value));
}

static void test_sample_decoding(void) {
  uint8_t bytes[14] = {0};
  put_word(bytes, 256);
  put_word(bytes + 2, 1000);
  put_word(bytes + 4, -1000);
  put_word(bytes + 6, 32767);
  put_word(bytes + 8, 1000);
  put_word(bytes + 10, -1000);
  put_word(bytes + 12, 16384);

  d1001_imu_sample sample;
  d1001_imu_core_decode_sample(bytes, D1001_IMU_ACCEL_2G,
                               D1001_IMU_GYRO_2000_DPS, &sample);
  CHECK_CLOSE(sample.temperature_c, 26.0f);
  CHECK_CLOSE(sample.angular_rate_dps.x, 70.0f);
  CHECK_CLOSE(sample.angular_rate_dps.y, -70.0f);
  CHECK_CLOSE(sample.angular_rate_dps.z, 32767.0f * 0.070f);
  CHECK_CLOSE(sample.acceleration_mps2.x, 1000.0f * 0.061f * 9.80665f / 1000.0f);
  CHECK_CLOSE(sample.acceleration_mps2.y,
              -1000.0f * 0.061f * 9.80665f / 1000.0f);
  CHECK_CLOSE(sample.acceleration_mps2.z,
              16384.0f * 0.061f * 9.80665f / 1000.0f);

  const d1001_imu_accel_range accel_ranges[] = {
      D1001_IMU_ACCEL_2G, D1001_IMU_ACCEL_4G, D1001_IMU_ACCEL_8G,
      D1001_IMU_ACCEL_16G,
  };
  const float accel_sensitivity[] = {0.061f, 0.122f, 0.244f, 0.488f};
  for (size_t i = 0; i < sizeof accel_ranges / sizeof accel_ranges[0]; ++i) {
    memset(bytes, 0, sizeof bytes);
    put_word(bytes + 8, 1000);
    d1001_imu_core_decode_sample(bytes, accel_ranges[i],
                                 D1001_IMU_GYRO_250_DPS, &sample);
    CHECK_CLOSE(sample.acceleration_mps2.x,
                1000.0f * accel_sensitivity[i] * 9.80665f / 1000.0f);
  }

  const d1001_imu_gyro_range gyro_ranges[] = {
      D1001_IMU_GYRO_125_DPS, D1001_IMU_GYRO_250_DPS,
      D1001_IMU_GYRO_500_DPS, D1001_IMU_GYRO_1000_DPS,
      D1001_IMU_GYRO_2000_DPS,
  };
  const float gyro_sensitivity[] = {0.004375f, 0.00875f, 0.0175f, 0.035f,
                                    0.070f};
  for (size_t i = 0; i < sizeof gyro_ranges / sizeof gyro_ranges[0]; ++i) {
    memset(bytes, 0, sizeof bytes);
    put_word(bytes + 2, -1000);
    put_word(bytes, -256);
    d1001_imu_core_decode_sample(bytes, D1001_IMU_ACCEL_2G, gyro_ranges[i],
                                 &sample);
    CHECK_CLOSE(sample.angular_rate_dps.x, -1000.0f * gyro_sensitivity[i]);
    CHECK_CLOSE(sample.temperature_c, 24.0f);
  }
}

static void test_tap_encoding(void) {
  const d1001_imu_tap_config config = {
      .x_enabled = true,
      .y_enabled = true,
      .z_enabled = true,
      .threshold = 31,
      .shock = 2,
      .quiet = 1,
      .duration = 10,
      .double_tap_enabled = true,
      .latched = true,
  };
  uint8_t value = 0;
  CHECK(d1001_imu_core_encode_tap_cfg(&config, 0x70U, &value));
  CHECK(value == 0xffU);
  CHECK(d1001_imu_core_encode_tap_threshold(&config, 0xe0U, &value));
  CHECK(value == 0xffU);
  CHECK(d1001_imu_core_encode_tap_duration(&config, &value));
  CHECK(value == 0xa6U);
  CHECK(d1001_imu_core_encode_tap_mode(&config, 0x7fU, &value));
  CHECK(value == 0xffU);

  const d1001_imu_tap_config disabled = {0};
  CHECK(d1001_imu_core_encode_tap_cfg(&disabled, 0xffU, &value));
  CHECK(value == 0xf0U);
  CHECK(d1001_imu_core_encode_tap_mode(&disabled, 0xbfU, &value));
  CHECK(value == 0x3fU);

  d1001_imu_tap_config invalid = config;
  invalid.threshold = 32;
  CHECK(!d1001_imu_core_encode_tap_threshold(&invalid, 0, &value));
  invalid = config;
  invalid.shock = 4;
  CHECK(!d1001_imu_core_encode_tap_duration(&invalid, &value));
  invalid = config;
  invalid.quiet = 4;
  CHECK(!d1001_imu_core_encode_tap_cfg(&invalid, 0, &value));
  invalid = config;
  invalid.duration = 16;
  CHECK(!d1001_imu_core_encode_tap_mode(&invalid, 0, &value));
  CHECK(!d1001_imu_core_encode_tap_cfg(NULL, 0, &value));
  CHECK(!d1001_imu_core_encode_tap_duration(&config, NULL));
}

static void test_wakeup_encoding(void) {
  const d1001_imu_wakeup_config config = {.threshold = 63, .duration = 3};
  uint8_t value = 0;
  CHECK(d1001_imu_core_encode_wakeup_threshold(&config, 0x80U, &value));
  CHECK(value == 0xbfU);
  CHECK(d1001_imu_core_encode_wakeup_duration(&config, 0x9fU, &value));
  CHECK(value == 0xffU);

  const d1001_imu_wakeup_config other = {.threshold = 12, .duration = 2};
  CHECK(d1001_imu_core_encode_wakeup_threshold(&other, 0xffU, &value));
  CHECK(value == 0xccU);
  CHECK(d1001_imu_core_encode_wakeup_duration(&other, 0xffU, &value));
  CHECK(value == 0xdfU);

  d1001_imu_wakeup_config invalid = {.threshold = 64, .duration = 0};
  CHECK(!d1001_imu_core_encode_wakeup_threshold(&invalid, 0, &value));
  invalid.threshold = 0;
  invalid.duration = 4;
  CHECK(!d1001_imu_core_encode_wakeup_duration(&invalid, 0, &value));
  CHECK(!d1001_imu_core_encode_wakeup_threshold(NULL, 0, &value));
  CHECK(!d1001_imu_core_encode_wakeup_duration(&config, 0, NULL));
}

static void test_ctrl3_encoding(void) {
  uint8_t value = 0;
  CHECK(d1001_imu_core_encode_ctrl3(true, false, 0, &value));
  CHECK(value == 0x64U);
  CHECK(d1001_imu_core_encode_ctrl3(true, false, 0x44U, &value));
  CHECK(value == 0x64U);
  CHECK(d1001_imu_core_encode_ctrl3(false, false, 0xffU, &value));
  CHECK(value == 0xcdU);
  CHECK(d1001_imu_core_encode_ctrl3(true, false, 0x02U, &value));
  CHECK(value == 0x64U);
  CHECK(d1001_imu_core_encode_ctrl3(false, true, 0, &value));
  CHECK(value == 0x54U);
  CHECK(d1001_imu_core_encode_ctrl3(true, true, 0, &value));
  CHECK(value == 0x74U);
  CHECK(!d1001_imu_core_encode_ctrl3(true, false, 0, NULL));
}

static void test_int1_route_encoding(void) {
  uint8_t value = 0;
  const d1001_imu_int1_route tap_wakeup = {
      .single_tap = true,
      .double_tap = true,
      .wakeup = true,
  };
  CHECK(d1001_imu_core_encode_int1_route(&tap_wakeup, &value));
  CHECK(value == 0x68U);

  const d1001_imu_int1_route motion = {
      .free_fall = true,
      .orientation_6d = true,
  };
  CHECK(d1001_imu_core_encode_int1_route(&motion, &value));
  CHECK(value == 0x14U);

  const d1001_imu_int1_route all = {
      .single_tap = true,
      .double_tap = true,
      .wakeup = true,
      .free_fall = true,
      .orientation_6d = true,
  };
  CHECK(d1001_imu_core_encode_int1_route(&all, &value));
  CHECK(value == 0x7cU);
  const d1001_imu_int1_route none = {0};
  CHECK(d1001_imu_core_encode_int1_route(&none, &value));
  CHECK(value == 0U);
  CHECK(!d1001_imu_core_encode_int1_route(NULL, &value));
  CHECK(!d1001_imu_core_encode_int1_route(&all, NULL));
}

static void test_event_decoding(void) {
  d1001_imu_tap_source tap;
  d1001_imu_core_decode_tap_source(0x7fU, &tap);
  CHECK(tap.raw == 0x7fU && tap.event && tap.single_tap && tap.double_tap &&
        tap.negative_sign && tap.x_tap && tap.y_tap && tap.z_tap);
  d1001_imu_core_decode_tap_source(0x80U, &tap);
  CHECK(tap.raw == 0x80U && !tap.event && !tap.single_tap && !tap.double_tap &&
        !tap.negative_sign && !tap.x_tap && !tap.y_tap && !tap.z_tap);

  d1001_imu_wakeup_source wakeup;
  d1001_imu_core_decode_wakeup_source(0x3fU, &wakeup);
  CHECK(wakeup.raw == 0x3fU && wakeup.event && wakeup.sleep_state &&
        wakeup.free_fall && wakeup.x_wakeup && wakeup.y_wakeup &&
        wakeup.z_wakeup);
  d1001_imu_core_decode_wakeup_source(0xc0U, &wakeup);
  CHECK(wakeup.raw == 0xc0U && !wakeup.event && !wakeup.sleep_state &&
        !wakeup.free_fall && !wakeup.x_wakeup && !wakeup.y_wakeup &&
        !wakeup.z_wakeup);
}

static void test_sample_byte_order_and_minimum(void) {
  /* Fixed bytes, independent of put_word: temperature, gyro XYZ, accel XYZ. */
  const uint8_t bytes[14] = {
      0x00, 0x80, 0x34, 0x12, 0x00, 0x80, 0xff, 0xff,
      0x00, 0x80, 0x02, 0x01, 0xfe, 0xff,
  };
  d1001_imu_sample sample;
  d1001_imu_core_decode_sample(bytes, D1001_IMU_ACCEL_2G,
                               D1001_IMU_GYRO_250_DPS, &sample);
  CHECK_CLOSE(sample.temperature_c, -103.0f);
  CHECK_CLOSE(sample.angular_rate_dps.x, 4660.0f * 0.00875f);
  CHECK_CLOSE(sample.angular_rate_dps.y, (float)INT16_MIN * 0.00875f);
  CHECK_CLOSE(sample.angular_rate_dps.z, -0.00875f);
  const float accel_lsb = 0.061f * 9.80665f / 1000.0f;
  CHECK_CLOSE(sample.acceleration_mps2.x, (float)INT16_MIN * accel_lsb);
  CHECK_CLOSE(sample.acceleration_mps2.y, 258.0f * accel_lsb);
  CHECK_CLOSE(sample.acceleration_mps2.z, -2.0f * accel_lsb);
}

static void test_int1_basic_enable(void) {
  const d1001_imu_int1_route routes[] = {
      {.single_tap = true}, {.double_tap = true}, {.wakeup = true},
      {.free_fall = true}, {.orientation_6d = true},
  };
  const d1001_imu_int1_route none = {0};
  uint8_t value = 0;
  for (unsigned current = 0; current <= UINT8_MAX; ++current) {
    for (size_t i = 0; i < sizeof routes / sizeof routes[0]; ++i) {
      CHECK(d1001_imu_core_encode_int1_tap_cfg(&routes[i], (uint8_t)current,
                                             &value));
      CHECK(value == (uint8_t)(current | 0x80U));
    }
    CHECK(d1001_imu_core_encode_int1_tap_cfg(&none, (uint8_t)current, &value));
    CHECK(value == current);
  }
  CHECK(!d1001_imu_core_encode_int1_tap_cfg(NULL, 0, &value));
  CHECK(!d1001_imu_core_encode_int1_tap_cfg(&none, 0, NULL));
}

static void test_event_bits(void) {
  for (unsigned bit = 0; bit < 8; ++bit) {
    const uint8_t raw = (uint8_t)(1U << bit);
    d1001_imu_tap_source tap;
    d1001_imu_core_decode_tap_source(raw, &tap);
    CHECK(tap.raw == raw);
    CHECK(tap.event == (bit == 6));
    CHECK(tap.single_tap == (bit == 5));
    CHECK(tap.double_tap == (bit == 4));
    CHECK(tap.negative_sign == (bit == 3));
    CHECK(tap.x_tap == (bit == 2));
    CHECK(tap.y_tap == (bit == 1));
    CHECK(tap.z_tap == (bit == 0));

    d1001_imu_wakeup_source wakeup;
    d1001_imu_core_decode_wakeup_source(raw, &wakeup);
    CHECK(wakeup.raw == raw);
    CHECK(wakeup.free_fall == (bit == 5));
    CHECK(wakeup.sleep_state == (bit == 4));
    CHECK(wakeup.event == (bit == 3));
    CHECK(wakeup.x_wakeup == (bit == 2));
    CHECK(wakeup.y_wakeup == (bit == 1));
    CHECK(wakeup.z_wakeup == (bit == 0));
  }
}

int main(void) {
  test_accel_encoding();
  test_gyro_encoding();
  test_sample_decoding();
  test_tap_encoding();
  test_wakeup_encoding();
  test_ctrl3_encoding();
  test_int1_route_encoding();
  test_event_decoding();
  test_sample_byte_order_and_minimum();
  test_int1_basic_enable();
  test_event_bits();
  puts("d1001_imu_core: all checks passed");
  return 0;
}
