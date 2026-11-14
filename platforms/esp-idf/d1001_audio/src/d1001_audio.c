#include "d1001_audio.h"

#include <stddef.h>
#include <stdint.h>

#include "d1001_audio_input.h"
#include "d1001_board.h"
#include "driver/i2s_std.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "d1001_audio";

#define ES8311_REG_RESET 0x00
#define ES8311_REG_CLOCK_01 0x01
#define ES8311_REG_CLOCK_02 0x02
#define ES8311_REG_CLOCK_03 0x03
#define ES8311_REG_CLOCK_04 0x04
#define ES8311_REG_CLOCK_05 0x05
#define ES8311_REG_CLOCK_06 0x06
#define ES8311_REG_CLOCK_07 0x07
#define ES8311_REG_CLOCK_08 0x08
#define ES8311_REG_SDP_IN 0x09
#define ES8311_REG_SDP_OUT 0x0A
#define ES8311_REG_SYSTEM_0B 0x0B
#define ES8311_REG_SYSTEM_0C 0x0C
#define ES8311_REG_SYSTEM_0D 0x0D
#define ES8311_REG_SYSTEM_0E 0x0E
#define ES8311_REG_SYSTEM_10 0x10
#define ES8311_REG_SYSTEM_11 0x11
#define ES8311_REG_SYSTEM_12 0x12
#define ES8311_REG_SYSTEM_13 0x13
#define ES8311_REG_SYSTEM_14 0x14
#define ES8311_REG_ADC_15 0x15
#define ES8311_REG_ADC_16 0x16
#define ES8311_REG_ADC_17 0x17
#define ES8311_REG_ADC_1B 0x1B
#define ES8311_REG_ADC_1C 0x1C
#define ES8311_REG_DAC_31 0x31
#define ES8311_REG_DAC_32 0x32
#define ES8311_REG_DAC_37 0x37
#define ES8311_REG_GPIO_44 0x44
#define ES8311_REG_GPIO_45 0x45
#define ES8311_I2C_TIMEOUT_MS 1000
#define ES8311_MUTE_BITS 0x60

typedef struct {
  uint8_t reg;
  uint8_t value;
} codec_write_t;

/* ES8311 slave, 16-bit Philips I2S, MCLK=11.2896 MHz, 44.1 kHz.
 * Register values follow Espressif esp_codec_dev es8311_open/start
 * (Apache-2.0) with only the DAC path enabled; the ADC and digital
 * microphone are left off. */
static const codec_write_t CODEC_INIT[] = {
    {ES8311_REG_SYSTEM_0D, 0xFA},
    {ES8311_REG_GPIO_44, 0x08},
    {ES8311_REG_GPIO_44, 0x08},
    {ES8311_REG_CLOCK_01, 0x30},
    {ES8311_REG_CLOCK_02, 0x00},
    {ES8311_REG_CLOCK_03, 0x10},
    {ES8311_REG_ADC_16, 0x24},
    {ES8311_REG_CLOCK_04, 0x10},
    {ES8311_REG_CLOCK_05, 0x00},
    {ES8311_REG_SYSTEM_0B, 0x00},
    {ES8311_REG_SYSTEM_0C, 0x00},
    {ES8311_REG_SYSTEM_10, 0x1F},
    {ES8311_REG_SYSTEM_11, 0x7F},
    {ES8311_REG_RESET, 0x80},
    {ES8311_REG_RESET, 0x80}, /* slave, codec reset released */
    {ES8311_REG_CLOCK_01, 0x3F},
    {ES8311_REG_CLOCK_06, 0x03},
    {ES8311_REG_SYSTEM_13, 0x10},
    {ES8311_REG_ADC_1B, 0x0A},
    {ES8311_REG_ADC_1C, 0x6A},
    {ES8311_REG_GPIO_44, 0x58},
    /* 44.1 kHz coefficient row: pre_div=1, pre_multi=1, adc/dac_div=1,
     * fs_mode=0, lrck=0x00ff, bclk_div=4, adc/dac_osr=0x10. */
    {ES8311_REG_CLOCK_02, 0x00},
    {ES8311_REG_CLOCK_05, 0x00},
    {ES8311_REG_CLOCK_03, 0x10},
    {ES8311_REG_CLOCK_04, 0x10},
    {ES8311_REG_CLOCK_07, 0x00},
    {ES8311_REG_CLOCK_08, 0xFF},
    {ES8311_REG_CLOCK_06, 0x03},
    {ES8311_REG_RESET, 0x80},
    {ES8311_REG_CLOCK_01, 0x3F},
    {ES8311_REG_SDP_IN, 0x0C},
    {ES8311_REG_SDP_OUT, 0x0C},
    {ES8311_REG_ADC_17, 0xBF},
    {ES8311_REG_SYSTEM_0E, 0x02},
    {ES8311_REG_SYSTEM_12, 0x00},
    {ES8311_REG_SYSTEM_14, 0x1A},
    {ES8311_REG_SYSTEM_0D, 0x01},
    {ES8311_REG_ADC_15, 0x40},
    {ES8311_REG_DAC_37, 0x08},
    {ES8311_REG_GPIO_45, 0x00},
    {ES8311_REG_DAC_31, ES8311_MUTE_BITS},
};

