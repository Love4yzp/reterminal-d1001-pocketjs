#include "wifi_stability.h"

#include <stdio.h>
#include <stdlib.h>

#define CHECK(condition) do {                                          \
  if (!(condition)) {                                                  \
    fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__,          \
            #condition);                                               \
    exit(1);                                                           \
  }                                                                    \
} while (0)

static const int64_t SECOND = 1000LL * 1000LL;

static void test_unstable_window(void) {
  d1001_wifi_stability stability;
  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 0));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 30 * SECOND));
  CHECK(d1001_wifi_stability_note_disconnect(&stability, 119 * SECOND));

  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 0));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 60 * SECOND));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 121 * SECOND));
  CHECK(d1001_wifi_stability_note_disconnect(&stability, 122 * SECOND));

  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 0));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 60 * SECOND));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 200 * SECOND));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 201 * SECOND));
  CHECK(d1001_wifi_stability_note_disconnect(&stability, 202 * SECOND));

  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 0));
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 90 * SECOND));
  CHECK(d1001_wifi_stability_note_disconnect(&stability, 120 * SECOND));

  d1001_wifi_stability_reset_episode(&stability);
  CHECK(!d1001_wifi_stability_note_disconnect(&stability, 200 * SECOND));
}

static void test_weak_link_timer_and_block(void) {
  d1001_wifi_stability stability;
  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 0, -85, -82, true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 59 * SECOND, -85, -82,
                                        true));
  CHECK(d1001_wifi_stability_note_rssi(&stability, 60 * SECOND, -85, -82,
                                       true));

  CHECK(!d1001_wifi_stability_note_rssi(&stability, 61 * SECOND, -85, -82,
                                        true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 359 * SECOND, -85, -82,
                                        true));
  CHECK(d1001_wifi_stability_note_rssi(&stability, 360 * SECOND, -85, -82,
                                       true));
}

static void test_weak_link_recovery_and_gate(void) {
  d1001_wifi_stability stability;
  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 0, -85, -82, true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 10 * SECOND, -70, -82,
                                        true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 20 * SECOND, -85, -82,
                                        true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 79 * SECOND, -85, -82,
                                        true));
  CHECK(d1001_wifi_stability_note_rssi(&stability, 80 * SECOND, -85, -82,
                                       true));

  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 0, -90, -82, false));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 61 * SECOND, -90, -82,
                                        false));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 62 * SECOND, -90, -82,
                                        true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 121 * SECOND, -90, -82,
                                        true));
  CHECK(d1001_wifi_stability_note_rssi(&stability, 122 * SECOND, -90, -82,
                                       true));

  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 0, -82, -82, true));
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 61 * SECOND, -81, -82,
                                        true));
}

static void test_connection_resets_weak_timer(void) {
  d1001_wifi_stability stability;
  d1001_wifi_stability_init(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 0, -90, -82, true));
  d1001_wifi_stability_disconnected(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 30 * SECOND, -90, -82,
                                        true));
  d1001_wifi_stability_connected(&stability);
  CHECK(!d1001_wifi_stability_note_rssi(&stability, 60 * SECOND, -90, -82,
                                        true));
  CHECK(d1001_wifi_stability_note_rssi(&stability, 120 * SECOND, -90, -82,
                                       true));
}

int main(void) {
  test_unstable_window();
  test_weak_link_timer_and_block();
  test_weak_link_recovery_and_gate();
  test_connection_resets_weak_timer();
  printf("wifi_stability: all checks passed\n");
  return 0;
}
