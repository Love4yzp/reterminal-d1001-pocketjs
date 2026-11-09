#include "pocket/screen_geometry.h"

#define D1001_PANEL_HEIGHT 1280U

uint32_t d1001_screen_logical_width(bool landscape) {
  return landscape ? 640U : 400U;
}

uint32_t d1001_screen_logical_height(bool landscape) {
  return landscape ? 400U : 640U;
}

uint32_t d1001_screen_raster_width(bool landscape) {
  return d1001_screen_logical_width(landscape) * 2U;
}

uint32_t d1001_screen_raster_height(bool landscape) {
  return d1001_screen_logical_height(landscape) * 2U;
}

uint32_t d1001_screen_strip_rows(bool landscape) {
  return landscape ? 20U : 40U;
}

static float clamp(float value, float maximum) {
  return value < 0.0f ? 0.0f : value > maximum ? maximum : value;
}

void d1001_screen_map_touch(bool landscape, uint16_t physical_x,
                            uint16_t physical_y, float *logical_x,
                            float *logical_y) {
  if (logical_x == 0 || logical_y == 0)
    return;
  if (landscape) {
    *logical_x = clamp((float)(D1001_PANEL_HEIGHT - 1U - physical_y) * 0.5f,
                       (float)d1001_screen_logical_width(true) - 1.0f);
    *logical_y = clamp((float)physical_x * 0.5f,
                       (float)d1001_screen_logical_height(true) - 1.0f);
  } else {
    *logical_x = clamp((float)physical_x * 0.5f,
                       (float)d1001_screen_logical_width(false) - 1.0f);
    *logical_y = clamp((float)physical_y * 0.5f,
                       (float)d1001_screen_logical_height(false) - 1.0f);
  }
}
