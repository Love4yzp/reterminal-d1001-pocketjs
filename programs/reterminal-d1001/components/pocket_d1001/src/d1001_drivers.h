#pragma once

#include <time.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

esp_err_t d1001_rtc_open(i2c_master_bus_handle_t bus,
                         i2c_master_dev_handle_t *out);
esp_err_t d1001_rtc_read(i2c_master_dev_handle_t device, time_t *out);
esp_err_t d1001_rtc_write(i2c_master_dev_handle_t device, time_t epoch);
esp_err_t d1001_rtc_close(i2c_master_dev_handle_t *device);
