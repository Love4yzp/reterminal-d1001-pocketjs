#include "pocket/screen.h"

#include <string.h>

#include "driver/gpio.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "pocket/screen_geometry.h"
#include "pocket/screen_state.h"

#define D1001_SCREEN_TASK_STACK 4096U
#define D1001_SCREEN_POLL_MS 10U
#define D1001_SCREEN_DEBOUNCE_US 20000U

struct d1001_screen {
  const d1001_board_handles *board;
  d1001_screen_state state;
  SemaphoreHandle_t lock;
  TaskHandle_t task;
  float touch_x;
  float touch_y;
  bool cached_contact;
  bool cancelled_pending;
  bool rotation_swallow;
  bool landscape;
  d1001_screen_rotation_callback rotation_callback;
  void *rotation_context;
  bool button_candidate;
  bool button_stable;
  int64_t button_since_us;
  uint32_t saved_brightness;
};

static const char *TAG = "d1001_screen";
static d1001_screen screen;

static uint64_t now_ms(void) {
  return (uint64_t)(esp_timer_get_time() / 1000);
}

static void lock_screen(void) {
  xSemaphoreTake(screen.lock, portMAX_DELAY);
}

static void unlock_screen(void) {
  xSemaphoreGive(screen.lock);
}

static void apply_events(uint32_t events) {
  if ((events & D1001_SCREEN_EVENT_OFF) != 0U) {
    const uint32_t current = d1001_board_backlight_get();
    if (current != 0U)
      screen.saved_brightness = current;
    if (screen.saved_brightness == 0U)
      screen.saved_brightness = 100U;
    ESP_ERROR_CHECK(d1001_board_backlight_set(0));
    ESP_LOGI(TAG, "backlight=0 saved=%u", (unsigned)screen.saved_brightness);
  }
  if ((events & D1001_SCREEN_EVENT_WAKE) != 0U) {
    ESP_ERROR_CHECK(d1001_board_backlight_set(screen.saved_brightness));
    ESP_LOGI(TAG, "backlight=%u wake", (unsigned)screen.saved_brightness);
  }
  if ((events & D1001_SCREEN_EVENT_HOLD_FEEDBACK) != 0U)
    ESP_LOGI(TAG, "GPIO3 hold feedback");
  if ((events & D1001_SCREEN_EVENT_ROTATE) != 0U) {
    ESP_LOGI(TAG, "GPIO3 short click rotation requested");
    if (screen.rotation_callback != NULL)
      screen.rotation_callback(screen.rotation_context, !screen.landscape);
  }
  if ((events & D1001_SCREEN_EVENT_RESTART) != 0U) {
    ESP_LOGW(TAG, "restart reason=GPIO3 hold 3000ms");
    esp_restart();
  }
}

static void screen_main(void *unused) {
  (void)unused;
  TickType_t previous = xTaskGetTickCount();
  for (;;) {
    const int64_t sample_us = esp_timer_get_time();
    esp_err_t sample_error = esp_lcd_touch_read_data(screen.board->touch);
    esp_lcd_touch_point_data_t point = {0};
    uint8_t count = 0;
    if (sample_error == ESP_OK)
      sample_error = esp_lcd_touch_get_data(screen.board->touch, &point,
                                            &count, 1);
    const bool contact = sample_error == ESP_OK && count != 0U;

    const bool raw_button = gpio_get_level(GPIO_NUM_3) != 0;
    if (raw_button != screen.button_candidate) {
      screen.button_candidate = raw_button;
      screen.button_since_us = sample_us;
    }
    if (screen.button_stable != screen.button_candidate &&
        sample_us >= screen.button_since_us &&
        (uint64_t)(sample_us - screen.button_since_us) >=
            D1001_SCREEN_DEBOUNCE_US)
      screen.button_stable = screen.button_candidate;

    uint32_t events = 0;
    lock_screen();
    const bool was_cached_contact = screen.cached_contact;
    if (sample_error != ESP_OK && was_cached_contact)
      screen.cancelled_pending = true;
    if (!contact)
      screen.rotation_swallow = false;
    const bool contact_started = contact && !screen.state.contact_active;
    if (contact || screen.state.contact_active)
      events |= d1001_screen_state_touch(&screen.state, contact, now_ms());
    if (screen.button_stable != screen.state.pressed)
      events |= d1001_screen_state_button(&screen.state,
                                          screen.button_stable, now_ms());
    events |= d1001_screen_state_tick(&screen.state, now_ms());
    d1001_screen_map_touch(screen.landscape, point.x, point.y,
                           &screen.touch_x, &screen.touch_y);
    screen.cached_contact = contact && !screen.rotation_swallow &&
        !d1001_screen_state_touch_swallowed(&screen.state);
    if (contact_started)
      ESP_LOGI(TAG, "touch landscape=%u logical=%.1f,%.1f delivered=%u",
               (unsigned)screen.landscape, screen.touch_x, screen.touch_y,
               (unsigned)screen.cached_contact);
    unlock_screen();
    apply_events(events);
    vTaskDelayUntil(&previous, pdMS_TO_TICKS(D1001_SCREEN_POLL_MS));
  }
}

