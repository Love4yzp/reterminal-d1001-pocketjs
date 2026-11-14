#include "d1001_audio_input.h"

#include "driver/i2s_std.h"
#include "driver/i2s_types.h"
#include "esp_check.h"
#include "esp_log.h"

static const char *TAG = "d1001_audio_input";

#define ES7210_REG_RESET 0x00
#define ES7210_REG_MAINCLK 0x02
#define ES7210_REG_LRCK_DIVH 0x04
#define ES7210_REG_LRCK_DIVL 0x05
#define ES7210_REG_POWER_DOWN 0x06
#define ES7210_REG_OSR 0x07
#define ES7210_REG_TIME_CONTROL0 0x09
#define ES7210_REG_TIME_CONTROL1 0x0A
#define ES7210_REG_SDP_INTERFACE1 0x11
#define ES7210_REG_SDP_INTERFACE2 0x12
#define ES7210_REG_ADC1_DIRECT_DB 0x1B
#define ES7210_REG_ADC2_DIRECT_DB 0x1C
#define ES7210_REG_ADC12_HPF2 0x22
#define ES7210_REG_ADC12_HPF1 0x23
#define ES7210_REG_ANALOG 0x40
#define ES7210_REG_MIC12_BIAS 0x41
#define ES7210_REG_MIC1_GAIN 0x43
#define ES7210_REG_MIC2_GAIN 0x44
#define ES7210_REG_MIC1_POWER 0x47
#define ES7210_REG_MIC2_POWER 0x48
#define ES7210_REG_MIC12_POWER 0x4B
#define ES7210_I2C_TIMEOUT_MS 1000

typedef struct {
  uint8_t reg;
  uint8_t value;
} input_codec_write;

typedef struct {
  uint32_t sample_rate;
  uint32_t mclk_multiple;
  uint8_t mainclk;
  uint8_t lrck_h;
  uint8_t lrck_l;
} input_clock;

/* MCLK stays at 11.2896 MHz. Values are the three applicable coefficient
 * rows from the ES7210 example at Love4yzp/reTerminal-D1001 5074d3b. */
static const input_clock INPUT_CLOCKS[] = {
    {44100U, I2S_MCLK_MULTIPLE_256, 0xC1, 0x01, 0x00},
    {22050U, I2S_MCLK_MULTIPLE_512, 0x81, 0x02, 0x00},
    {11025U, I2S_MCLK_MULTIPLE_1024, 0x82, 0x01, 0x00},
};

static const input_codec_write INPUT_CODEC_INIT[] = {
    {ES7210_REG_RESET, 0xFF},
    {ES7210_REG_RESET, 0x32},
    {ES7210_REG_TIME_CONTROL0, 0x30},
    {ES7210_REG_TIME_CONTROL1, 0x30},
    {ES7210_REG_ADC12_HPF1, 0x2A},
    {ES7210_REG_ADC12_HPF2, 0x0A},
    {ES7210_REG_SDP_INTERFACE1, 0x60},
    {ES7210_REG_SDP_INTERFACE2, 0x00},
    {ES7210_REG_ANALOG, 0xC3},
    {ES7210_REG_MIC12_BIAS, 0x70},
    {ES7210_REG_MIC1_GAIN, 0x18},
    {ES7210_REG_MIC2_GAIN, 0x18},
    {ES7210_REG_MIC1_POWER, 0x08},
    {ES7210_REG_MIC2_POWER, 0x08},
    {ES7210_REG_OSR, 0x20},
};

static const input_codec_write INPUT_CODEC_ENABLE[] = {
    {ES7210_REG_POWER_DOWN, 0x04},
    {ES7210_REG_MIC12_POWER, 0x0F},
    {ES7210_REG_RESET, 0x71},
    {ES7210_REG_RESET, 0x41},
    {ES7210_REG_ADC1_DIRECT_DB, 0xBF},
    {ES7210_REG_ADC2_DIRECT_DB, 0xBF},
};

static i2c_master_dev_handle_t input_codec;
static i2s_chan_handle_t input_rx;
static bool input_active;

static esp_err_t codec_write(uint8_t reg, uint8_t value) {
  const uint8_t data[] = {reg, value};
  return i2c_master_transmit(input_codec, data, sizeof data,
                             ES7210_I2C_TIMEOUT_MS);
}

static esp_err_t codec_write_table(const input_codec_write *writes,
                                   size_t count) {
  for (size_t i = 0; i < count; ++i)
    ESP_RETURN_ON_ERROR(codec_write(writes[i].reg, writes[i].value), TAG,
                        "ES7210 register 0x%02x", writes[i].reg);
  return ESP_OK;
}

static const input_clock *find_clock(uint32_t sample_rate) {
  for (size_t i = 0; i < sizeof INPUT_CLOCKS / sizeof INPUT_CLOCKS[0]; ++i)
    if (INPUT_CLOCKS[i].sample_rate == sample_rate)
      return &INPUT_CLOCKS[i];
  return NULL;
}

