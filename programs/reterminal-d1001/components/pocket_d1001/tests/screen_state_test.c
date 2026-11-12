#include "pocket/screen_geometry.h"
#include "pocket/screen_state.h"

#include <stdio.h>
#include <stdlib.h>

#define CHECK(condition) do { \
  if (!(condition)) { \
    fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #condition); \
    exit(1); \
  } \
} while (0)

static d1001_screen_state state_at(uint64_t now) {
  d1001_screen_state state;
  d1001_screen_state_init(&state, now);
  return state;
}

static void test_timeout_choices_and_reset(void) {
  const uint32_t choices[] = {30, 60, 300};
  for (size_t i = 0; i < sizeof choices / sizeof choices[0]; ++i) {
    d1001_screen_state state = state_at(0);
    CHECK(d1001_screen_state_set_timeout(&state, choices[i], 0));
    CHECK(d1001_screen_state_tick(&state, choices[i] * 1000U - 1U) == 0);
    CHECK(d1001_screen_state_touch(&state, true, choices[i] * 1000U - 1U) == 0);
    CHECK(d1001_screen_state_touch(&state, false, choices[i] * 1000U) == 0);
    CHECK(d1001_screen_state_tick(&state, choices[i] * 2000U - 1U) == 0);
    CHECK(d1001_screen_state_tick(&state, choices[i] * 2000U) ==
          D1001_SCREEN_EVENT_OFF);
  }
  d1001_screen_state state = state_at(0);
  CHECK(d1001_screen_state_set_timeout(&state, 0, 0));
  CHECK(d1001_screen_state_tick(&state, 1000000) == 0);
  CHECK(!d1001_screen_state_set_timeout(&state, 45, 1000000));
}

static void test_wake_and_swallow(void) {
  d1001_screen_state state = state_at(0);
  CHECK(d1001_screen_state_tick(&state, 60000) == D1001_SCREEN_EVENT_OFF);
  CHECK(d1001_screen_state_touch_swallowed(&state));
  CHECK(d1001_screen_state_touch(&state, true, 61000) == D1001_SCREEN_EVENT_WAKE);
  CHECK(d1001_screen_state_touch_swallowed(&state));
  CHECK(d1001_screen_state_touch(&state, true, 62000) == 0);
  CHECK(d1001_screen_state_touch_swallowed(&state));
  CHECK(d1001_screen_state_touch(&state, false, 63000) == 0);
  CHECK(!d1001_screen_state_touch_swallowed(&state));
  CHECK(d1001_screen_state_touch(&state, true, 64000) == 0);
  CHECK(!d1001_screen_state_touch_swallowed(&state));
}

static void test_short_press_boundaries_and_double_window(void) {
  d1001_screen_state state = state_at(0);
  CHECK(d1001_screen_state_button(&state, true, 0) == 0);
  CHECK(d1001_screen_state_button(&state, false, 599) == 0);
  CHECK(d1001_screen_state_tick(&state, 949) == 0);
  CHECK(d1001_screen_state_tick(&state, 950) == D1001_SCREEN_EVENT_ROTATE);
  CHECK(!state.screen_off);

  state = state_at(0);
  CHECK(d1001_screen_state_button(&state, true, 0) == 0);
  CHECK(d1001_screen_state_button(&state, false, 600) == 0);
  CHECK(d1001_screen_state_tick(&state, 1000) == 0);
  CHECK(!state.screen_off);
  CHECK(!state.awaiting_second);

  state = state_at(0);
  CHECK(d1001_screen_state_button(&state, true, 0) == 0);
  CHECK(d1001_screen_state_button(&state, false, 100) == 0);
  CHECK(d1001_screen_state_button(&state, true, 450) == 0);
  CHECK(d1001_screen_state_button(&state, false, 500) == D1001_SCREEN_EVENT_OFF);
  CHECK(state.screen_off);

  state = state_at(0);
  CHECK(d1001_screen_state_button(&state, true, 0) == 0);
  CHECK(d1001_screen_state_button(&state, false, 100) == 0);
  CHECK(d1001_screen_state_button(&state, true, 451) == D1001_SCREEN_EVENT_ROTATE);
  CHECK(d1001_screen_state_button(&state, false, 550) == 0);
  CHECK(d1001_screen_state_tick(&state, 901) == D1001_SCREEN_EVENT_ROTATE);
}

