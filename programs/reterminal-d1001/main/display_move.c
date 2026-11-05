#include "display_move.h"

#include <stdatomic.h>

#include "pocket/display_esp_dpi.h"

static pocket_display_output_v1 wrapped;
static pocket_display_move_fn move_pixels;
static _Atomic uint32_t completed;
static _Atomic uint32_t unsupported;
static _Atomic uint32_t errors;

static int32_t tracked_move(void *context, const pocket_rect *destination,
                            int32_t dx, int32_t dy) {
  const int32_t status = move_pixels(context, destination, dx, dy);
  if (status == POCKET_STATUS_OK)
    atomic_fetch_add(&completed, 1U);
  else if (status == POCKET_STATUS_UNSUPPORTED)
    atomic_fetch_add(&unsupported, 1U);
  else
    atomic_fetch_add(&errors, 1U);
  return status;
}

void d1001_move_tracker_init(void) {
  wrapped = *pocket_display_esp_dpi_vtable();
  move_pixels = wrapped.move_pixels;
  wrapped.move_pixels = tracked_move;
}

const pocket_display_output_v1 *d1001_move_tracker_vtable(void) {
  return &wrapped;
}

d1001_move_stats d1001_move_tracker_read(void) {
  return (d1001_move_stats){
      .ok = atomic_load(&completed),
      .unsupported = atomic_load(&unsupported),
      .errors = atomic_load(&errors),
  };
}
