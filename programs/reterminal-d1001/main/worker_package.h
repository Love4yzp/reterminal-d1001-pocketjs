#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "packages.h"

#ifdef __cplusplus
extern "C" {
#endif

/* The worker source of the selected package (section 8 of its admitted
 * variant), or false when it declares no worker domain. The bytes are borrowed
 * from the package and remain valid while its mapping and source do. */
bool d1001_package_worker(const d1001_package *package, const char **source,
                          size_t *size);

/* The worker bytecode envelope (section 9 of the admitted variant), or false
 * without one. The bytes are borrowed from the package. */
bool d1001_package_worker_bytecode(const d1001_package *package,
                                   const uint8_t **envelope, size_t *size);

#ifdef __cplusplus
}
#endif
