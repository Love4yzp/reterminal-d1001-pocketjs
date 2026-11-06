/* PKAP layout and body-before-header installation follow pocket-m5
 * pocket_system/src/flash_store.c. */
#include "d1001_hot_push.h"

#include "sdkconfig.h"

#ifndef CONFIG_D1001_HOT_PUSH
#define CONFIG_D1001_HOT_PUSH 0
#endif

#if CONFIG_D1001_HOT_PUSH

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "d1001_wifi.h"
#include "esp_heap_caps.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_partition.h"
#include "esp_timer.h"
#include "pocket/package_facts.h"
#include "spi_flash_mmap.h"

#ifndef CONFIG_MMU_PAGE_SIZE
#define CONFIG_MMU_PAGE_SIZE 0x10000
#endif

#define HEADER_BYTES 64U
#define PAGE_BYTES CONFIG_MMU_PAGE_SIZE
#define HEADER_MAGIC 0x50414b50U
#define HEADER_VERSION 1U
#define STATE_LIVE 0xffffffffU
#define MIN_PACKAGE_BYTES 40U
#define RECEIVE_CHUNK_BYTES 16384U
#define HOT_PUSH_PORT 8080

static const char *TAG = "d1001_hot_push";
static d1001_hot_push_config hot_push;
static httpd_handle_t server;
static bool push_active;

typedef struct {
  size_t total;
  size_t free_before;
  size_t min_free;
} push_memory;

static void sample_psram(push_memory *memory) {
  const size_t free = heap_caps_get_free_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (free < memory->min_free)
    memory->min_free = free;
}

