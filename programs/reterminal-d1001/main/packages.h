#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_partition.h"
#include "pocket/package_facts.h"
#include "pocket/package_source.h"

typedef struct {
  pocket_memory_package source;
  esp_partition_mmap_handle_t mapping;
  void *copy;
  pocket_idf_package_facts facts;
  uint64_t hash;
  bool external;
} d1001_package;

void d1001_package_select(d1001_package *selected);
/* Select the package variant for the current display orientation. Landscape
 * copies the portrait package to PSRAM and rewrites its plan viewport before
 * admission; the original flash bytes stay untouched. */
void d1001_package_select_for(d1001_package *selected, bool landscape);
void d1001_package_release(d1001_package *selected);