static i2c_master_dev_handle_t codec;
static i2s_chan_handle_t tx;
static bool ready;

static esp_err_t codec_write(uint8_t reg, uint8_t value) {
  const uint8_t data[] = {reg, value};
  return i2c_master_transmit(codec, data, sizeof data, ES8311_I2C_TIMEOUT_MS);
}

static esp_err_t codec_read(uint8_t reg, uint8_t *value) {
  return i2c_master_transmit_receive(codec, &reg, 1, value, 1,
                                     ES8311_I2C_TIMEOUT_MS);
}

static esp_err_t codec_update(uint8_t reg, uint8_t mask, uint8_t value) {
  uint8_t current = 0;
  ESP_RETURN_ON_ERROR(codec_read(reg, &current), TAG, "read codec 0x%02x", reg);
  return codec_write(reg, (uint8_t)((current & (uint8_t)~mask) | (value & mask)));
}

static esp_err_t init_i2s(void) {
  i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(D1001_AUDIO_I2S_NUM,
                                                          I2S_ROLE_MASTER);
  channel.dma_desc_num = 4;
  channel.dma_frame_num = 256;
  channel.auto_clear_after_cb = true;
  channel.auto_clear_before_cb = false;
  channel.dma_buffer_in_psram = false;
  ESP_RETURN_ON_ERROR(i2s_new_channel(&channel, &tx, NULL), TAG,
                      "I2S0 TX channel");

  i2s_std_config_t config = {
      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(D1001_AUDIO_SAMPLE_RATE_HZ),
      .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
          I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
      .gpio_cfg =
          {
              .mclk = (gpio_num_t)D1001_AUDIO_MCLK_GPIO,
              .bclk = (gpio_num_t)D1001_AUDIO_BCLK_GPIO,
              .ws = (gpio_num_t)D1001_AUDIO_WS_GPIO,
              .dout = (gpio_num_t)D1001_AUDIO_DOUT_GPIO,
              .din = I2S_GPIO_UNUSED,
              .invert_flags = {0},
          },
  };
  config.clk_cfg.mclk_multiple = I2S_MCLK_MULTIPLE_256;
  ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(tx, &config), TAG,
                      "I2S0 std mode");
  ESP_RETURN_ON_ERROR(i2s_channel_enable(tx), TAG, "I2S0 enable");
  return ESP_OK;
}

static esp_err_t init_codec(i2c_master_bus_handle_t system_i2c) {
  const i2c_device_config_t config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = D1001_AUDIO_I2C_ADDRESS,
      .scl_speed_hz = 400000,
  };
  ESP_RETURN_ON_ERROR(i2c_master_bus_add_device(system_i2c, &config, &codec),
                      TAG, "add ES8311");
  for (size_t i = 0; i < sizeof CODEC_INIT / sizeof CODEC_INIT[0]; ++i)
    ESP_RETURN_ON_ERROR(codec_write(CODEC_INIT[i].reg, CODEC_INIT[i].value), TAG,
                        "ES8311 init register 0x%02x", CODEC_INIT[i].reg);
  return ESP_OK;
}

