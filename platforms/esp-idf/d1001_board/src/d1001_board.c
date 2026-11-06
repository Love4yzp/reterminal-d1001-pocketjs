#include "d1001_board.h"

#include <stddef.h>

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_check.h"
#include "esp_ldo_regulator.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gsl3670.h"
#include "jd9365.h"
#include "pca9535.h"
#include "sdkconfig.h"
#include "soc/pmu_reg.h"
#include "soc/soc.h"

#define D1001_TOUCH_SDA_GPIO 37
#define D1001_TOUCH_SCL_GPIO 38
#define D1001_SYSTEM_SDA_GPIO 20
#define D1001_SYSTEM_SCL_GPIO 21
#define D1001_DSI_LDO_CHANNEL 3
#define D1001_DSI_LDO_VOLTAGE_MV 2500

static const char *TAG = "d1001_board";
static esp_ldo_channel_handle_t dsi_ldo;

static esp_err_t init_i2c(i2c_master_bus_handle_t *touch_bus,
                          i2c_master_bus_handle_t *system_bus) {
  const i2c_master_bus_config_t touch_config = {
      .i2c_port = 0,
      .sda_io_num = D1001_TOUCH_SDA_GPIO,
      .scl_io_num = D1001_TOUCH_SCL_GPIO,
      .clk_source = I2C_CLK_SRC_DEFAULT,
  };
  const i2c_master_bus_config_t system_config = {
      .i2c_port = 1,
      .sda_io_num = D1001_SYSTEM_SDA_GPIO,
      .scl_io_num = D1001_SYSTEM_SCL_GPIO,
      .clk_source = I2C_CLK_SRC_DEFAULT,
  };
  ESP_RETURN_ON_ERROR(i2c_new_master_bus(&touch_config, touch_bus), TAG,
                      "I2C0");
  ESP_RETURN_ON_ERROR(i2c_new_master_bus(&system_config, system_bus), TAG,
                      "I2C1");
  return ESP_OK;
}

static esp_err_t init_power(void) {
  SET_PERI_REG_BITS(PMU_HP_ACTIVE_BIAS_REG, PMU_HP_ACTIVE_DCM_VSET, 26,
                    PMU_HP_ACTIVE_DCM_VSET_S);
  vTaskDelay(pdMS_TO_TICKS(1000));
  ESP_RETURN_ON_ERROR(d1001_pca9535_set_direction(0xffffU, true), TAG,
                      "PCA9535 output mode");
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_POWER_HOLD, true), TAG, "power hold");
  vTaskDelay(pdMS_TO_TICKS(50));
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_LCD_POWER |
                                  D1001_PCA9535_BACKLIGHT_POWER |
                                  D1001_PCA9535_LCD_RESET,
                              true),
      TAG, "panel power");
  vTaskDelay(pdMS_TO_TICKS(50));
  const esp_ldo_channel_config_t config = {
      .chan_id = D1001_DSI_LDO_CHANNEL,
      .voltage_mv = D1001_DSI_LDO_VOLTAGE_MV,
  };
  ESP_RETURN_ON_ERROR(esp_ldo_acquire_channel(&config, &dsi_ldo), TAG,
                      "LDO_VO3");
  return ESP_OK;
}

static esp_err_t init_backlight(void) {
  const ledc_timer_config_t timer = {
      .speed_mode = LEDC_LOW_SPEED_MODE,
      .duty_resolution = LEDC_TIMER_10_BIT,
      .timer_num = LEDC_TIMER_0,
      .freq_hz = 1000,
      .clk_cfg = LEDC_AUTO_CLK,
  };
  const ledc_channel_config_t channel = {
      .gpio_num = D1001_BACKLIGHT_GPIO,
      .speed_mode = LEDC_LOW_SPEED_MODE,
      .channel = LEDC_CHANNEL_0,
      .intr_type = LEDC_INTR_DISABLE,
      .timer_sel = LEDC_TIMER_0,
      .duty = 0,
      .hpoint = 0,
  };
  ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "backlight timer");
  ESP_RETURN_ON_ERROR(ledc_channel_config(&channel), TAG, "backlight channel");
  return ESP_OK;
}

