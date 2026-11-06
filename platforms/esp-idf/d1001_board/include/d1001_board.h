#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_touch.h"
#include "esp_lcd_types.h"

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_PANEL_WIDTH 800U
#define D1001_PANEL_HEIGHT 1280U
#define D1001_BACKLIGHT_GPIO 14
#define D1001_RGB_RED_GPIO 22
#define D1001_RGB_GREEN_GPIO 36
#define D1001_RGB_BLUE_GPIO 23

typedef struct {
  i2c_master_bus_handle_t touch_i2c;
  i2c_master_bus_handle_t system_i2c;
  esp_lcd_dsi_bus_handle_t dsi_bus;
  esp_lcd_panel_io_handle_t panel_io;
  esp_lcd_panel_handle_t panel;
  esp_lcd_touch_handle_t touch;
  uint16_t *framebuffer;
} d1001_board_handles;

esp_err_t d1001_board_init(d1001_board_handles *handles);
esp_err_t d1001_board_backlight_set(uint32_t percent);
esp_err_t d1001_board_rgb_set(bool red, bool green, bool blue);
esp_err_t d1001_board_rgb_set_color(uint8_t red, uint8_t green, uint8_t blue);

#ifdef __cplusplus
}
#endif
