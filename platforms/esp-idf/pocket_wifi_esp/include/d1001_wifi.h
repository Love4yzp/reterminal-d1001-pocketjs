#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "quickjs.h"

#ifdef __cplusplus
extern "C" {
#endif

void d1001_wifi_start(void);
esp_err_t d1001_wifi_install(JSContext *ctx);
bool d1001_wifi_online(void);

#ifdef __cplusplus
}
#endif
