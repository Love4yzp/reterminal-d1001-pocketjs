/* PKAP extent validation follows pocket-m5 pocket_system/src/flash_store.c. */
#include "packages.h"

#include <stddef.h>
#include <string.h>

#include "esp_log.h"
#include "pocket/package_facts.h"
#include "pocket_profile.h"
#include "pocketjs_package_app.h"
#include "sdkconfig.h"

#ifndef CONFIG_MMU_PAGE_SIZE
#define CONFIG_MMU_PAGE_SIZE 0x10000
#endif

#define PAGE_BYTES CONFIG_MMU_PAGE_SIZE
#define HEADER_BYTES 64U
#define HEADER_MAGIC 0x50414b50U
#define HEADER_VERSION 1U
#define STATE_LIVE 0xffffffffU
#define MIN_PACKAGE_BYTES 40U

static const char *TAG = "d1001_package";

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

static void use_embedded(d1001_package *selected, const char *reason) {
  selected->source = (pocket_memory_package){
      .data = pocketjs_package_app.data,
      .size = pocketjs_package_app.size,
  };
  selected->external = false;
  selected->hash = read_u64(selected->source.data + selected->source.size - 8U);
  selected->facts.struct_size = sizeof(selected->facts);
  const int32_t facts_status = pocket_idf_package_open(
      selected->source.data, selected->source.size, pocket_profile.facts,
      pocket_profile.host_abi, pocket_profile.profile_hash, &selected->facts);
  if (facts_status != POCKET_PACKAGE_OPEN_OK)
    ESP_LOGW(TAG, "embedded package facts unavailable: %ld", (long)facts_status);
  ESP_LOGW(TAG, "source=embedded reason=%s size=%u hash=%016llx", reason,
           (unsigned)selected->source.size,
           (unsigned long long)selected->hash);
}

static const char *invalid_header(const esp_partition_t *partition,
                                  const uint8_t *mapped) {
  if (read_u32(mapped) != HEADER_MAGIC)
    return read_u32(mapped) == 0xffffffffU ? "empty-slot" : "bad-magic";
  if (read_u32(mapped + 4U) != HEADER_VERSION)
    return "bad-version";
  const uint32_t size = read_u32(mapped + 8U);
  const uint32_t pages = read_u32(mapped + 12U);
  if (size < MIN_PACKAGE_BYTES)
    return "short-package";
  if (pages == 0U || (uint64_t)pages * PAGE_BYTES > partition->size)
    return "bad-page-count";
  if ((uint64_t)size + HEADER_BYTES > (uint64_t)pages * PAGE_BYTES)
    return "bad-extent-size";
  if (!valid_slot(mapped + 32U))
    return "bad-slot";
  if (read_u32(mapped + 60U) != STATE_LIVE)
    return "not-live";
  if (read_u64(mapped + 24U) !=
      read_u64(mapped + HEADER_BYTES + size - 8U))
    return "footer-mismatch";
  return NULL;
}

void d1001_package_select(d1001_package *selected) {
  *selected = (d1001_package){0};
  const esp_partition_t *partition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "apps");
  if (partition == NULL) {
    use_embedded(selected, "apps-not-found");
    return;
  }
  if (partition->size < PAGE_BYTES || partition->size % PAGE_BYTES != 0U ||
      partition->address % PAGE_BYTES != 0U) {
    use_embedded(selected, "bad-partition-layout");
    return;
  }
  const void *memory = NULL;
  esp_partition_mmap_handle_t mapping = 0;
  const esp_err_t mapped =
      esp_partition_mmap(partition, 0, partition->size, ESP_PARTITION_MMAP_DATA,
                         &memory, &mapping);
  if (mapped != ESP_OK) {
    use_embedded(selected, esp_err_to_name(mapped));
    return;
  }
  const uint8_t *bytes = memory;
  const char *invalid = invalid_header(partition, bytes);
  if (invalid != NULL) {
    ESP_LOGW(TAG, "apps: invalid slot: %s", invalid);
    esp_partition_munmap(mapping);
    use_embedded(selected, invalid);
    return;
  }

  const uint32_t size = read_u32(bytes + 8U);
  const uint64_t hash = read_u64(bytes + 24U);
  const uint8_t *package = bytes + HEADER_BYTES;
  pocket_idf_package_facts opened = {.struct_size = sizeof(opened)};
  const int32_t opened_status = pocket_idf_package_open(
      package, size, pocket_profile.facts, pocket_profile.host_abi,
      pocket_profile.profile_hash, &opened);
  if (opened_status != POCKET_PACKAGE_OPEN_OK) {
    ESP_LOGW(TAG, "apps: package_open=%ld", (long)opened_status);
    esp_partition_munmap(mapping);
    use_embedded(selected, "package-open-failed");
    return;
  }
  if (opened.package_hash != hash ||
      memcmp(opened.slot, bytes + 32U, 16U) != 0) {
    esp_partition_munmap(mapping);
    use_embedded(selected, "facts-mismatch");
    return;
  }

  selected->mapping = mapping;
  selected->hash = opened.package_hash;
  selected->facts = opened;
  selected->external = true;
  selected->source = (pocket_memory_package){
      .data = package,
      .size = size,
      .flags = POCKET_MEMORY_PACKAGE_VERIFIED,
  };
  ESP_LOGI(TAG, "source=apps slot=%s size=%lu hash=%016llx", opened.slot,
           (unsigned long)size, (unsigned long long)opened.package_hash);
}
