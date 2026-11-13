#include "d1001_hot_push_policy.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition) do { \
  if (!(condition)) { \
    fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #condition); \
    exit(1); \
  } \
} while (0)

int main(void) {
  CHECK(d1001_hot_push_outcome_for(true, true) == D1001_HOT_PUSH_OK);
  CHECK(d1001_hot_push_outcome_code(D1001_HOT_PUSH_OK) == NULL);

  CHECK(d1001_hot_push_outcome_for(false, true) ==
        D1001_HOT_PUSH_WRITE_FAILED_RECOVERED);
  CHECK(strcmp(d1001_hot_push_outcome_code(
                   D1001_HOT_PUSH_WRITE_FAILED_RECOVERED),
               "write_failed") == 0);

  CHECK(d1001_hot_push_outcome_for(false, false) ==
        D1001_HOT_PUSH_WRITE_FAILED_UNRECOVERED);
  CHECK(strcmp(d1001_hot_push_outcome_code(
                   D1001_HOT_PUSH_WRITE_FAILED_UNRECOVERED),
               "write_failed_restart_failed") == 0);

  CHECK(d1001_hot_push_outcome_for(true, false) ==
        D1001_HOT_PUSH_RESTART_FAILED);
  CHECK(strcmp(d1001_hot_push_outcome_code(D1001_HOT_PUSH_RESTART_FAILED),
               "restart_failed") == 0);

  puts("d1001_hot_push_policy: all checks passed");
  return 0;
}
