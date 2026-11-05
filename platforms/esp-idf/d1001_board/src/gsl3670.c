/*
 * GSL3670 protocol and initialization derived from
 * Seeed-Studio/reTerminal-D1001 commit 5074d3b,
 * components/esp_lcd_touch_gsl3670 (Apache-2.0).
 */
#include "gsl3670.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "driver/gpio.h"
#include "esp_check.h"
#include "esp_lcd_panel_io.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gsl3670_config.h"
#include "gsl3670_firmware.h"
#include "gsl3670_point_id.h"
#include "pca9535.h"

#define D1001_GSL3670_READ_XY_REG 0x80U
#define D1001_GSL3670_READ_XY_BYTES 44U
#define D1001_GSL3670_MAX_POINTS 5U
#define D1001_GSL3670_I2C_ADDRESS 0x40U
#define D1001_GSL3670_I2C_SPEED_HZ 400000U
#define D1001_GSL3670_LOG_INTERVAL_US 100000

_Static_assert(D1001_GSL3670_READ_XY_BYTES >=
                   1U + 4U * D1001_GSL3670_MAX_POINTS,
               "touch packet buffer is too small");
_Static_assert(D1001_GSL3670_MAX_POINTS <= D1001_GSL3670_POINT_ID_CAPACITY,
               "point-id input capacity exceeded");

typedef struct {
  uint16_t x;
  uint16_t y;
  uint8_t id;
} d1001_gsl3670_point;

typedef struct {
  esp_lcd_touch_t base;
  d1001_gsl3670_point points[D1001_GSL3670_MAX_POINTS];
  uint8_t point_count;
  bool int_configured;
  uint8_t last_log_data[D1001_GSL3670_READ_XY_BYTES];
  int64_t last_log_us;
  bool have_log_data;
} d1001_gsl3670;

static const char *TAG = "d1001_gsl3670";

static esp_err_t d1001_gsl3670_read(esp_lcd_touch_handle_t tp, uint8_t reg,
                                    uint8_t *data, size_t len) {
  return esp_lcd_panel_io_rx_param(tp->io, reg, data, len);
}

static esp_err_t d1001_gsl3670_write(esp_lcd_touch_handle_t tp, uint8_t reg,
                                     const uint8_t *data, size_t len) {
  return esp_lcd_panel_io_tx_param(tp->io, reg, data, len);
}

