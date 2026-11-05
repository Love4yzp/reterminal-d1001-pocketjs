/*
 * JD9365 initialization derived from Seeed-Studio/reTerminal-D1001,
 * components/esp_lcd_jd9365_8 (Apache-2.0).
 */
#include "jd9365.h"

#include <stdlib.h>

#include "esp_check.h"
#include "esp_lcd_panel_commands.h"
#include "esp_lcd_panel_interface.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

typedef struct {
  uint8_t command;
  const void *data;
  size_t size;
  uint32_t delay_ms;
} jd9365_command;

typedef struct {
  esp_lcd_panel_io_handle_t io;
  esp_err_t (*del)(esp_lcd_panel_t *panel);
  esp_err_t (*init)(esp_lcd_panel_t *panel);
} jd9365_panel;

static const char *TAG = "d1001_jd9365";

// clang-format off
static const jd9365_command INIT_COMMANDS[] = {
    {0x11, (uint8_t[]){0x00}, 1, 500},
    {0xe0, (uint8_t[]){0x00}, 1, 0},
    {0xe1, (uint8_t[]){0x93}, 1, 0},
    {0xe2, (uint8_t[]){0x65}, 1, 0},
    {0xe3, (uint8_t[]){0xf8}, 1, 0},
    {0x80, (uint8_t[]){0x01}, 1, 0},
    {0xe0, (uint8_t[]){0x00}, 1, 0},
    {0x29, (uint8_t[]){0x00}, 1, 50},
};
// clang-format on

static esp_err_t jd9365_del(esp_lcd_panel_t *panel) {
  jd9365_panel *jd9365 = panel->user_data;
  const esp_err_t result = jd9365->del(panel);
  free(jd9365);
  return result;
}

static esp_err_t jd9365_init(esp_lcd_panel_t *panel) {
  jd9365_panel *jd9365 = panel->user_data;
  uint8_t id[3] = {0};
  ESP_RETURN_ON_ERROR(esp_lcd_panel_io_rx_param(jd9365->io, 0x04, id, 3), TAG,
                      "read panel ID");
  ESP_LOGI(TAG, "panel ID: %02x %02x %02x", id[0], id[1], id[2]);
  const uint8_t page = 0x00;
  const uint8_t color_mode = 0x55;
  const uint8_t lanes = 0x01;
  ESP_RETURN_ON_ERROR(
      esp_lcd_panel_io_tx_param(jd9365->io, 0xe0, &page, 1), TAG, "user page");
  ESP_RETURN_ON_ERROR(
      esp_lcd_panel_io_tx_param(jd9365->io, LCD_CMD_MADCTL, &(uint8_t){0}, 1),
      TAG, "RGB order");
  ESP_RETURN_ON_ERROR(
      esp_lcd_panel_io_tx_param(jd9365->io, LCD_CMD_COLMOD, &color_mode, 1),
      TAG, "RGB565");
  ESP_RETURN_ON_ERROR(
      esp_lcd_panel_io_tx_param(jd9365->io, 0x80, &lanes, 1), TAG, "two lanes");
  for (size_t i = 0; i < sizeof(INIT_COMMANDS) / sizeof(INIT_COMMANDS[0]); ++i) {
    const jd9365_command *command = &INIT_COMMANDS[i];
    ESP_RETURN_ON_ERROR(esp_lcd_panel_io_tx_param(jd9365->io, command->command,
                                                  command->data, command->size),
                        TAG, "init command %02x", command->command);
    if (command->delay_ms != 0U)
      vTaskDelay(pdMS_TO_TICKS(command->delay_ms));
  }
  return jd9365->init(panel);
}

static esp_err_t jd9365_disp_on_off(esp_lcd_panel_t *panel, bool on) {
  const jd9365_panel *jd9365 = panel->user_data;
  return esp_lcd_panel_io_tx_param(jd9365->io, on ? LCD_CMD_DISPON : LCD_CMD_DISPOFF,
                                   NULL, 0);
}

esp_err_t d1001_jd9365_create(esp_lcd_panel_io_handle_t io,
                              esp_lcd_dsi_bus_handle_t dsi_bus,
                              const esp_lcd_dpi_panel_config_t *dpi_config,
                              esp_lcd_panel_handle_t *out_panel) {
  ESP_RETURN_ON_FALSE(io != NULL && dsi_bus != NULL && dpi_config != NULL &&
                          out_panel != NULL,
                      ESP_ERR_INVALID_ARG, TAG, "invalid arguments");
  esp_lcd_panel_handle_t panel = NULL;
  ESP_RETURN_ON_ERROR(esp_lcd_new_panel_dpi(dsi_bus, dpi_config, &panel), TAG,
                      "create DPI panel");
  jd9365_panel *jd9365 = calloc(1, sizeof(*jd9365));
  if (jd9365 == NULL) {
    esp_lcd_panel_del(panel);
    return ESP_ERR_NO_MEM;
  }
  jd9365->io = io;
  jd9365->del = panel->del;
  jd9365->init = panel->init;
  panel->del = jd9365_del;
  panel->init = jd9365_init;
  panel->disp_on_off = jd9365_disp_on_off;
  panel->user_data = jd9365;
  *out_panel = panel;
  return ESP_OK;
}
