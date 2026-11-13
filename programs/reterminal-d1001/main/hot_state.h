#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  D1001_HOT_PHASE_RUNNING = 0,
  D1001_HOT_PHASE_STOPPED,
  D1001_HOT_PHASE_RESTARTING,
  D1001_HOT_PHASE_FAILED,
} d1001_hot_phase;

typedef enum {
  D1001_HOT_EVENT_STOP = 1,
  D1001_HOT_EVENT_WRITE_FAILED,
  D1001_HOT_EVENT_RESTART_BEGIN,
  D1001_HOT_EVENT_RESTART_OK,
  D1001_HOT_EVENT_RESTART_FAIL,
} d1001_hot_event;

/** Pure hot-push phase model: STOP is idempotent; a failed restart keeps the
 *  runtime stopped until an explicit later restart succeeds. */
static inline d1001_hot_phase d1001_hot_phase_apply(d1001_hot_phase phase,
                                                    d1001_hot_event event) {
  switch (event) {
  case D1001_HOT_EVENT_STOP:
    return D1001_HOT_PHASE_STOPPED;
  case D1001_HOT_EVENT_WRITE_FAILED:
    return D1001_HOT_PHASE_STOPPED;
  case D1001_HOT_EVENT_RESTART_BEGIN:
    return D1001_HOT_PHASE_RESTARTING;
  case D1001_HOT_EVENT_RESTART_OK:
    return D1001_HOT_PHASE_RUNNING;
  case D1001_HOT_EVENT_RESTART_FAIL:
    return D1001_HOT_PHASE_FAILED;
  }
  return phase;
}

static inline bool d1001_hot_phase_active(d1001_hot_phase phase) {
  return phase != D1001_HOT_PHASE_RUNNING;
}

/** Embedded fallback is portrait-only. */
static inline bool d1001_should_force_portrait(bool landscape,
                                                bool package_external) {
  return landscape && !package_external;
}

#ifdef __cplusplus
}
#endif