static esp_err_t d1001_gsl3670_reset_pin(void) {
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_TOUCH_RESET, false), TAG,
      "touch reset low");
  vTaskDelay(pdMS_TO_TICKS(20));
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_TOUCH_RESET, true), TAG,
      "touch reset high");
  vTaskDelay(pdMS_TO_TICKS(20));
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_read_cfg(esp_lcd_touch_handle_t tp) {
  const uint8_t expected[] = {0x12, 0x34, 0x56, 0x00};
  uint8_t actual[sizeof(expected)] = {0};
  ESP_RETURN_ON_ERROR(d1001_gsl3670_read(tp, 0xf0, actual, sizeof(actual)),
                      TAG, "read config register");
  vTaskDelay(pdMS_TO_TICKS(20));
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xf0, expected, sizeof(expected)),
                      TAG, "write config register");
  vTaskDelay(pdMS_TO_TICKS(20));
  ESP_RETURN_ON_ERROR(d1001_gsl3670_read(tp, 0xf0, actual, sizeof(actual)),
                      TAG, "read back config register");
  ESP_RETURN_ON_FALSE(memcmp(actual, expected, sizeof(expected)) == 0, ESP_FAIL,
                      TAG, "config register mismatch");
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_clear_reg(esp_lcd_touch_handle_t tp) {
  ESP_RETURN_ON_ERROR(d1001_gsl3670_reset_pin(), TAG, "clear reset");
  const uint8_t enable = 0x01;
  const uint8_t reset = 0x04;
  const uint8_t startup = 0x00;
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0x88, &enable, 1), TAG,
                      "clear register 0x88");
  vTaskDelay(pdMS_TO_TICKS(5));
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xe4, &reset, 1), TAG,
                      "clear register 0xe4");
  vTaskDelay(pdMS_TO_TICKS(5));
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xe0, &startup, 1), TAG,
                      "clear register 0xe0");
  vTaskDelay(pdMS_TO_TICKS(20));
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_reset(esp_lcd_touch_handle_t tp) {
  ESP_RETURN_ON_ERROR(d1001_gsl3670_reset_pin(), TAG, "controller reset");
  const uint8_t reset = 0x04;
  const uint8_t clear[] = {0x00, 0x00, 0x00, 0x00};
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xe4, &reset, 1), TAG,
                      "reset register 0xe4");
  vTaskDelay(pdMS_TO_TICKS(10));
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xbc, clear, sizeof(clear)), TAG,
                      "reset register 0xbc");
  vTaskDelay(pdMS_TO_TICKS(10));
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_load_fw(esp_lcd_touch_handle_t tp) {
  for (size_t i = 0; i < sizeof(D1001_GSL3670_FW) / sizeof(D1001_GSL3670_FW[0]);
       ++i) {
    const d1001_gsl3670_fw_data *entry = &D1001_GSL3670_FW[i];
    const uint8_t data[] = {
        (uint8_t)(entry->val & 0xffU),
        (uint8_t)((entry->val >> 8) & 0xffU),
        (uint8_t)((entry->val >> 16) & 0xffU),
        (uint8_t)((entry->val >> 24) & 0xffU),
    };
    const size_t len = entry->offset == 0xf0U ? 1U : sizeof(data);
    ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, entry->offset, data, len), TAG,
                        "firmware write %u", (unsigned)i);
  }
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_startup(esp_lcd_touch_handle_t tp) {
  const uint8_t startup = 0x00;
  ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xe0, &startup, 1), TAG,
                      "startup register 0xe0");
  vTaskDelay(pdMS_TO_TICKS(10));
  gsl_DataInit(D1001_GSL3670_CONFIG,
               sizeof(D1001_GSL3670_CONFIG) / sizeof(D1001_GSL3670_CONFIG[0]));
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_initialize(esp_lcd_touch_handle_t tp) {
  ESP_RETURN_ON_ERROR(d1001_gsl3670_clear_reg(tp), TAG, "clear registers");
  ESP_RETURN_ON_ERROR(d1001_gsl3670_reset(tp), TAG, "reset before firmware");
  ESP_RETURN_ON_ERROR(d1001_gsl3670_load_fw(tp), TAG, "load firmware");
  ESP_RETURN_ON_ERROR(d1001_gsl3670_startup(tp), TAG, "first startup");
  ESP_RETURN_ON_ERROR(d1001_gsl3670_reset(tp), TAG, "reset after firmware");
  ESP_RETURN_ON_ERROR(d1001_gsl3670_startup(tp), TAG, "second startup");
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_verify_fw(esp_lcd_touch_handle_t tp) {
  uint8_t data[4] = {0};
  vTaskDelay(pdMS_TO_TICKS(30));
  ESP_RETURN_ON_ERROR(d1001_gsl3670_read(tp, 0xb0, data, sizeof(data)), TAG,
                      "read firmware signature");
  ESP_RETURN_ON_FALSE(data[0] == 0x5a && data[1] == 0x5a && data[2] == 0x5a &&
                          data[3] == 0x5a,
                      ESP_FAIL, TAG, "firmware signature mismatch");
  return ESP_OK;
}

static void d1001_gsl3670_log_data(d1001_gsl3670 *gsl,
                                   const d1001_gsl3670_touch_info *raw,
                                   const uint8_t *packet) {
  const int64_t now = esp_timer_get_time();
  if ((gsl->have_log_data &&
       memcmp(packet, gsl->last_log_data, sizeof(gsl->last_log_data)) == 0) ||
      (gsl->have_log_data &&
       now - gsl->last_log_us < D1001_GSL3670_LOG_INTERVAL_US)) {
    return;
  }

  if (raw->finger_num == 0) {
    ESP_LOGI(TAG, "touch released");
  }
  for (int i = 0; i < raw->finger_num; ++i) {
    uint16_t physical_x = (uint16_t)raw->x[i];
    uint16_t physical_y = (uint16_t)raw->y[i];
    if (gsl->base.config.flags.mirror_x) {
      physical_x = gsl->base.config.x_max - physical_x;
    }
    if (gsl->base.config.flags.mirror_y) {
      physical_y = gsl->base.config.y_max - physical_y;
    }
    if (gsl->base.config.flags.swap_xy) {
      const uint16_t swap = physical_x;
      physical_x = physical_y;
      physical_y = swap;
    }
    ESP_LOGI(TAG,
             "point %d/%d id=%d raw=(%d,%d) physical=(%u,%u) logical=(%u,%u)",
             i + 1, raw->finger_num, raw->id[i], raw->x[i], raw->y[i],
             (unsigned)physical_x, (unsigned)physical_y,
             (unsigned)(physical_x / 2), (unsigned)(physical_y / 2));
  }
  memcpy(gsl->last_log_data, packet, sizeof(gsl->last_log_data));
  gsl->last_log_us = now;
  gsl->have_log_data = true;
}

static esp_err_t d1001_gsl3670_read_data(esp_lcd_touch_handle_t tp) {
  d1001_gsl3670 *gsl = (d1001_gsl3670 *)tp;
  uint8_t touch_data[D1001_GSL3670_READ_XY_BYTES] = {0};
  ESP_RETURN_ON_ERROR(
      d1001_gsl3670_read(tp, D1001_GSL3670_READ_XY_REG, touch_data,
                         sizeof(touch_data)),
      TAG, "read touch points");

  d1001_gsl3670_touch_info info = {0};
  info.finger_num = touch_data[0];
  if (info.finger_num > D1001_GSL3670_MAX_POINTS) {
    info.finger_num = D1001_GSL3670_MAX_POINTS;
  }
  for (int i = 0; i < info.finger_num; ++i) {
    const size_t offset = (size_t)(i + 1) * 4U;
    info.x[i] = ((touch_data[offset + 3] & 0x0fU) << 8) |
                touch_data[offset + 2];
    info.y[i] = (touch_data[offset + 1] << 8) | touch_data[offset];
    info.id[i] = (touch_data[offset + 3] & 0xf0U) >> 4;
  }
  d1001_gsl3670_log_data(gsl, &info, touch_data);

  gsl_alg_id_main(&info);
  const uint32_t adjustment = gsl_mask_tiaoping();
  if (adjustment > 0U && adjustment < 0xffffffffU) {
    const uint8_t select[] = {0x0a, 0x00, 0x00, 0x00};
    const uint8_t value[] = {
        (uint8_t)(adjustment & 0xffU),
        (uint8_t)((adjustment >> 8) & 0xffU),
        (uint8_t)((adjustment >> 16) & 0xffU),
        (uint8_t)((adjustment >> 24) & 0xffU),
    };
    ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0xf0, select, sizeof(select)),
                        TAG, "select adjustment register");
    ESP_RETURN_ON_ERROR(d1001_gsl3670_write(tp, 0x08, value, sizeof(value)),
                        TAG, "write adjustment");
  }

  if (info.finger_num > D1001_GSL3670_MAX_POINTS) {
    info.finger_num = D1001_GSL3670_MAX_POINTS;
  }
  portENTER_CRITICAL(&tp->data.lock);
  gsl->point_count = (uint8_t)info.finger_num;
  for (int i = 0; i < info.finger_num; ++i) {
    gsl->points[i].x = (uint16_t)info.x[i];
    gsl->points[i].y = (uint16_t)info.y[i];
    gsl->points[i].id = (uint8_t)info.id[i];
  }
  for (int i = info.finger_num; i < D1001_GSL3670_MAX_POINTS; ++i) {
    gsl->points[i] = (d1001_gsl3670_point){0};
  }
  tp->data.points = gsl->point_count;
  portEXIT_CRITICAL(&tp->data.lock);
  return ESP_OK;
}

