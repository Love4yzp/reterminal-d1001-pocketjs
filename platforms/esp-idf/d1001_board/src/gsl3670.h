#pragma once

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_lcd_touch.h"

esp_err_t d1001_gsl3670_create(i2c_master_bus_handle_t bus,
                               gpio_num_t int_gpio_num,
                               esp_lcd_touch_handle_t *out_touch);
