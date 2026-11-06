#pragma once

#include "d1001_board.h"
#include "esp_err.h"
#include "quickjs.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t d1001_panel_install(JSContext *realm, const d1001_board_handles *board);
void d1001_panel_teardown(void);

#ifdef __cplusplus
}
#endif
