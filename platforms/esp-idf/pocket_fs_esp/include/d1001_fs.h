#pragma once

#include "esp_err.h"
#include "quickjs.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Call from app_main's internal RAM stack before creating the PSRAM guest.
 * slot is the 16-character lowercase hexadecimal PocketJS slot id. */
esp_err_t d1001_fs_init(const char *slot);

/* Install globalThis.fs when init has bound the slot; otherwise leave the
 * global unchanged. QuickJS calls remain on the guest task and dispatch their
 * file operations synchronously to the internal-RAM system task. */
esp_err_t d1001_fs_install(JSContext *realm);

/* Unbind the guest trees. The storage FAT mount remains available for a later
 * init with the same or another slot. */
void d1001_fs_teardown(void);

#ifdef __cplusplus
}
#endif
