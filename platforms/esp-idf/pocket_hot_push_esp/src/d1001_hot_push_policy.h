#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  D1001_HOT_PUSH_OK = 0,
  D1001_HOT_PUSH_WRITE_FAILED_RECOVERED,
  D1001_HOT_PUSH_WRITE_FAILED_UNRECOVERED,
  D1001_HOT_PUSH_RESTART_FAILED,
} d1001_hot_push_outcome;

/**
 * Restart is attempted after every successful stop, including a failed or
 * partial flash write. This maps the two step results to the HTTP outcome.
 */
d1001_hot_push_outcome d1001_hot_push_outcome_for(bool write_ok,
                                                 bool restart_ok);

/** Error code for a non-OK outcome; NULL for D1001_HOT_PUSH_OK. */
const char *d1001_hot_push_outcome_code(d1001_hot_push_outcome outcome);

#ifdef __cplusplus
}
#endif
