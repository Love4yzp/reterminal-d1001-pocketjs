#pragma once

#include <stdint.h>

#include "pocket/display_esp_dpi.h"

typedef struct {
  uint32_t ok;
  uint32_t unsupported;
  uint32_t errors;
  uint64_t pixels;
  uint64_t total_us;
  uint32_t max_us;
} d1001_move_stats;

void d1001_move_tracker_init(void);
const pocket_display_output_v1 *d1001_move_tracker_vtable(void);
d1001_move_stats d1001_move_tracker_read(void);