static esp_err_t init_i2s(const input_clock *clock) {
  i2s_chan_config_t channel =
      I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
  channel.dma_desc_num = 4;
  channel.dma_frame_num = 256;
  channel.dma_buffer_in_psram = false;
  ESP_RETURN_ON_ERROR(i2s_new_channel(&channel, NULL, &input_rx), TAG,
                      "I2S1 RX channel");

  i2s_std_config_t config = {
      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(clock->sample_rate),
      .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
          I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
      .gpio_cfg =
          {
              .mclk = (gpio_num_t)D1001_AUDIO_INPUT_MCLK_GPIO,
              .bclk = (gpio_num_t)D1001_AUDIO_INPUT_BCLK_GPIO,
              .ws = (gpio_num_t)D1001_AUDIO_INPUT_WS_GPIO,
              .dout = I2S_GPIO_UNUSED,
              .din = (gpio_num_t)D1001_AUDIO_INPUT_DIN_GPIO,
              .invert_flags = {0},
          },
  };
  config.clk_cfg.mclk_multiple = clock->mclk_multiple;
  ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(input_rx, &config), TAG,
                      "I2S1 std mode");
  ESP_RETURN_ON_ERROR(i2s_channel_enable(input_rx), TAG, "I2S1 enable");
  return ESP_OK;
}

static esp_err_t init_codec(i2c_master_bus_handle_t system_i2c,
                            const input_clock *clock) {
  const i2c_device_config_t config = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = D1001_AUDIO_INPUT_I2C_ADDRESS,
      .scl_speed_hz = 400000,
  };
  ESP_RETURN_ON_ERROR(
      i2c_master_bus_add_device(system_i2c, &config, &input_codec), TAG,
      "add ES7210");
  ESP_RETURN_ON_ERROR(codec_write_table(
                          INPUT_CODEC_INIT,
                          sizeof INPUT_CODEC_INIT / sizeof INPUT_CODEC_INIT[0]),
                      TAG, "ES7210 init");
  ESP_RETURN_ON_ERROR(codec_write(ES7210_REG_MAINCLK, clock->mainclk), TAG,
                      "ES7210 main clock");
  ESP_RETURN_ON_ERROR(codec_write(ES7210_REG_LRCK_DIVH, clock->lrck_h), TAG,
                      "ES7210 LRCK high");
  ESP_RETURN_ON_ERROR(codec_write(ES7210_REG_LRCK_DIVL, clock->lrck_l), TAG,
                      "ES7210 LRCK low");
  return codec_write_table(
      INPUT_CODEC_ENABLE,
      sizeof INPUT_CODEC_ENABLE / sizeof INPUT_CODEC_ENABLE[0]);
}

esp_err_t d1001_audio_input_open(i2c_master_bus_handle_t system_i2c,
                                 uint32_t sample_rate) {
  if (input_active)
    return ESP_ERR_INVALID_STATE;
  const input_clock *clock = find_clock(sample_rate);
  ESP_RETURN_ON_FALSE(system_i2c != NULL && clock != NULL,
                      ESP_ERR_INVALID_ARG, TAG, "invalid input open");
  input_codec = NULL;
  input_rx = NULL;
  esp_err_t err = init_codec(system_i2c, clock);
  if (err == ESP_OK)
    err = init_i2s(clock);
  if (err != ESP_OK) {
    d1001_audio_input_close();
    return err;
  }
  input_active = true;
  ESP_LOGI(TAG, "ES7210 on I2C/0x%02x, I2S1 %u Hz stereo, MCLK %u Hz (%ux)",
           D1001_AUDIO_INPUT_I2C_ADDRESS, (unsigned)sample_rate,
           (unsigned)D1001_AUDIO_INPUT_MCLK_HZ,
           (unsigned)clock->mclk_multiple);
  return ESP_OK;
}

esp_err_t d1001_audio_input_read(int16_t *frames, size_t frame_count,
                                 size_t *frames_read, uint32_t timeout_ms) {
  if (frames_read == NULL)
    return ESP_ERR_INVALID_ARG;
  *frames_read = 0U;
  if (!input_active || input_rx == NULL)
    return ESP_ERR_INVALID_STATE;
  if (frame_count == 0U)
    return ESP_OK;
  if (frames == NULL || frame_count > SIZE_MAX / (2U * sizeof(int16_t)))
    return ESP_ERR_INVALID_ARG;
  const size_t bytes = frame_count * D1001_AUDIO_INPUT_CHANNELS * sizeof(int16_t);
  size_t read = 0U;
  const esp_err_t err =
      i2s_channel_read(input_rx, frames, bytes, &read, timeout_ms);
  if ((read % (D1001_AUDIO_INPUT_CHANNELS * sizeof(int16_t))) != 0U)
    return ESP_FAIL;
  *frames_read = read / (D1001_AUDIO_INPUT_CHANNELS * sizeof(int16_t));
  return err;
}

void d1001_audio_input_close(void) {
  input_active = false;
  if (input_rx != NULL) {
    (void)i2s_channel_disable(input_rx);
    (void)i2s_del_channel(input_rx);
    input_rx = NULL;
  }
  if (input_codec != NULL) {
    (void)codec_write(ES7210_REG_RESET, 0x32);
    (void)i2c_master_bus_rm_device(input_codec);
    input_codec = NULL;
  }
}

bool d1001_audio_input_ready(void) { return input_active; }
