#pragma once

#include <stdint.h>

#include "esp_err.h"
#include "pocket_runtime.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef esp_err_t (*d1001_hot_push_callback)(void *context);

typedef struct {
  const pocket_profile_facts *facts;
  uint32_t host_abi;
  const uint8_t *profile_hash;
  void *context;
  /* Stop the runner and all other accesses to the current package and mapping. */
  d1001_hot_push_callback stop;
  /* Restart the runtime from apps without resetting the chip; keep this server alive. */
  d1001_hot_push_callback restart;
} d1001_hot_push_config;

/* Disabled builds return ESP_OK without inspecting config or starting a server.
 * facts, profile_hash and context are borrowed for the server's lifetime. */
esp_err_t d1001_hot_push_start(const d1001_hot_push_config *config);

#ifdef __cplusplus
}
#endif
