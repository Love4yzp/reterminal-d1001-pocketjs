/* PKAP extent validation follows pocket-m5 pocket_system/src/flash_store.c. */
#include "packages.h"

#include <stddef.h>
#include <string.h>

#include "esp_heap_caps.h"
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

#define PACKAGE_HEADER_BYTES 32U
#define PACKAGE_VARIANT_BYTES 64U
#define PACKAGE_SECTION_BYTES 16U
#define PACKAGE_ALIGN_BYTES 16U
#define PACKAGE_FNV_OFFSET 0xcbf29ce484222325ULL
#define PACKAGE_FNV_PRIME 0x100000001b3ULL
#define PACKAGE_SECTION_PLAN 2U
#define PACKAGE_SECTION_HOST_INPUTS 7U
#define HOST_INPUTS_BYTES 104U

static size_t align_package(size_t value) {
  return (value + PACKAGE_ALIGN_BYTES - 1U) & ~(PACKAGE_ALIGN_BYTES - 1U);
}

static uint32_t read_le32(const uint8_t *bytes) {
  return (uint32_t)bytes[0] | (uint32_t)bytes[1] << 8 |
         (uint32_t)bytes[2] << 16 | (uint32_t)bytes[3] << 24;
}

static void write_le32(uint8_t *bytes, uint32_t value) {
  bytes[0] = (uint8_t)value;
  bytes[1] = (uint8_t)(value >> 8);
  bytes[2] = (uint8_t)(value >> 16);
  bytes[3] = (uint8_t)(value >> 24);
}

static uint64_t read_le64(const uint8_t *bytes) {
  uint64_t value = 0;
  for (size_t i = 0; i < 8U; ++i)
    value |= (uint64_t)bytes[i] << (i * 8U);
  return value;
}

static void write_le64(uint8_t *bytes, uint64_t value) {
  for (size_t i = 0; i < 8U; ++i)
    bytes[i] = (uint8_t)(value >> (i * 8U));
}

static uint64_t fnv_update(uint64_t hash, const uint8_t *bytes, size_t size) {
  for (size_t i = 0; i < size; ++i) {
    hash ^= bytes[i];
    hash *= PACKAGE_FNV_PRIME;
  }
  return hash;
}

static uint8_t *find_bytes(uint8_t *data, size_t size, const char *needle,
                           size_t needle_size) {
  if (needle_size == 0U || needle_size > size)
    return NULL;
  for (size_t i = 0; i + needle_size <= size; ++i)
    if (memcmp(data + i, needle, needle_size) == 0)
      return data + i;
  return NULL;
}

static bool replace_all_bytes(uint8_t *data, size_t size, const char *from,
                              const char *to) {
  const size_t from_size = strlen(from);
  const size_t to_size = strlen(to);
  if (from_size != to_size)
    return false;
  bool replaced = false;
  size_t offset = 0;
  while (offset + from_size <= size) {
    uint8_t *found = find_bytes(data + offset, size - offset, from, from_size);
    if (found == NULL)
      break;
    memcpy(found, to, to_size);
    replaced = true;
    offset = (size_t)(found - data) + to_size;
  }
  return replaced;
}

/* Rewrite the portrait plan and its fixed-width ESP host-input record to the
 * landscape viewport, then refresh the variant and package hashes. The plan
 * strings keep their byte length, so offsets and section tables stay valid. */
