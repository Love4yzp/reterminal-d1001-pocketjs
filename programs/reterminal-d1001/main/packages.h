#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_partition.h"
#include "pocket/package_source.h"

typedef struct {
  pocket_memory_package source;
  esp_partition_mmap_handle_t mapping;
  uint64_t hash;
  bool external;
} d1001_package;

void d1001_package_select(d1001_package *selected);
