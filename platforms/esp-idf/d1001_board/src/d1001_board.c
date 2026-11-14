#include "d1001_board.h"

#include <stddef.h>

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_check.h"
#include "esp_ldo_regulator.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
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
static uint32_t backlight_percent;
static StaticSemaphore_t ledc_lock_storage;
static SemaphoreHandle_t ledc_lock;
static portMUX_TYPE ledc_lock_guard = portMUX_INITIALIZER_UNLOCKED;
static bool board_ready;
static bool cleanup_pending;
static bool ledc_timer_ready;
static bool ledc_fade_ready;
static bool panel_dma2d_ready;
static uint32_t ledc_channels;
static d1001_board_handles resources;

static esp_err_t take_ledc_lock(void) {
  /* Never delete this static mutex: callers may already be waiting on it. */
  portENTER_CRITICAL(&ledc_lock_guard);
  if (ledc_lock == NULL)
    ledc_lock = xSemaphoreCreateMutexStatic(&ledc_lock_storage);
  portEXIT_CRITICAL(&ledc_lock_guard);
  return xSemaphoreTake(ledc_lock, portMAX_DELAY) == pdTRUE
             ? ESP_OK
             : ESP_ERR_INVALID_STATE;
}

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
  /* The expander powers up with P13 high; keep the speaker amp quiet until
   * pocket_audio enables it for the first playing stream. */
  ESP_RETURN_ON_ERROR(
      d1001_pca9535_set_level(D1001_PCA9535_PA_ENABLE, false), TAG,
      "disable speaker amplifier");
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
      .timer_sel = LEDC_TIMER_0,
      .duty = 0,
      .hpoint = 0,
  };
  ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "backlight timer");
  ledc_timer_ready = true;
  /* The IDF thread-safe duty API requires the fade service, even for steps. */
  ESP_RETURN_ON_ERROR(ledc_fade_func_install(0), TAG, "LEDC fade service");
  ledc_fade_ready = true;
  ESP_RETURN_ON_ERROR(ledc_channel_config(&channel), TAG, "backlight channel");
  ledc_channels |= 1U << LEDC_CHANNEL_0;
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
          .timer_sel = LEDC_TIMER_0,
          .duty = D1001_RGB_OFF_DUTY,
          .hpoint = 0,
      },
      {
          .gpio_num = D1001_RGB_GREEN_GPIO,
          .speed_mode = LEDC_LOW_SPEED_MODE,
          .channel = LEDC_CHANNEL_2,
          .timer_sel = LEDC_TIMER_0,
          .duty = D1001_RGB_OFF_DUTY,
          .hpoint = 0,
      },
      {
          .gpio_num = D1001_RGB_BLUE_GPIO,
          .speed_mode = LEDC_LOW_SPEED_MODE,
          .channel = LEDC_CHANNEL_3,
          .timer_sel = LEDC_TIMER_0,
          .duty = D1001_RGB_OFF_DUTY,
          .hpoint = 0,
      },
  };
  for (size_t i = 0; i < sizeof channels / sizeof channels[0]; ++i) {
    ESP_RETURN_ON_ERROR(ledc_channel_config(&channels[i]), TAG, "RGB channel");
    ledc_channels |= 1U << channels[i].channel;
  }
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
  ESP_RETURN_ON_ERROR(take_ledc_lock(), TAG, "LEDC lock");
  if (!board_ready) {
    xSemaphoreGive(ledc_lock);
    return ESP_ERR_INVALID_STATE;
  }
  const uint32_t duty = (1023U * percent) / 100U;
  const esp_err_t err =
      ledc_set_duty_and_update(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty, 0);
  if (err == ESP_OK)
    backlight_percent = percent;
  xSemaphoreGive(ledc_lock);
  ESP_RETURN_ON_ERROR(err, TAG, "apply brightness");
  return err;
}

uint32_t d1001_board_backlight_get(void) {
  if (take_ledc_lock() != ESP_OK)
    return 0;
  const uint32_t percent = backlight_percent;
  xSemaphoreGive(ledc_lock);
  return percent;
}