static bool patch_landscape_package(uint8_t *package, size_t size) {
  if (size < PACKAGE_HEADER_BYTES + 8U)
    return false;
  const uint32_t manifest_size = read_le32(package + 8U);
  const uint32_t variant_count = read_le32(package + 12U);
  const uint32_t string_offset = read_le32(package + 16U);
  const uint32_t string_size = read_le32(package + 20U);
  if (variant_count == 0U || variant_count > 16U ||
      (size_t)PACKAGE_HEADER_BYTES + manifest_size > size ||
      (size_t)string_offset + string_size > size)
    return false;
  const size_t table_offset =
      align_package(PACKAGE_HEADER_BYTES + manifest_size);
  const size_t section_offset = align_package(string_offset + string_size);
  if (table_offset + (size_t)variant_count * PACKAGE_VARIANT_BYTES > size ||
      section_offset > size)
    return false;

  bool found_plan = false;
  for (uint32_t variant = 0; variant < variant_count; ++variant) {
    uint8_t *entry = package + table_offset + variant * PACKAGE_VARIANT_BYTES;
    const uint32_t section_count = read_le32(entry + 12U);
    const uint32_t sections = read_le32(entry + 16U);
    if (sections > size ||
        (size_t)sections + (size_t)section_count * PACKAGE_SECTION_BYTES > size)
      return false;
    uint64_t hash = PACKAGE_FNV_OFFSET;
    for (uint32_t i = 0; i < section_count; ++i) {
      uint8_t *section = package + sections + i * PACKAGE_SECTION_BYTES;
      const uint32_t kind = read_le32(section);
      const uint32_t offset = read_le32(section + 8U);
      const uint32_t length = read_le32(section + 12U);
      if ((size_t)offset + length > size)
        return false;
      uint8_t *payload = package + offset;
      if (kind == PACKAGE_SECTION_PLAN) {
        if (!replace_all_bytes(payload, length, "\"logical\":[400,640]",
                           "\"logical\":[640,400]") ||
            !replace_all_bytes(payload, length, "\"physical\":[800,1280]",
                           "\"physical\":[1280,800]"))
          return false;
        found_plan = true;
      } else if (kind == PACKAGE_SECTION_HOST_INPUTS) {
        if (length < HOST_INPUTS_BYTES)
          return false;
        write_le32(payload + 16U, 640U);
        write_le32(payload + 20U, 400U);
        write_le32(payload + 24U, 1280U);
        write_le32(payload + 28U, 800U);
      }
      hash = fnv_update(hash, payload, length);
    }
    write_le64(entry + 24U, hash);
  }
  if (!found_plan)
    return false;
  const uint64_t footer = fnv_update(PACKAGE_FNV_OFFSET, package, size - 8U);
  write_le64(package + size - 8U, footer);
  return true;
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
  d1001_package_select_for(selected, false);
}

void d1001_package_select_for(d1001_package *selected, bool landscape) {
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
  ESP_LOGI(TAG, "apps partition offset=0x%lx size=%lu bytes",
           (unsigned long)partition->address, (unsigned long)partition->size);
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
  uint64_t hash = read_u64(bytes + 24U);
  const uint8_t *package = bytes + HEADER_BYTES;
  uint8_t *copy = NULL;
  if (landscape) {
    copy = heap_caps_aligned_alloc(16U, HEADER_BYTES + size,
                                   MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (copy == NULL) {
      esp_partition_munmap(mapping);
      use_embedded(selected, "landscape-copy-failed");
      return;
    }
    memcpy(copy, bytes, HEADER_BYTES + size);
    uint8_t *patched = copy + HEADER_BYTES;
    if (!patch_landscape_package(patched, size)) {
      ESP_LOGW(TAG, "apps: landscape package patch failed");
      heap_caps_free(copy);
      esp_partition_munmap(mapping);
      use_embedded(selected, "landscape-patch-failed");
      return;
    }
    const uint64_t patched_hash = read_le64(patched + size - 8U);
    write_le64(copy + 24U, patched_hash);
    hash = patched_hash;
    package = patched;
  }
  pocket_idf_package_facts opened = {.struct_size = sizeof(opened)};
  const int32_t opened_status = pocket_idf_package_open(
      package, size, pocket_profile.facts, pocket_profile.host_abi,
      pocket_profile.profile_hash, &opened);
  if (opened_status != POCKET_PACKAGE_OPEN_OK) {
    ESP_LOGW(TAG, "apps: package_open=%ld", (long)opened_status);
    if (copy != NULL)
      heap_caps_free(copy);
    esp_partition_munmap(mapping);
    use_embedded(selected, "package-open-failed");
    return;
  }
  if (opened.package_hash != hash ||
      memcmp(opened.slot, bytes + 32U, 16U) != 0) {
    if (copy != NULL)
      heap_caps_free(copy);
    esp_partition_munmap(mapping);
    use_embedded(selected, "facts-mismatch");
    return;
  }

  if (copy != NULL) {
    esp_partition_munmap(mapping);
    mapping = 0;
    selected->copy = copy;
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
  ESP_LOGI(TAG, "source=apps slot=%s size=%lu hash=%016llx%s viewport=%lux%lu", opened.slot,
           (unsigned long)size, (unsigned long long)opened.package_hash,
           copy != NULL ? " landscape" : "", (unsigned long)opened.view_width,
           (unsigned long)opened.view_height);
}

void d1001_package_release(d1001_package *selected) {
  if (selected != NULL && selected->copy != NULL) {
    heap_caps_free(selected->copy);
    selected->copy = NULL;
  }
  if (selected != NULL && selected->mapping != 0) {
    esp_partition_munmap(selected->mapping);
    selected->mapping = 0;
  }
}