static bool d1001_gsl3670_get_xy(esp_lcd_touch_handle_t tp, uint16_t *x,
                                 uint16_t *y, uint16_t *strength,
                                 uint8_t *point_num, uint8_t max_point_num) {
  if (tp == NULL || x == NULL || y == NULL || point_num == NULL ||
      max_point_num == 0U) {
    return false;
  }
  d1001_gsl3670 *gsl = (d1001_gsl3670 *)tp;
  portENTER_CRITICAL(&tp->data.lock);
  *point_num = gsl->point_count < max_point_num ? gsl->point_count
                                                : max_point_num;
  for (uint8_t i = 0; i < *point_num; ++i) {
    x[i] = gsl->points[i].x;
    y[i] = gsl->points[i].y;
    if (strength != NULL) {
      strength[i] = 0;
    }
  }
  portEXIT_CRITICAL(&tp->data.lock);
  return *point_num > 0U;
}

static esp_err_t d1001_gsl3670_get_track_id(esp_lcd_touch_handle_t tp,
                                            uint8_t *track_id,
                                            uint8_t point_num) {
  d1001_gsl3670 *gsl = (d1001_gsl3670 *)tp;
  ESP_RETURN_ON_FALSE(track_id != NULL && point_num <= gsl->point_count,
                      ESP_ERR_INVALID_ARG, TAG, "invalid track ID request");
  portENTER_CRITICAL(&tp->data.lock);
  for (uint8_t i = 0; i < point_num; ++i) {
    track_id[i] = gsl->points[i].id;
  }
  portEXIT_CRITICAL(&tp->data.lock);
  return ESP_OK;
}