esp_err_t d1001_board_rgb_set_color(uint8_t red, uint8_t green, uint8_t blue) {
  ESP_RETURN_ON_ERROR(take_ledc_lock(), TAG, "LEDC lock");
  if (!board_ready) {
    xSemaphoreGive(ledc_lock);
    return ESP_ERR_INVALID_STATE;
  }
  esp_err_t err = ESP_OK;
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
    err = ledc_set_duty_and_update(LEDC_LOW_SPEED_MODE, channels[i], duty, 0);
    if (err != ESP_OK)
      break;
    target_duties[i] = duty;
  }
  xSemaphoreGive(ledc_lock);
  ESP_RETURN_ON_ERROR(err, TAG, "apply RGB duty");
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

esp_err_t d1001_board_pa_set(bool enable) {
  return d1001_pca9535_set_level(D1001_PCA9535_PA_ENABLE, enable);
}

esp_err_t d1001_board_battery_adc_set_enable(bool high) {
  return d1001_pca9535_set_level(D1001_PCA9535_BAT_ADC_ENABLE, high);
}

esp_err_t d1001_board_camera_set_power(bool high) {
  return d1001_pca9535_set_level(D1001_PCA9535_CAMERA_POWER, high);
}

esp_err_t d1001_board_camera_set_pwdn(bool high) {
  return d1001_pca9535_set_level(D1001_PCA9535_CAMERA_PWDN, high);
}

esp_err_t d1001_board_camera_set_reset(bool high) {
  return d1001_pca9535_set_level(D1001_PCA9535_CAMERA_RESET, high);
}

/* Caller holds ledc_lock. Stop at a failed release and keep the remaining
 * handles private, so the next init can finish cleanup before allocating again.
 * Do not change expander levels here: POWER_HOLD and unknown rails must survive.
 */
static esp_err_t board_cleanup_locked(void) {
  board_ready = false;
  backlight_percent = 0;
  if (resources.touch != NULL) {
    const esp_err_t err = esp_lcd_touch_del(resources.touch);
    resources.touch = NULL; /* The touch wrapper frees itself even on IO error. */
    ESP_RETURN_ON_ERROR(err, TAG, "delete touch");
  }
  if (resources.panel != NULL) {
    if (panel_dma2d_ready) {
      ESP_RETURN_ON_ERROR(esp_lcd_dpi_panel_disable_dma2d(resources.panel), TAG,
                          "disable DMA2D");
      panel_dma2d_ready = false;
    }
    ESP_RETURN_ON_ERROR(esp_lcd_panel_del(resources.panel), TAG, "delete panel");
    resources.panel = NULL;
    resources.framebuffer = NULL;
  }
  if (resources.panel_io != NULL) {
    ESP_RETURN_ON_ERROR(esp_lcd_panel_io_del(resources.panel_io), TAG, "delete DBI");
    resources.panel_io = NULL;
  }
  if (resources.dsi_bus != NULL) {
    ESP_RETURN_ON_ERROR(esp_lcd_del_dsi_bus(resources.dsi_bus), TAG, "delete DSI");
    resources.dsi_bus = NULL;
  }
  for (int channel = LEDC_CHANNEL_3; channel >= LEDC_CHANNEL_0; --channel) {
    if ((ledc_channels & (1U << channel)) == 0U)
      continue;
    ESP_RETURN_ON_ERROR(ledc_stop(LEDC_LOW_SPEED_MODE, (ledc_channel_t)channel, 0),
                        TAG, "stop LEDC channel");
    const ledc_channel_config_t config = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = (ledc_channel_t)channel,
        .deconfigure = true,
    };
    ESP_RETURN_ON_ERROR(ledc_channel_config(&config), TAG, "delete LEDC channel");
    ledc_channels &= ~(1U << channel);
  }
  if (ledc_fade_ready) {
    ledc_fade_func_uninstall();
    ledc_fade_ready = false;
  }
  if (ledc_timer_ready) {
    ESP_RETURN_ON_ERROR(ledc_timer_pause(LEDC_LOW_SPEED_MODE, LEDC_TIMER_0), TAG,
                        "pause LEDC timer");
    const ledc_timer_config_t config = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .deconfigure = true,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&config), TAG, "delete LEDC timer");
    ledc_timer_ready = false;
  }
  if (dsi_ldo != NULL) {
    ESP_RETURN_ON_ERROR(esp_ldo_release_channel(dsi_ldo), TAG, "release LDO_VO3");
    dsi_ldo = NULL;
  }
  ESP_RETURN_ON_ERROR(d1001_pca9535_deinit(), TAG, "delete PCA9535");
  if (resources.system_i2c != NULL) {
    ESP_RETURN_ON_ERROR(i2c_del_master_bus(resources.system_i2c), TAG, "delete I2C1");
    resources.system_i2c = NULL;
  }
  if (resources.touch_i2c != NULL) {
    ESP_RETURN_ON_ERROR(i2c_del_master_bus(resources.touch_i2c), TAG, "delete I2C0");
    resources.touch_i2c = NULL;
  }
  resources = (d1001_board_handles){0};
  cleanup_pending = false;
  return ESP_OK;
}

