/* Adapted from pocket-m5 pocket_system/src/services_host.c at commit
 * aa8a0ca3ad4bc2aca737af128310c1269902c4cf. */
#include "worker_package.h"

#include "pocket_profile.h"

static uint32_t le32(const uint8_t *p) {
  return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 |
         (uint32_t)p[3] << 24;
}

static uint64_t le64(const uint8_t *p) {
  return (uint64_t)le32(p) | (uint64_t)le32(p + 4) << 32;
}

/* A section of the admitted variant, the one whose hash (variant offset 24,
 * contracts/spec/pocket-package.ts) is package->facts.variant_hash: kind 8 is
 * the NUL-terminated worker source and kind 9 its bytecode envelope. */
static bool variant_section(const d1001_package *package, uint32_t kind,
                            const uint8_t **payload, size_t *length) {
  const uint8_t *bytes = package->source.data;
  const size_t size = package->source.size;
  enum { HEADER = 32, VARIANT = 64, SECTION = 16, FOOTER = 8 };
  if (size < HEADER + FOOTER)
    return false;
  const uint64_t payload_end = size - FOOTER;
#define WITHIN(offset, count)                                                  \
  ((uint64_t)(offset) <= payload_end &&                                        \
   (uint64_t)(count) <= payload_end - (offset))
  const uint64_t table = HEADER + ((uint64_t)le32(bytes + 8) + 15) / 16 * 16;
  const uint32_t variants = le32(bytes + 12);
  if (variants > 64 || !WITHIN(table, (uint64_t)variants * VARIANT))
    return false;
  for (uint32_t v = 0; v < variants; ++v) {
    const uint8_t *variant = bytes + table + (uint64_t)v * VARIANT;
    if (le32(variant + 8) != pocket_profile.host_abi ||
        le64(variant + 24) != package->facts.variant_hash)
      continue;
    const uint32_t count = le32(variant + 12), sections = le32(variant + 16);
    if (count > 64 || !WITHIN(sections, (uint64_t)count * SECTION))
      return false;
    for (uint32_t s = 0; s < count; ++s) {
      const uint8_t *section = bytes + sections + (uint64_t)s * SECTION;
      const uint32_t start = le32(section + 8), span = le32(section + 12);
      if (le32(section) != kind)
        continue;
      if (span == 0 || !WITHIN(start, span))
        return false;
      *payload = bytes + start;
      *length = span;
      return true;
    }
    return false;
  }
#undef WITHIN
  return false;
}

bool d1001_package_worker(const d1001_package *package, const char **source,
                          size_t *size) {
  if (package == NULL || source == NULL || size == NULL)
    return false;
  const uint8_t *payload = NULL;
  size_t span = 0;
  if (!variant_section(package, 8, &payload, &span) || span < 2 ||
      payload[span - 1] != 0)
    return false;
  *source = (const char *)payload;
  *size = span - 1;
  return true;
}

bool d1001_package_worker_bytecode(const d1001_package *package,
                                   const uint8_t **envelope, size_t *size) {
  return package != NULL && envelope != NULL && size != NULL &&
         variant_section(package, 9, envelope, size);
}
