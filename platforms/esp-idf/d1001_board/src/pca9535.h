#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#define D1001_PCA9535_LCD_POWER (1U << 0)
#define D1001_PCA9535_CAMERA_POWER (1U << 1)
#define D1001_PCA9535_LCD_RESET (1U << 2)
#define D1001_PCA9535_CAMERA_PWDN (1U << 3)
#define D1001_PCA9535_BACKLIGHT_POWER (1U << 7)
#define D1001_PCA9535_POWER_HOLD (1U << 8)
#define D1001_PCA9535_CAMERA_RESET (1U << 9)
#define D1001_PCA9535_TOUCH_RESET (1U << 12)
/* P13 (Port 1 bit 3) enables the ES8311 speaker amplifier, active high. */
#define D1001_PCA9535_PA_ENABLE (1U << 11)

esp_err_t d1001_pca9535_init(i2c_master_bus_handle_t bus);
/* Internal board rollback; serialized with all register accesses. */
esp_err_t d1001_pca9535_deinit(void);
esp_err_t d1001_pca9535_set_direction(uint16_t mask, bool output);
esp_err_t d1001_pca9535_set_level(uint16_t mask, bool high);