/* Active-high channels on the 10-bit timer. Off=0 and on=20/8/50 follow Seeed
 * esp32_p4_re_terminal_d1001.c:115-117,1335-1352 at 5074d3b. */
#define D1001_RGB_OFF_DUTY 0U
#define D1001_RGB_RED_ON_DUTY 20U
#define D1001_RGB_GREEN_ON_DUTY 8U
#define D1001_RGB_BLUE_ON_DUTY 50U

static esp_err_t init_rgb(void) {
  const ledc_channel_config_t channels[] = {
      {
          .gpio_num = D1001_RGB_RED_GPIO,
          .speed_mode = LEDC_LOW_SPEED_MODE,
          .channel = LEDC_CHANNEL_1,
          .intr_type = LEDC_INTR_DISABLE,
          .timer_sel = LEDC_TIMER_0,
          .duty = D1001_RGB_OFF_DUTY,
          .hpoint = 0,
      },
      {
          .gpio_num = D1001_RGB_GREEN_GPIO,
          .speed_mode = LEDC_LOW_SPEED_MODE,
          .channel = LEDC_CHANNEL_2,
          .intr_type = LEDC_INTR_DISABLE,
          .timer_sel = LEDC_TIMER_0,
          .duty = D1001_RGB_OFF_DUTY,
          .hpoint = 0,
      },
      {
          .gpio_num = D1001_RGB_BLUE_GPIO,
          .speed_mode = LEDC_LOW_SPEED_MODE,
          .channel = LEDC_CHANNEL_3,
          .intr_type = LEDC_INTR_DISABLE,
          .timer_sel = LEDC_TIMER_0,
          .duty = D1001_RGB_OFF_DUTY,
          .hpoint = 0,
      },
  };
  for (size_t i = 0; i < sizeof channels / sizeof channels[0]; ++i)
    ESP_RETURN_ON_ERROR(ledc_channel_config(&channels[i]), TAG, "RGB channel");
  return ESP_OK;
}

static esp_err_t reset_panel(void) {
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_LCD_RESET, true), TAG, "reset high");
  vTaskDelay(pdMS_TO_TICKS(5));
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_LCD_RESET, false), TAG, "reset low");
  vTaskDelay(pdMS_TO_TICKS(10));
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_LCD_RESET, true), TAG, "reset release");
  vTaskDelay(pdMS_TO_TICKS(120));
  return ESP_OK;
}

esp_err_t d1001_board_backlight_set(uint32_t percent) {
  if (percent > 100U)
    return ESP_ERR_INVALID_ARG;
  const uint32_t duty = (1023U * percent) / 100U;
  ESP_RETURN_ON_ERROR(
      ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty), TAG, "brightness");
  ESP_RETURN_ON_ERROR(
      ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0), TAG, "apply brightness");
  return ESP_OK;
}

esp_err_t d1001_board_rgb_set_color(uint8_t red, uint8_t green, uint8_t blue) {
  const uint8_t levels[] = {red, green, blue};
  const ledc_channel_t channels[] = {LEDC_CHANNEL_1, LEDC_CHANNEL_2,
                                     LEDC_CHANNEL_3};
  const uint32_t on_duties[] = {D1001_RGB_RED_ON_DUTY, D1001_RGB_GREEN_ON_DUTY,
                                D1001_RGB_BLUE_ON_DUTY};
  uint32_t target_duties[] = {D1001_RGB_OFF_DUTY, D1001_RGB_OFF_DUTY,
                              D1001_RGB_OFF_DUTY};
  for (size_t i = 0; i < sizeof channels / sizeof channels[0]; ++i) {
    const uint32_t duty =
        (on_duties[i] * levels[i] + 127U) / 255U;
    ESP_RETURN_ON_ERROR(
        ledc_set_duty(LEDC_LOW_SPEED_MODE, channels[i], duty), TAG, "RGB duty");
    ESP_RETURN_ON_ERROR(ledc_update_duty(LEDC_LOW_SPEED_MODE, channels[i]), TAG,
                        "apply RGB duty");
    target_duties[i] = duty;
  }
  ESP_LOGI(TAG, "RGB enabled R=%u G=%u B=%u; target duty R=%u G=%u B=%u",
           (unsigned)(red != 0U), (unsigned)(green != 0U),
           (unsigned)(blue != 0U), (unsigned)target_duties[0],
           (unsigned)target_duties[1], (unsigned)target_duties[2]);
  return ESP_OK;
}