static uint32_t read_u32(const uint8_t *bytes) {
  return (uint32_t)bytes[0] | (uint32_t)bytes[1] << 8 |
         (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
}

static uint64_t read_u64(const uint8_t *bytes) {
  uint64_t value = 0;
  for (size_t i = 0; i < 8U; ++i)
    value |= (uint64_t)bytes[i] << (i * 8U);
  return value;
}

static bool valid_slot(const uint8_t *slot) {
  for (size_t i = 0; i < 16U; ++i)
    if (!((slot[i] >= '0' && slot[i] <= '9') ||
          (slot[i] >= 'a' && slot[i] <= 'f')))
      return false;
  return true;
}

static bool authorized(httpd_req_t *request) {
  static const char prefix[] = "Bearer ";
  const size_t prefix_length = sizeof(prefix) - 1U;
  const size_t token_length = strlen(CONFIG_D1001_HOT_PUSH_TOKEN);
  const size_t length = httpd_req_get_hdr_value_len(request, "Authorization");
  if (length != prefix_length + token_length)
    return false;

  char *value = malloc(length + 1U);
  if (value == NULL)
    return false;
  if (httpd_req_get_hdr_value_str(request, "Authorization", value,
                                  length + 1U) != ESP_OK) {
    free(value);
    return false;
  }

  uint8_t difference = 0;
  for (size_t i = 0; i < length; ++i) {
    const char expected = i < prefix_length ? prefix[i]
                                            : CONFIG_D1001_HOT_PUSH_TOKEN[i - prefix_length];
    difference |= (uint8_t)value[i] ^ (uint8_t)expected;
  }
  free(value);
  return difference == 0;
}

static esp_err_t send_json(httpd_req_t *request, const char *status,
                           const char *json) {
  esp_err_t result = httpd_resp_set_status(request, status);
  if (result != ESP_OK)
    return result;
  result = httpd_resp_set_type(request, "application/json");
  if (result != ESP_OK)
    return result;
  return httpd_resp_send(request, json, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t send_error(httpd_req_t *request, const char *status,
                            const char *error) {
  char json[96];
  snprintf(json, sizeof(json), "{\"error\":\"%s\"}", error);
  return send_json(request, status, json);
}

static const char *validate_image(const uint8_t *image, size_t image_size,
                                  const esp_partition_t *partition,
                                  pocket_idf_package_facts *opened,
                                  uint32_t *package_size) {
  if (read_u32(image) != HEADER_MAGIC)
    return "bad_magic";
  if (read_u32(image + 4U) != HEADER_VERSION)
    return "bad_version";

  const uint32_t size = read_u32(image + 8U);
  const uint32_t pages = read_u32(image + 12U);
  const uint64_t total_size = (uint64_t)size + HEADER_BYTES;
  const uint64_t extent = (uint64_t)pages * PAGE_BYTES;
  const uint64_t expected_pages =
      (total_size + PAGE_BYTES - 1U) / PAGE_BYTES;
  if (size < MIN_PACKAGE_BYTES)
    return "short_package";
  if (image_size != total_size)
    return "image_size_mismatch";
  if (pages == 0U || pages != expected_pages || extent > partition->size)
    return "bad_page_count";
  if (read_u32(image + 60U) != STATE_LIVE)
    return "not_live";
  if (!valid_slot(image + 32U))
    return "bad_slot";

  const uint64_t hash = read_u64(image + 24U);
  if (hash != read_u64(image + total_size - 8U))
    return "hash_mismatch";

  const int32_t status = pocket_idf_package_open(
      image + HEADER_BYTES, size, hot_push.facts, hot_push.host_abi,
      hot_push.profile_hash, opened);
  if (status != POCKET_PACKAGE_OPEN_OK) {
    ESP_LOGW(TAG, "package admission failed: %ld", (long)status);
    return "package_open_failed";
  }
  if (opened->package_hash != hash ||
      memcmp(opened->slot, image + 32U, 16U) != 0)
    return "facts_mismatch";

  *package_size = size;
  return NULL;
}

static esp_err_t write_changed_sectors(const esp_partition_t *partition,
                                       const uint8_t *image, size_t image_size) {
  const size_t sectors =
      (image_size + SPI_FLASH_SEC_SIZE - 1U) / SPI_FLASH_SEC_SIZE;
  uint8_t *changed = calloc((sectors + 7U) / 8U, 1U);
  uint8_t *existing = malloc(SPI_FLASH_SEC_SIZE);
  if (changed == NULL || existing == NULL) {
    free(changed);
    free(existing);
    return ESP_ERR_NO_MEM;
  }
  esp_err_t status = ESP_OK;
  size_t changed_count = 0;

  const int64_t compare_started = esp_timer_get_time();
  for (size_t sector = 0; sector < sectors; ++sector) {
    const size_t offset = sector * SPI_FLASH_SEC_SIZE;
    const size_t bytes = image_size - offset < SPI_FLASH_SEC_SIZE
                             ? image_size - offset
                             : SPI_FLASH_SEC_SIZE;
    status = esp_partition_read(partition, offset, existing, bytes);
    if (status != ESP_OK)
      goto done;
    if (memcmp(existing, image + offset, bytes) != 0) {
      changed[sector / 8U] |= (uint8_t)(1U << (sector % 8U));
      ++changed_count;
    }
  }
  const uint32_t compare_ms =
      (unsigned)(esp_timer_get_time() - compare_started) / 1000U;

  const int64_t erase_started = esp_timer_get_time();
  for (size_t sector = 0; sector < sectors; ++sector) {
    if ((changed[sector / 8U] & (uint8_t)(1U << (sector % 8U))) == 0U)
      continue;
    status = esp_partition_erase_range(partition, sector * SPI_FLASH_SEC_SIZE,
                                       SPI_FLASH_SEC_SIZE);
    if (status != ESP_OK)
      goto done;
  }
  const uint32_t erase_ms =
      (unsigned)(esp_timer_get_time() - erase_started) / 1000U;

  const int64_t write_started = esp_timer_get_time();
  for (size_t sector = 1; sector < sectors; ++sector) {
    if ((changed[sector / 8U] & (uint8_t)(1U << (sector % 8U))) == 0U)
      continue;
    const size_t offset = sector * SPI_FLASH_SEC_SIZE;
    const size_t bytes = image_size - offset < SPI_FLASH_SEC_SIZE
                             ? image_size - offset
                             : SPI_FLASH_SEC_SIZE;
    status = esp_partition_write(partition, offset, image + offset, bytes);
    if (status != ESP_OK)
      goto done;
  }
  if ((changed[0] & 1U) != 0U) {
    const size_t bytes = image_size < SPI_FLASH_SEC_SIZE ? image_size
                                                         : SPI_FLASH_SEC_SIZE;
    status = esp_partition_write(partition, 0, image, bytes);
    if (status != ESP_OK)
      goto done;
  }
  const uint32_t write_ms =
      (unsigned)(esp_timer_get_time() - write_started) / 1000U;
  ESP_LOGI(TAG,
           "flash sectors=%u changed=%u compare_ms=%u erase_ms=%u write_ms=%u",
           (unsigned)sectors, (unsigned)changed_count, (unsigned)compare_ms,
           (unsigned)erase_ms, (unsigned)write_ms);

done:
  free(existing);
  free(changed);
  return status;
}

static esp_err_t handle_push(httpd_req_t *request) {
  const esp_partition_t *partition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "apps");
  if (partition == NULL)
    return send_error(request, "500 Internal Server Error", "apps_not_found");
  if (partition->size < PAGE_BYTES || partition->size % PAGE_BYTES != 0U ||
      partition->address % PAGE_BYTES != 0U)
    return send_error(request, "500 Internal Server Error",
                      "bad_partition_layout");
  if (request->content_len == 0U)
    return send_error(request, "411 Length Required", "length_required");
  if (request->content_len < HEADER_BYTES + MIN_PACKAGE_BYTES)
    return send_error(request, "400 Bad Request", "short_image");
  if (request->content_len > partition->size)
    return send_error(request, "413 Content Too Large", "image_too_large");

  push_memory memory = {
      .total = heap_caps_get_total_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT),
      .free_before = heap_caps_get_free_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT),
      .min_free = SIZE_MAX,
  };
  uint8_t *image = heap_caps_malloc(request->content_len,
                                    MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  if (image == NULL)
    return send_error(request, "500 Internal Server Error", "psram_alloc_failed");
  sample_psram(&memory);
  ESP_LOGI(TAG,
           "apps partition size=%u request=%u psram_total=%u free_before=%u free_after_alloc=%u",
           (unsigned)partition->size, (unsigned)request->content_len,
           (unsigned)memory.total, (unsigned)memory.free_before,
           (unsigned)memory.min_free);

  const int64_t receive_started = esp_timer_get_time();
  size_t received = 0;
  unsigned timeouts = 0;
  uint32_t receive_calls = 0;
  uint32_t max_recv_us = 0;
  while (received < request->content_len) {
    const size_t remaining = request->content_len - received;
    const size_t chunk = remaining > RECEIVE_CHUNK_BYTES ? RECEIVE_CHUNK_BYTES
                                                         : remaining;
    const int64_t call_started = esp_timer_get_time();
    const int count = httpd_req_recv(request, (char *)image + received, chunk);
    const uint32_t call_us = (uint32_t)(esp_timer_get_time() - call_started);
    ++receive_calls;
    if (call_us > max_recv_us)
      max_recv_us = call_us;
    if (count == HTTPD_SOCK_ERR_TIMEOUT) {
      if (++timeouts < 3U)
        continue;
      free(image);
      return send_error(request, "408 Request Timeout", "receive_timeout");
    }
    if (count <= 0) {
      ESP_LOGW(TAG, "receive ended early at %u/%u bytes", (unsigned)received,
               (unsigned)request->content_len);
      free(image);
      return send_error(request, "400 Bad Request", "receive_failed");
    }
    timeouts = 0;
    received += (size_t)count;
    sample_psram(&memory);
  }
  const uint32_t receive_ms =
      (unsigned)(esp_timer_get_time() - receive_started) / 1000U;
  ESP_LOGI(TAG, "receive bytes=%u time_ms=%u calls=%u max_recv_ms=%u",
           (unsigned)received, (unsigned)receive_ms, (unsigned)receive_calls,
           (unsigned)max_recv_us / 1000U);

  const int64_t validate_started = esp_timer_get_time();
  pocket_idf_package_facts opened = {.struct_size = sizeof(opened)};
  uint32_t package_size = 0;
  const char *invalid = validate_image(image, request->content_len, partition,
                                       &opened, &package_size);
  const uint32_t validate_ms =
      (unsigned)(esp_timer_get_time() - validate_started) / 1000U;
  if (invalid != NULL) {
    free(image);
    return send_error(request, "400 Bad Request", invalid);
  }

  const uint64_t hash = opened.package_hash;
  const int64_t stop_started = esp_timer_get_time();
  esp_err_t status = hot_push.stop(hot_push.context);
  const uint32_t stop_ms =
      (unsigned)(esp_timer_get_time() - stop_started) / 1000U;
  if (status != ESP_OK) {
    ESP_LOGE(TAG, "runtime stop failed: %s", esp_err_to_name(status));
    free(image);
    return send_error(request, "500 Internal Server Error", "stop_failed");
  }

  const int64_t write_started = esp_timer_get_time();
  status = write_changed_sectors(partition, image, request->content_len);
  if (status != ESP_OK) {
    ESP_LOGE(TAG, "apps delta write failed: %s", esp_err_to_name(status));
    free(image);
    return send_error(request, "500 Internal Server Error", "write_failed");
  }
  const uint32_t write_ms =
      (unsigned)(esp_timer_get_time() - write_started) / 1000U;

  const int64_t restart_started = esp_timer_get_time();
  status = hot_push.restart(hot_push.context);
  const uint32_t restart_ms =
      (unsigned)(esp_timer_get_time() - restart_started) / 1000U;
  if (status != ESP_OK) {
    ESP_LOGE(TAG, "runtime restart failed: %s", esp_err_to_name(status));
    free(image);
    return send_error(request, "500 Internal Server Error", "restart_failed");
  }

  sample_psram(&memory);
  char json[128];
  snprintf(json, sizeof(json),
           "{\"size\":%lu,\"hash\":\"%016llx\",\"restarted\":true}",
           (unsigned long)package_size, (unsigned long long)hash);
  ESP_LOGI(TAG, "push timing receive_ms=%u validate_ms=%u stop_ms=%u write_ms=%u restart_ms=%u",
           (unsigned)receive_ms, (unsigned)validate_ms, (unsigned)stop_ms,
           (unsigned)write_ms, (unsigned)restart_ms);
  ESP_LOGI(TAG, "installed size=%lu hash=%016llx", (unsigned long)package_size,
           (unsigned long long)hash);
  ESP_LOGI(TAG,
           "psram_total=%u free_before=%u buffer=%u min_free=%u used_at_peak=%u",
           (unsigned)memory.total, (unsigned)memory.free_before,
           (unsigned)request->content_len, (unsigned)memory.min_free,
           (unsigned)(memory.total - memory.min_free));
  free(image);
  return send_json(request, "200 OK", json);
}

static esp_err_t push_handler(httpd_req_t *request) {
  if (!authorized(request)) {
    (void)httpd_resp_set_hdr(request, "WWW-Authenticate", "Bearer");
    (void)httpd_resp_set_hdr(request, "Connection", "close");
    const esp_err_t result = send_error(request, "401 Unauthorized", "unauthorized");
    const int socket = httpd_req_to_sockfd(request);
    if (socket >= 0)
      (void)httpd_sess_trigger_close(request->handle, socket);
    return result;
  }
  if (push_active)
    return send_error(request, "409 Conflict", "push_in_progress");
  push_active = true;
  const esp_err_t status = handle_push(request);
  push_active = false;
  return status;
}

esp_err_t d1001_hot_push_start(const d1001_hot_push_config *config) {
  if (config == NULL || config->facts == NULL || config->profile_hash == NULL ||
      config->stop == NULL || config->restart == NULL)
    return ESP_ERR_INVALID_ARG;
  if (CONFIG_D1001_HOT_PUSH_TOKEN[0] == '\0') {
    ESP_LOGE(TAG, "hot push requires a non-empty configured token");
    return ESP_ERR_INVALID_STATE;
  }
  if (!d1001_wifi_online()) {
    ESP_LOGE(TAG, "hot push requires an online Wi-Fi STA");
    return ESP_ERR_INVALID_STATE;
  }
  if (server != NULL)
    return ESP_ERR_INVALID_STATE;

  hot_push = *config;
  httpd_config_t http_config = HTTPD_DEFAULT_CONFIG();
  http_config.server_port = HOT_PUSH_PORT;
  http_config.stack_size = 16U * 1024U;
  http_config.lru_purge_enable = true;
  esp_err_t status = httpd_start(&server, &http_config);
  if (status != ESP_OK) {
    server = NULL;
    return status;
  }

  const httpd_uri_t push_uri = {
      .uri = "/push",
      .method = HTTP_POST,
      .handler = push_handler,
      .user_ctx = NULL,
  };
  status = httpd_register_uri_handler(server, &push_uri);
  if (status != ESP_OK) {
    (void)httpd_stop(server);
    server = NULL;
    return status;
  }
  ESP_LOGI(TAG, "development hot push listening on STA port %u", HOT_PUSH_PORT);
  return ESP_OK;
}

#else

esp_err_t d1001_hot_push_start(const d1001_hot_push_config *config) {
  (void)config;
  return ESP_OK;
}

#endif
