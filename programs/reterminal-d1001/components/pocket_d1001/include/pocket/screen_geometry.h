#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

uint32_t d1001_screen_logical_width(bool landscape);
uint32_t d1001_screen_logical_height(bool landscape);
uint32_t d1001_screen_raster_width(bool landscape);
uint32_t d1001_screen_raster_height(bool landscape);
uint32_t d1001_screen_strip_rows(bool landscape);
void d1001_screen_map_touch(bool landscape, uint16_t physical_x,
                            uint16_t physical_y, float *logical_x,
                            float *logical_y);

#ifdef __cplusplus
}
#endif
