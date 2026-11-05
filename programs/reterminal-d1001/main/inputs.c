#include "inputs.h"

#include "esp_check.h"

esp_err_t d1001_inputs_init(const d1001_board_handles *board,
                            pocket_runtime *runtime, d1001_inputs *inputs) {
  ESP_RETURN_ON_FALSE(board != NULL && runtime != NULL && inputs != NULL,
                      ESP_ERR_INVALID_ARG, "d1001_inputs", "invalid arguments");
  const pocket_input_touch_config touch_config = {
      .struct_size = sizeof(touch_config),
      .touch = board->touch,
      .surface = POCKET_DISPLAY_ROLE_PRIMARY,
      .scale_x = 0.5f,
      .scale_y = 0.5f,
  };
  inputs->touch = pocket_input_touch_create(&touch_config);
  ESP_RETURN_ON_FALSE(inputs->touch != NULL, ESP_ERR_NO_MEM, "d1001_inputs",
                      "touch adapter");
  ESP_RETURN_ON_FALSE(
      pocket_runtime_add_input_source(runtime, pocket_input_touch_vtable(),
                                      inputs->touch) == POCKET_STATUS_OK,
      ESP_FAIL, "d1001_inputs", "register touch");

  const gpio_config_t button_gpio = {
      .pin_bit_mask = 1ULL << GPIO_NUM_3,
      .mode = GPIO_MODE_INPUT,
      .pull_up_en = 0,
      .pull_down_en = 0,
      .intr_type = GPIO_INTR_DISABLE,
  };
  ESP_RETURN_ON_ERROR(gpio_config(&button_gpio), "d1001_inputs", "GPIO3");
  const pocket_gpio_button button = {
      .pin = GPIO_NUM_3,
      .buttons = POCKET_BUTTON_CIRCLE,
      .active_low = false,
  };
  const pocket_input_gpio_config button_config = {
      .struct_size = sizeof(button_config),
      .gpio = &button,
      .gpio_count = 1,
      .debounce_us = 20000,
  };
  inputs->button = pocket_input_gpio_create(&button_config);
  ESP_RETURN_ON_FALSE(inputs->button != NULL, ESP_ERR_NO_MEM, "d1001_inputs",
                      "button adapter");
  ESP_RETURN_ON_FALSE(
      pocket_runtime_add_input_source(runtime, pocket_input_gpio_vtable(),
                                      inputs->button) == POCKET_STATUS_OK,
      ESP_FAIL, "d1001_inputs", "register button");
  return ESP_OK;
}
