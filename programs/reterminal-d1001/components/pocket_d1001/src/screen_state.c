#include "pocket/screen_state.h"

#include <string.h>

static uint32_t set_screen(d1001_screen_state *state, bool off) {
  if (state->screen_off == off)
    return 0;
  state->screen_off = off;
  if (state->contact_active)
    state->swallow_touch = true;
  return off ? D1001_SCREEN_EVENT_OFF : D1001_SCREEN_EVENT_WAKE;
}

void d1001_screen_state_init(d1001_screen_state *state, uint64_t now_ms) {
  memset(state, 0, sizeof(*state));
  state->timeout_seconds = 60;
  state->last_activity_ms = now_ms;
}

bool d1001_screen_state_set_timeout(d1001_screen_state *state, uint32_t seconds,
                                    uint64_t now_ms) {
  if (seconds != 0 && seconds != 30 && seconds != 60 && seconds != 300)
    return false;
  state->timeout_seconds = seconds;
  state->last_activity_ms = now_ms;
  return true;
}

uint32_t d1001_screen_state_button(d1001_screen_state *state, bool pressed,
                                   uint64_t now_ms) {
  state->last_activity_ms = now_ms;
  if (pressed == state->pressed)
    return 0;
  if (pressed) {
    uint32_t events = 0;
    state->double_candidate = state->awaiting_second &&
        now_ms >= state->first_release_ms &&
        now_ms - state->first_release_ms <= D1001_SCREEN_DOUBLE_WINDOW_MS;
    if (state->awaiting_second && !state->double_candidate)
      events = D1001_SCREEN_EVENT_ROTATE | set_screen(state, false);
    state->awaiting_second = false;
    state->pressed = true;
    state->press_started_ms = now_ms;
    state->hold_reported = false;
    state->restart_reported = false;
    return events;
  }

  state->pressed = false;
  const uint64_t duration = now_ms >= state->press_started_ms
                                ? now_ms - state->press_started_ms
                                : 0;
  const bool was_double = state->double_candidate;
  state->double_candidate = false;
  state->awaiting_second = false;
  if (state->restart_reported || duration >= D1001_SCREEN_SHORT_PRESS_MS)
    return 0;
  if (was_double)
    return set_screen(state, !state->screen_off);
  state->awaiting_second = true;
  state->first_release_ms = now_ms;
  return 0;
}

uint32_t d1001_screen_state_touch(d1001_screen_state *state, bool active,
                                  uint64_t now_ms) {
  state->last_activity_ms = now_ms;
  state->contact_active = active;
  if (!active) {
    state->swallow_touch = false;
    return 0;
  }
  if (state->screen_off) {
    state->swallow_touch = true;
    return set_screen(state, false);
  }
  return 0;
}

uint32_t d1001_screen_state_tick(d1001_screen_state *state, uint64_t now_ms) {
  uint32_t events = 0;
  if (state->pressed) {
    state->last_activity_ms = now_ms;
    const uint64_t duration = now_ms >= state->press_started_ms
                                  ? now_ms - state->press_started_ms
                                  : 0;
    if (duration >= D1001_SCREEN_HOLD_FEEDBACK_MS && !state->hold_reported) {
      state->hold_reported = true;
      events |= D1001_SCREEN_EVENT_HOLD_FEEDBACK | set_screen(state, false);
    }
    if (duration >= D1001_SCREEN_RESTART_MS && !state->restart_reported) {
      state->restart_reported = true;
      events |= D1001_SCREEN_EVENT_RESTART;
    }
  }
  if (state->awaiting_second && now_ms > state->first_release_ms &&
      now_ms - state->first_release_ms > D1001_SCREEN_DOUBLE_WINDOW_MS) {
    state->awaiting_second = false;
    events |= D1001_SCREEN_EVENT_ROTATE | set_screen(state, false);
  }
  if (!state->screen_off && state->timeout_seconds != 0 &&
      now_ms >= state->last_activity_ms &&
      now_ms - state->last_activity_ms >=
          (uint64_t)state->timeout_seconds * 1000U)
    events |= set_screen(state, true);
  return events;
}

bool d1001_screen_state_touch_swallowed(const d1001_screen_state *state) {
  return state->screen_off || state->swallow_touch;
}
