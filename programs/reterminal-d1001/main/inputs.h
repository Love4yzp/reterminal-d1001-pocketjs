#pragma once

#include "d1001_board.h"
#include "esp_err.h"
#include "pocket/input_gpio.h"
#include "pocket/input_touch.h"
#include "pocket_runtime.h"

typedef struct {
  pocket_input_touch *touch;
  pocket_input_gpio *button;
} d1001_inputs;

esp_err_t d1001_inputs_init(const d1001_board_handles *board,
                            pocket_runtime *runtime, d1001_inputs *inputs);