esp_err_t d1001_screen_start(const d1001_board_handles *board,
                             d1001_screen **out_screen) {
  if (board == NULL || out_screen == NULL)
    return ESP_ERR_INVALID_ARG;
  if (screen.task != NULL) {
    *out_screen = &screen;
    return ESP_OK;
  }
  memset(&screen, 0, sizeof screen);
  screen.board = board;
  screen.saved_brightness = 100U;
  d1001_screen_state_init(&screen.state, now_ms());
  const gpio_config_t button_gpio = {
      .pin_bit_mask = 1ULL << GPIO_NUM_3,
      .mode = GPIO_MODE_INPUT,
      .pull_up_en = 0,
      .pull_down_en = 0,
      .intr_type = GPIO_INTR_DISABLE,
  };
  esp_err_t result = gpio_config(&button_gpio);
  if (result != ESP_OK)
    return result;
  screen.lock = xSemaphoreCreateMutex();
  if (screen.lock == NULL)
    return ESP_ERR_NO_MEM;
  if (xTaskCreateWithCaps(screen_main, "d1001_screen", D1001_SCREEN_TASK_STACK,
                          NULL, 5, &screen.task,
                          MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) != pdPASS) {
    vSemaphoreDelete(screen.lock);
    memset(&screen, 0, sizeof screen);
    return ESP_ERR_NO_MEM;
  }
  *out_screen = &screen;
  return ESP_OK;
}

d1001_screen *d1001_screen_get(void) {
  return screen.task == NULL ? NULL : &screen;
}

bool d1001_screen_set_timeout_seconds(d1001_screen *target, uint32_t seconds) {
  if (target == NULL || target != &screen || target->task == NULL)
    return false;
  lock_screen();
  const bool accepted = d1001_screen_state_set_timeout(&target->state, seconds,
                                                       now_ms());
  unlock_screen();
  if (accepted)
    ESP_LOGI(TAG, "screen timeout=%u seconds", (unsigned)seconds);
  return accepted;
}

void d1001_screen_set_rotation_callback(d1001_screen *target,
                                        d1001_screen_rotation_callback callback,
                                        void *context) {
  if (target == NULL || target != &screen || target->task == NULL)
    return;
  lock_screen();
  target->rotation_callback = callback;
  target->rotation_context = context;
  unlock_screen();
}

bool d1001_screen_request_landscape(d1001_screen *target, bool landscape) {
  if (target == NULL || target != &screen || target->task == NULL)
    return false;
  lock_screen();
  d1001_screen_rotation_callback callback = target->rotation_callback;
  void *context = target->rotation_context;
  const bool changed = target->landscape != landscape;
  unlock_screen();
  if (changed && callback != NULL)
    callback(context, landscape);
  return true;
}

bool d1001_screen_landscape(const d1001_screen *target) {
  if (target == NULL || target != &screen || target->task == NULL)
    return false;
  lock_screen();
  const bool landscape = target->landscape;
  unlock_screen();
  return landscape;
}

void d1001_screen_set_landscape(d1001_screen *target, bool landscape) {
  if (target == NULL || target != &screen || target->task == NULL)
    return;
  lock_screen();
  if (target->cached_contact)
    target->cancelled_pending = true;
  target->cached_contact = false;
  target->rotation_swallow = target->state.contact_active;
  target->landscape = landscape;
  unlock_screen();
  ESP_LOGI(TAG, "orientation=%s", landscape ? "landscape" : "portrait");
}

static uint32_t touch_classes(void *context) {
  (void)context;
  return POCKET_INPUT_CLASS_CONTACT;
}

static int32_t touch_poll(void *context, pocket_input_frame_builder *builder) {
  d1001_screen *target = context;
  if (target == NULL || builder == NULL ||
      builder->struct_size < sizeof(*builder) || builder->append == NULL)
    return POCKET_STATUS_INVALID;
  lock_screen();
  const bool contact = target->cached_contact;
  const bool cancelled = target->cancelled_pending;
  target->cancelled_pending = false;
  const float x = target->touch_x;
  const float y = target->touch_y;
  unlock_screen();
  const pocket_contact point = {
      .struct_size = sizeof(point),
      .surface = POCKET_DISPLAY_ROLE_PRIMARY,
      .id = 0,
      .x = x,
      .y = y,
  };
  const pocket_cancelled_contact cancelled_point = {
      .struct_size = sizeof(cancelled_point),
      .surface = POCKET_DISPLAY_ROLE_PRIMARY,
      .id = 0,
  };
  const pocket_input_frame frame = {
      .struct_size = sizeof(frame),
      .contacts = contact ? &point : NULL,
      .contact_count = contact ? 1U : 0U,
      .cancelled = cancelled ? &cancelled_point : NULL,
      .cancelled_count = cancelled ? 1U : 0U,
  };
  return builder->append(builder->context, &frame);
}

static uint32_t button_classes(void *context) {
  (void)context;
  return POCKET_INPUT_CLASS_BUTTONS;
}

static int32_t button_poll(void *context, pocket_input_frame_builder *builder) {
  d1001_screen *target = context;
  if (target == NULL || builder == NULL ||
      builder->struct_size < sizeof(*builder) || builder->append == NULL)
    return POCKET_STATUS_INVALID;
  lock_screen();
  const bool pressed = target->button_stable;
  unlock_screen();
  const pocket_input_frame frame = {
      .struct_size = sizeof(frame),
      .buttons = pressed ? POCKET_BUTTON_CIRCLE : 0U,
  };
  return builder->append(builder->context, &frame);
}

static const pocket_input_source_v1 TOUCH_VTABLE = {
    .struct_size = sizeof(TOUCH_VTABLE),
    .classes = touch_classes,
    .poll = touch_poll,
};
static const pocket_input_source_v1 BUTTON_VTABLE = {
    .struct_size = sizeof(BUTTON_VTABLE),
    .classes = button_classes,
    .poll = button_poll,
};

const pocket_input_source_v1 *d1001_screen_touch_vtable(void) {
  return &TOUCH_VTABLE;
}

const pocket_input_source_v1 *d1001_screen_button_vtable(void) {
  return &BUTTON_VTABLE;
}