static void test_hold_feedback_cancel_and_restart_without_guest(void) {
  d1001_screen_state state = state_at(0);
  CHECK(d1001_screen_state_tick(&state, 60000) == D1001_SCREEN_EVENT_OFF);
  CHECK(d1001_screen_state_button(&state, true, 61000) == 0);
  CHECK(d1001_screen_state_tick(&state, 61999) == 0);
  CHECK(d1001_screen_state_tick(&state, 62000) ==
        (D1001_SCREEN_EVENT_HOLD_FEEDBACK | D1001_SCREEN_EVENT_WAKE));
  CHECK(d1001_screen_state_button(&state, false, 62500) == 0);
  CHECK(d1001_screen_state_tick(&state, 63000) == 0);
  CHECK(!state.awaiting_second);

  CHECK(d1001_screen_state_button(&state, true, 70000) == 0);
  CHECK(d1001_screen_state_tick(&state, 71000) == D1001_SCREEN_EVENT_HOLD_FEEDBACK);
  CHECK(d1001_screen_state_tick(&state, 72999) == 0);
  CHECK(d1001_screen_state_tick(&state, 73000) == D1001_SCREEN_EVENT_RESTART);
  CHECK(d1001_screen_state_button(&state, false, 73010) == 0);
  CHECK(d1001_screen_state_tick(&state, 74000) == 0);
}

static void test_rotation_geometry_and_wake(void) {
  CHECK(d1001_screen_logical_width(false) == 400);
  CHECK(d1001_screen_logical_height(false) == 640);
  CHECK(d1001_screen_logical_width(true) == 640);
  CHECK(d1001_screen_logical_height(true) == 400);
  CHECK(d1001_screen_raster_width(true) == 1280);
  CHECK(d1001_screen_raster_height(true) == 800);
  CHECK(d1001_screen_raster_width(false) * d1001_screen_strip_rows(false) * 4U <=
        128U * 1024U);
  CHECK(d1001_screen_raster_width(true) * d1001_screen_strip_rows(true) * 4U <=
        128U * 1024U);
  CHECK(d1001_screen_raster_width(false) * d1001_screen_strip_rows(false) ==
        d1001_screen_raster_width(true) * d1001_screen_strip_rows(true));

  float x = 0;
  float y = 0;
  d1001_screen_map_touch(false, 799, 1279, &x, &y);
  CHECK(x == 399.0f && y == 639.0f);
  d1001_screen_map_touch(true, 0, 1279, &x, &y);
  CHECK(x == 0.0f && y == 0.0f);
  d1001_screen_map_touch(true, 799, 0, &x, &y);
  CHECK(x == 639.0f && y == 399.0f);

  d1001_screen_state state = state_at(0);
  CHECK(d1001_screen_state_tick(&state, 60000) == D1001_SCREEN_EVENT_OFF);
  CHECK(d1001_screen_state_button(&state, true, 61000) == 0);
  CHECK(d1001_screen_state_button(&state, false, 61099) == 0);
  CHECK(d1001_screen_state_button(&state, true, 61200) == 0);
  CHECK(d1001_screen_state_button(&state, false, 61299) == D1001_SCREEN_EVENT_WAKE);
}

int main(void) {
  test_timeout_choices_and_reset();
  test_wake_and_swallow();
  test_short_press_boundaries_and_double_window();
  test_hold_feedback_cancel_and_restart_without_guest();
  test_rotation_geometry_and_wake();
  puts("screen_state: all checks passed");
  return 0;
}
