#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_SCREEN_SHORT_PRESS_MS 600U
#define D1001_SCREEN_DOUBLE_WINDOW_MS 350U
#define D1001_SCREEN_HOLD_FEEDBACK_MS 1000U
#define D1001_SCREEN_RESTART_MS 3000U

enum {
  D1001_SCREEN_EVENT_OFF = 1U << 0,
  D1001_SCREEN_EVENT_WAKE = 1U << 1,
  D1001_SCREEN_EVENT_ROTATE = 1U << 2,
  D1001_SCREEN_EVENT_HOLD_FEEDBACK = 1U << 3,
  D1001_SCREEN_EVENT_RESTART = 1U << 4,
};

typedef struct {
  uint32_t timeout_seconds;
  uint64_t last_activity_ms;
  uint64_t press_started_ms;
  uint64_t first_release_ms;
  bool screen_off;
  bool pressed;
  bool awaiting_second;
  bool double_candidate;
  bool hold_reported;
  bool restart_reported;
  bool contact_active;
  bool swallow_touch;
} d1001_screen_state;

void d1001_screen_state_init(d1001_screen_state *state, uint64_t now_ms);
bool d1001_screen_state_set_timeout(d1001_screen_state *state, uint32_t seconds,
                                    uint64_t now_ms);
uint32_t d1001_screen_state_button(d1001_screen_state *state, bool pressed,
                                   uint64_t now_ms);
uint32_t d1001_screen_state_touch(d1001_screen_state *state, bool active,
                                  uint64_t now_ms);
uint32_t d1001_screen_state_tick(d1001_screen_state *state, uint64_t now_ms);
bool d1001_screen_state_touch_swallowed(const d1001_screen_state *state);

#ifdef __cplusplus
}
#endif