esp_err_t d1001_board_rgb_set(bool red, bool green, bool blue) {
  return d1001_board_rgb_set_color(red ? UINT8_MAX : 0U, green ? UINT8_MAX : 0U,
                                   blue ? UINT8_MAX : 0U);
}

esp_err_t d1001_board_init(d1001_board_handles *handles) {
  ESP_RETURN_ON_FALSE(handles != NULL, ESP_ERR_INVALID_ARG, TAG, "missing output");
  *handles = (d1001_board_handles){0};
  ESP_RETURN_ON_ERROR(init_i2c(&handles->touch_i2c, &handles->system_i2c), TAG,
                      "initialize I2C");
  ESP_RETURN_ON_ERROR(d1001_pca9535_init(handles->system_i2c), TAG,
                      "initialize PCA9535");
  ESP_RETURN_ON_ERROR(init_power(), TAG, "initialize board power");
  ESP_RETURN_ON_ERROR(init_backlight(), TAG, "initialize backlight");
  ESP_RETURN_ON_ERROR(init_rgb(), TAG, "initialize RGB LED");

  const esp_lcd_dsi_bus_config_t bus_config = {
      .bus_id = 0,
      .num_data_lanes = 2,
      .phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
      .lane_bit_rate_mbps = 1000,
  };
  ESP_RETURN_ON_ERROR(esp_lcd_new_dsi_bus(&bus_config, &handles->dsi_bus), TAG,
                      "DSI bus");
  const esp_lcd_dbi_io_config_t io_config = {
      .virtual_channel = 0,
      .lcd_cmd_bits = 8,
      .lcd_param_bits = 8,
  };
  ESP_RETURN_ON_ERROR(
      esp_lcd_new_panel_io_dbi(handles->dsi_bus, &io_config, &handles->panel_io),
      TAG, "DBI interface");
  const esp_lcd_dpi_panel_config_t dpi_config = {
      .dpi_clk_src = MIPI_DSI_DPI_CLK_SRC_DEFAULT,
      .dpi_clock_freq_mhz = 60,
      .virtual_channel = 0,
      .in_color_format = LCD_COLOR_FMT_RGB565,
      .out_color_format = LCD_COLOR_FMT_RGB565,
      .num_fbs = 1,
      .video_timing =
          {
              .h_size = D1001_PANEL_WIDTH,
              .v_size = D1001_PANEL_HEIGHT,
              .hsync_back_porch = 20,
              .hsync_pulse_width = 20,
              .hsync_front_porch = 40,
              .vsync_back_porch = 30,
              .vsync_pulse_width = 4,
              .vsync_front_porch = 30,
          },
  };
  ESP_RETURN_ON_ERROR(
      d1001_jd9365_create(handles->panel_io, handles->dsi_bus, &dpi_config,
                          &handles->panel),
      TAG, "JD9365");
  ESP_RETURN_ON_ERROR(reset_panel(), TAG, "reset panel");
  ESP_RETURN_ON_ERROR(esp_lcd_panel_init(handles->panel), TAG, "initialize panel");
  ESP_RETURN_ON_ERROR(esp_lcd_dpi_panel_enable_dma2d(handles->panel), TAG,
                      "enable DMA2D");
  void *framebuffer = NULL;
  ESP_RETURN_ON_ERROR(
      esp_lcd_dpi_panel_get_frame_buffer(handles->panel, 1, &framebuffer), TAG,
      "framebuffer");
  handles->framebuffer = framebuffer;
  ESP_RETURN_ON_ERROR(
      d1001_gsl3670_create(handles->touch_i2c,
                           (gpio_num_t)CONFIG_D1001_TOUCH_INT_GPIO,
                           &handles->touch),
      TAG, "GSL3670");
  ESP_LOGI(TAG, "800x1280 RGB565, two DSI lanes at 1000 Mbps");
  return ESP_OK;
}
