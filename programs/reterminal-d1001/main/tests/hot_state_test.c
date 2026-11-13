#include "hot_state.h"

#include <stdio.h>
#include <stdlib.h>

#define CHECK(condition) do { \
  if (!(condition)) { \
    fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #condition); \
    exit(1); \
  } \
} while (0)

int main(void) {
  d1001_hot_phase phase = D1001_HOT_PHASE_RUNNING;
  CHECK(!d1001_hot_phase_active(phase));

  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_STOP);
  CHECK(phase == D1001_HOT_PHASE_STOPPED);
  CHECK(d1001_hot_phase_active(phase));

  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_STOP);
  CHECK(phase == D1001_HOT_PHASE_STOPPED);

  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_WRITE_FAILED);
  CHECK(phase == D1001_HOT_PHASE_STOPPED);
  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_RESTART_BEGIN);
  CHECK(phase == D1001_HOT_PHASE_RESTARTING);
  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_RESTART_OK);
  CHECK(phase == D1001_HOT_PHASE_RUNNING);

  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_STOP);
  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_RESTART_BEGIN);
  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_RESTART_FAIL);
  CHECK(phase == D1001_HOT_PHASE_FAILED);
  CHECK(d1001_hot_phase_active(phase));
  phase = d1001_hot_phase_apply(phase, D1001_HOT_EVENT_STOP);
  CHECK(phase == D1001_HOT_PHASE_STOPPED);

  CHECK(d1001_should_force_portrait(true, false));
  CHECK(!d1001_should_force_portrait(true, true));
  CHECK(!d1001_should_force_portrait(false, false));
  CHECK(!d1001_should_force_portrait(false, true));

  puts("d1001_hot_state: all checks passed");
  return 0;
}
