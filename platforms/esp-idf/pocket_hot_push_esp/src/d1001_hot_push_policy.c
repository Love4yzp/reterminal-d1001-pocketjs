#include "d1001_hot_push_policy.h"

#include <stddef.h>

d1001_hot_push_outcome d1001_hot_push_outcome_for(bool write_ok,
                                                 bool restart_ok) {
  if (write_ok && restart_ok)
    return D1001_HOT_PUSH_OK;
  if (!write_ok && restart_ok)
    return D1001_HOT_PUSH_WRITE_FAILED_RECOVERED;
  if (!write_ok && !restart_ok)
    return D1001_HOT_PUSH_WRITE_FAILED_UNRECOVERED;
  return D1001_HOT_PUSH_RESTART_FAILED;
}

const char *d1001_hot_push_outcome_code(d1001_hot_push_outcome outcome) {
  switch (outcome) {
  case D1001_HOT_PUSH_OK:
    return NULL;
  case D1001_HOT_PUSH_WRITE_FAILED_RECOVERED:
    return "write_failed";
  case D1001_HOT_PUSH_WRITE_FAILED_UNRECOVERED:
    return "write_failed_restart_failed";
  case D1001_HOT_PUSH_RESTART_FAILED:
    return "restart_failed";
  }
  return "internal_error";
}