esp_err_t d1001_audio_init(i2c_master_bus_handle_t system_i2c,
                           const d1001_audio_config *config) {
  if (ready)
    return ESP_OK;
  ESP_RETURN_ON_FALSE(system_i2c != NULL, ESP_ERR_INVALID_ARG, TAG,
                      "missing system I2C");
  codec = NULL;
  tx = NULL;
  esp_err_t err = init_i2s();
  if (err != ESP_OK) {
    d1001_audio_deinit();
    return err;
  }
  err = init_codec(system_i2c);
  if (err != ESP_OK) {
    d1001_audio_deinit();
    return err;
  }
  const uint8_t volume = config != NULL && config->volume_percent <= 100U
                             ? config->volume_percent
                             : D1001_AUDIO_DEFAULT_VOLUME_PERCENT;
  ready = true;
  err = d1001_audio_set_volume(volume);
  if (err == ESP_OK)
    err = d1001_audio_set_mute(true);
  if (err == ESP_OK)
    err = d1001_board_pa_set(false);
  if (err != ESP_OK) {
    d1001_audio_deinit();
    return err;
  }
  ESP_LOGI(TAG,
           "ES8311 on I2C1/0x%02x, I2S0 44.1 kHz stereo, MCLK %u Hz, volume %u%%",
           D1001_AUDIO_I2C_ADDRESS, (unsigned)D1001_AUDIO_MCLK_HZ,
           (unsigned)volume);
  return ESP_OK;
}

bool d1001_audio_ready(void) { return ready; }

esp_err_t d1001_audio_write(const int16_t *frames, size_t frame_count,
                            uint32_t timeout_ms) {
  if (!ready || tx == NULL)
    return ESP_ERR_INVALID_STATE;
  if (frame_count == 0)
    return ESP_OK;
  ESP_RETURN_ON_FALSE(frames != NULL, ESP_ERR_INVALID_ARG, TAG,
                      "missing PCM frames");
  const size_t bytes = frame_count * D1001_AUDIO_CHANNELS * sizeof(int16_t);
  size_t written = 0;
  const esp_err_t err = i2s_channel_write(tx, frames, bytes, &written, timeout_ms);
  if (err != ESP_OK)
    return err;
  return written == bytes ? ESP_OK : ESP_ERR_TIMEOUT;
}

esp_err_t d1001_audio_set_mute(bool mute) {
  if (!ready || codec == NULL)
    return ESP_ERR_INVALID_STATE;
  return codec_update(ES8311_REG_DAC_31, ES8311_MUTE_BITS,
                      mute ? ES8311_MUTE_BITS : 0U);
}

esp_err_t d1001_audio_set_volume(uint8_t percent) {
  if (!ready || codec == NULL)
    return ESP_ERR_INVALID_STATE;
  if (percent > 100U)
    percent = 100U;
  const uint8_t reg = (uint8_t)((percent * 255U + 50U) / 100U);
  return codec_write(ES8311_REG_DAC_32, reg);
}

esp_err_t d1001_audio_set_active(bool active) {
  if (!ready)
    return ESP_ERR_INVALID_STATE;
  esp_err_t err = d1001_audio_set_mute(!active);
  const esp_err_t pa = d1001_board_pa_set(active);
  if (err == ESP_OK)
    err = pa;
  return err;
}

void d1001_audio_deinit(void) {
  d1001_audio_input_close();
  ready = false;
  if (codec != NULL) {
    (void)codec_update(ES8311_REG_DAC_31, ES8311_MUTE_BITS, ES8311_MUTE_BITS);
    (void)d1001_board_pa_set(false);
    (void)i2c_master_bus_rm_device(codec);
    codec = NULL;
  }
  if (tx != NULL) {
    (void)i2s_channel_disable(tx);
    (void)i2s_del_channel(tx);
    tx = NULL;
  }
}
