#include "inputs.h"

#include "esp_check.h"
#include "pocket/screen.h"

esp_err_t d1001_inputs_init(const d1001_board_handles *board,
                            pocket_runtime *runtime, d1001_inputs *inputs) {
  ESP_RETURN_ON_FALSE(board != NULL && runtime != NULL && inputs != NULL,
                      ESP_ERR_INVALID_ARG, "d1001_inputs", "invalid arguments");
  ESP_RETURN_ON_ERROR(d1001_screen_start(board, &inputs->screen),
                      "d1001_inputs", "native screen input");
  ESP_RETURN_ON_FALSE(
      pocket_runtime_add_input_source(runtime, d1001_screen_touch_vtable(),
                                      inputs->screen) == POCKET_STATUS_OK,
      ESP_FAIL, "d1001_inputs", "register touch");
  ESP_RETURN_ON_FALSE(
      pocket_runtime_add_input_source(runtime, d1001_screen_button_vtable(),
                                      inputs->screen) == POCKET_STATUS_OK,
      ESP_FAIL, "d1001_inputs", "register button");
  return ESP_OK;
}