static esp_err_t d1001_gsl3670_del(esp_lcd_touch_handle_t tp) {
  if (tp == NULL) {
    return ESP_ERR_INVALID_ARG;
  }
  d1001_gsl3670 *gsl = (d1001_gsl3670 *)tp;
  const esp_lcd_panel_io_handle_t io = tp->io;
  if (gsl->int_configured) {
    if (tp->config.interrupt_callback != NULL) {
      gpio_isr_handler_remove(tp->config.int_gpio_num);
    }
    gpio_reset_pin(tp->config.int_gpio_num);
  }
  free(gsl);
  return esp_lcd_panel_io_del(io);
}

static esp_err_t d1001_gsl3670_create_with_io(
    esp_lcd_panel_io_handle_t io, gpio_num_t int_gpio_num,
    esp_lcd_touch_handle_t *out_touch) {
  d1001_gsl3670 *gsl = calloc(1, sizeof(*gsl));
  if (gsl == NULL) {
    return ESP_ERR_NO_MEM;
  }
  gsl->base = (esp_lcd_touch_t){
      .io = io,
      .read_data = d1001_gsl3670_read_data,
      .get_xy = d1001_gsl3670_get_xy,
      .get_track_id = d1001_gsl3670_get_track_id,
      .del = d1001_gsl3670_del,
      .config =
          {
              .x_max = 800,
              .y_max = 1280,
              .rst_gpio_num = GPIO_NUM_NC,
              .int_gpio_num = int_gpio_num,
              .levels =
                  {
                      .reset = 0,
                      .interrupt = 0,
                  },
              .flags =
                  {
                      .swap_xy = 0,
                      .mirror_x = 1,
                      .mirror_y = 1,
                  },
          },
  };
  gsl->base.data.lock.owner = portMUX_FREE_VAL;

  esp_err_t ret = d1001_gsl3670_read_cfg(&gsl->base);
  if (ret == ESP_OK) {
    ret = d1001_gsl3670_initialize(&gsl->base);
  }
  if (ret == ESP_OK) {
    ret = d1001_gsl3670_verify_fw(&gsl->base);
  }
  if (ret == ESP_OK && int_gpio_num != GPIO_NUM_NC) {
    const gpio_config_t config = {
        .mode = GPIO_MODE_INPUT,
        .intr_type = int_gpio_num >= 0 && gsl->base.config.levels.interrupt
                         ? GPIO_INTR_POSEDGE
                         : GPIO_INTR_NEGEDGE,
        .pin_bit_mask = BIT64(int_gpio_num),
    };
    ret = gpio_config(&config);
    if (ret == ESP_OK) {
      gsl->int_configured = true;
      if (gsl->base.config.interrupt_callback != NULL) {
        ret = esp_lcd_touch_register_interrupt_callback(
            &gsl->base, gsl->base.config.interrupt_callback);
      }
    }
  }
  if (ret != ESP_OK) {
    if (gsl->int_configured) {
      gpio_reset_pin(int_gpio_num);
    }
    free(gsl);
    return ret;
  }
  *out_touch = &gsl->base;
  return ESP_OK;
}

esp_err_t d1001_gsl3670_create(i2c_master_bus_handle_t bus,
                               gpio_num_t int_gpio_num,
                               esp_lcd_touch_handle_t *out_touch) {
  ESP_RETURN_ON_FALSE(bus != NULL && out_touch != NULL, ESP_ERR_INVALID_ARG, TAG,
                      "invalid arguments");
  ESP_RETURN_ON_FALSE(int_gpio_num == GPIO_NUM_NC ||
                          (int_gpio_num >= 0 && int_gpio_num < GPIO_NUM_MAX),
                      ESP_ERR_INVALID_ARG, TAG, "invalid interrupt GPIO");
  *out_touch = NULL;
  const esp_lcd_panel_io_i2c_config_t io_config = {
      .dev_addr = D1001_GSL3670_I2C_ADDRESS,
      .control_phase_bytes = 1,
      .dc_bit_offset = 0,
      .lcd_cmd_bits = 8,
      .flags =
          {
              .disable_control_phase = 1,
          },
      .scl_speed_hz = D1001_GSL3670_I2C_SPEED_HZ,
  };
  esp_lcd_panel_io_handle_t io = NULL;
  ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_i2c(bus, &io_config, &io), TAG,
                      "create touch I2C interface");
  const esp_err_t ret =
      d1001_gsl3670_create_with_io(io, int_gpio_num, out_touch);
  if (ret != ESP_OK) {
    esp_lcd_panel_io_del(io);
  }
  return ret;
}
