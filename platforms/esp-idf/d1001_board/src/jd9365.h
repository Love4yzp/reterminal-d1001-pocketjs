#pragma once

#include "esp_err.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_types.h"

esp_err_t d1001_jd9365_create(esp_lcd_panel_io_handle_t io,
                              esp_lcd_dsi_bus_handle_t dsi_bus,
                              const esp_lcd_dpi_panel_config_t *dpi_config,
                              esp_lcd_panel_handle_t *out_panel);
