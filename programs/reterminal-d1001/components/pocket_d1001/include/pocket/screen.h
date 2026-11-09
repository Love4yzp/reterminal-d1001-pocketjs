#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "d1001_board.h"
#include "esp_err.h"
#include "pocket_drivers.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct d1001_screen d1001_screen;
typedef void (*d1001_screen_rotation_callback)(void *context, bool landscape);

esp_err_t d1001_screen_start(const d1001_board_handles *board,
                             d1001_screen **out_screen);
d1001_screen *d1001_screen_get(void);
bool d1001_screen_set_timeout_seconds(d1001_screen *screen, uint32_t seconds);
void d1001_screen_set_rotation_callback(d1001_screen *screen,
                                        d1001_screen_rotation_callback callback,
                                        void *context);
bool d1001_screen_request_landscape(d1001_screen *screen, bool landscape);
bool d1001_screen_landscape(const d1001_screen *screen);
void d1001_screen_set_landscape(d1001_screen *screen, bool landscape);
const pocket_input_source_v1 *d1001_screen_touch_vtable(void);
const pocket_input_source_v1 *d1001_screen_button_vtable(void);

#ifdef __cplusplus
}
#endif