esp_err_t d1001_board_init(d1001_board_handles *handles) {
  ESP_RETURN_ON_FALSE(handles != NULL, ESP_ERR_INVALID_ARG, TAG, "missing output");
  ESP_RETURN_ON_ERROR(take_ledc_lock(), TAG, "LEDC lock");
  if (board_ready) {
    xSemaphoreGive(ledc_lock);
    return ESP_ERR_INVALID_STATE;
  }
  *handles = (d1001_board_handles){0};
  esp_err_t ret = ESP_OK;
  if (cleanup_pending) {
    ret = board_cleanup_locked();
    if (ret != ESP_OK) {
      xSemaphoreGive(ledc_lock);
      return ret;
    }
  }
  cleanup_pending = true;
  ESP_GOTO_ON_ERROR(init_i2c(&resources.touch_i2c, &resources.system_i2c), fail, TAG,
                      "initialize I2C");
  ESP_GOTO_ON_ERROR(d1001_pca9535_init(resources.system_i2c), fail, TAG,
                      "initialize PCA9535");
  ESP_GOTO_ON_ERROR(init_power(), fail, TAG, "initialize board power");
  ESP_GOTO_ON_ERROR(init_backlight(), fail, TAG, "initialize backlight");
  ESP_GOTO_ON_ERROR(init_rgb(), fail, TAG, "initialize RGB LED");

  const esp_lcd_dsi_bus_config_t bus_config = {
      .bus_id = 0,
      .num_data_lanes = 2,
      .phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
      .lane_bit_rate_mbps = 1000,
  };
  ESP_GOTO_ON_ERROR(esp_lcd_new_dsi_bus(&bus_config, &resources.dsi_bus), fail, TAG,
                      "DSI bus");
  const esp_lcd_dbi_io_config_t io_config = {
      .virtual_channel = 0,
      .lcd_cmd_bits = 8,
      .lcd_param_bits = 8,
  };
  ESP_GOTO_ON_ERROR(
      esp_lcd_new_panel_io_dbi(resources.dsi_bus, &io_config, &resources.panel_io),
      fail, TAG, "DBI interface");
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
  ESP_GOTO_ON_ERROR(
      d1001_jd9365_create(resources.panel_io, resources.dsi_bus, &dpi_config,
                          &resources.panel),
      fail, TAG, "JD9365");
  ESP_GOTO_ON_ERROR(reset_panel(), fail, TAG, "reset panel");
  ESP_GOTO_ON_ERROR(esp_lcd_panel_init(resources.panel), fail, TAG, "initialize panel");
  ESP_GOTO_ON_ERROR(esp_lcd_dpi_panel_enable_dma2d(resources.panel), fail, TAG,
                      "enable DMA2D");
  panel_dma2d_ready = true;
  void *framebuffer = NULL;
  ESP_GOTO_ON_ERROR(
      esp_lcd_dpi_panel_get_frame_buffer(resources.panel, 1, &framebuffer), fail, TAG,
      "framebuffer");
  resources.framebuffer = framebuffer;
  ESP_GOTO_ON_ERROR(
      d1001_gsl3670_create(resources.touch_i2c,
                           (gpio_num_t)CONFIG_D1001_TOUCH_INT_GPIO,
                           &resources.touch),
      fail, TAG, "GSL3670");
  board_ready = true;
  *handles = resources;
  xSemaphoreGive(ledc_lock);
  ESP_LOGI(TAG, "800x1280 RGB565, two DSI lanes at 1000 Mbps");
  return ESP_OK;

fail:
  {
    const esp_err_t cleanup_err = board_cleanup_locked();
    if (cleanup_err != ESP_OK)
      ESP_LOGE(TAG, "board rollback incomplete: %s", esp_err_to_name(cleanup_err));
    xSemaphoreGive(ledc_lock);
    return ret;
  }
}
