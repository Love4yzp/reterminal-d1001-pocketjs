#include "d1001_power.h"
#include "d1001_power_core.h"

#include <stddef.h>
#include <sys/lock.h>
#include "driver/gpio.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali_scheme.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

/* Permanent lazy libc lock: deleting a per-instance mutex would race waiters. */
static _lock_t s_lock;
static struct {
    bool owned;
    bool ready;
    bool gate_dirty;
    bool charge_gpio;
    bool adc_gpio[2];
    bool usb_present;
    d1001_power_config_t config;
    adc_oneshot_unit_handle_t adc;
    adc_cali_handle_t cali[2];
} s;
static const adc_channel_t channels[] = {ADC_CHANNEL_1, ADC_CHANNEL_2};
static const gpio_num_t pins[] = {GPIO_NUM_17, GPIO_NUM_18};

static esp_err_t disable_gate(void)
{
    if (!s.gate_dirty) { return ESP_OK; }
    esp_err_t err = s.config.set_bat_adc_enable(s.config.control_context, false);
    if (err == ESP_OK) { s.gate_dirty = false; }
    return err;
}

/* Stop at first failed cleanup; each successful release clears its own flag. */
static esp_err_t cleanup(void)
{
    s.ready = false;
    esp_err_t err = disable_gate();
    if (err != ESP_OK) { return err; }
    for (size_t i = 0; i < 2; ++i) {
        if (s.cali[i]) {
            err = adc_cali_delete_scheme_curve_fitting(s.cali[i]);
            if (err != ESP_OK) { return err; }
            s.cali[i] = NULL;
        }
    }
    if (s.adc) {
        err = adc_oneshot_del_unit(s.adc);
        if (err != ESP_OK) { return err; }
        s.adc = NULL;
    }
    for (size_t i = 0; i < 2; ++i) {
        if (s.adc_gpio[i]) {
            err = gpio_reset_pin(pins[i]);
            if (err != ESP_OK) { return err; }
            s.adc_gpio[i] = false;
        }
    }
    if (s.charge_gpio) {
        err = gpio_reset_pin(GPIO_NUM_15);
        if (err != ESP_OK) { return err; }
        s.charge_gpio = false;
    }
    s.owned = false;
    s.usb_present = false;
    s.config = (d1001_power_config_t){0};
    return ESP_OK;
}

esp_err_t d1001_power_init(const d1001_power_config_t *config)
{
    if (!config || config->settle_ms < 1 || config->settle_ms > 1000 ||
        !config->usb_on_mv || config->usb_on_mv > 6600 ||
        config->usb_off_mv >= config->usb_on_mv) {
        return ESP_ERR_INVALID_ARG;
    }
    _lock_acquire(&s_lock);
    if (s.owned) {
        _lock_release(&s_lock);
        return ESP_ERR_INVALID_STATE;
    }
    s.owned = true;
    s.config = *config;
    esp_err_t err = ESP_OK;
    if (s.config.set_bat_adc_enable) {
        s.gate_dirty = true;
        err = disable_gate();
        if (err != ESP_OK) { goto fail; }
    }
    adc_oneshot_unit_init_cfg_t unit = {
        .unit_id = ADC_UNIT_1, .ulp_mode = ADC_ULP_MODE_DISABLE
    };
    err = adc_oneshot_new_unit(&unit, &s.adc);
    if (err != ESP_OK) { goto fail; }
    adc_oneshot_chan_cfg_t channel = {
        .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_12
    };
    for (size_t i = 0; i < 2; ++i) {
        s.adc_gpio[i] = true;
        err = adc_oneshot_config_channel(s.adc, channels[i], &channel);
        if (err != ESP_OK) { goto fail; }
        adc_cali_curve_fitting_config_t cali = {
            .unit_id = ADC_UNIT_1, .chan = channels[i],
            .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_12
        };
        err = adc_cali_create_scheme_curve_fitting(&cali, &s.cali[i]);
        if (err != ESP_OK) { goto fail; }
    }
    gpio_config_t gpio = {
        .pin_bit_mask = 1ULL << GPIO_NUM_15,
        .mode = GPIO_MODE_INPUT, .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE, .intr_type = GPIO_INTR_DISABLE
    };
    s.charge_gpio = true;
    err = gpio_config(&gpio);
    if (err != ESP_OK) { goto fail; }
    s.ready = true;
    _lock_release(&s_lock);
    return ESP_OK;
fail: {
    /* Cleanup errors take precedence; retained flags allow deinit to retry. */
    esp_err_t cleanup_err = cleanup();
    _lock_release(&s_lock);
    return cleanup_err != ESP_OK ? cleanup_err : err;
    }
}

static esp_err_t sample(size_t index, uint32_t *mv)
{
    int samples[9], raw = 0, ignored = 0, filtered = 0;
    /* Discard first conversion after switching ADC mux. */
    esp_err_t err = adc_oneshot_read(s.adc, channels[index], &ignored);
    if (err != ESP_OK) { return err; }
    for (size_t i = 0; i < 9; ++i) {
        err = adc_oneshot_read(s.adc, channels[index], &raw);
        if (err != ESP_OK) { return err; }
        if (raw < 0 || raw >= 4095) { return ESP_ERR_INVALID_RESPONSE; }
        err = adc_cali_raw_to_voltage(s.cali[index], raw, &samples[i]);
        if (err != ESP_OK) { return err; }
    }
    if (!d1001_power_filter(samples, 9, &filtered) ||
        !d1001_power_restore_mv(filtered, 2, 1, mv)) {
        return ESP_ERR_INVALID_RESPONSE;
    }
    return ESP_OK;
}

esp_err_t d1001_power_read(d1001_power_snapshot_t *snapshot)
{
    if (!snapshot) { return ESP_ERR_INVALID_ARG; }
    _lock_acquire(&s_lock);
    if (!s.ready) {
        _lock_release(&s_lock);
        return ESP_ERR_INVALID_STATE;
    }
    esp_err_t err = ESP_OK;
    uint32_t battery_mv = 0, usb_mv = 0;
    d1001_power_snapshot_t next;
    if (s.config.set_bat_adc_enable) {
        s.gate_dirty = true; /* Even a failed callback may have changed P6. */
        err = s.config.set_bat_adc_enable(s.config.control_context, true);
        if (err != ESP_OK) { goto done; }
    }
    /* One extra tick ensures at least settle_ms despite tick phase/truncation. */
    vTaskDelay(pdMS_TO_TICKS(s.config.settle_ms) + 1);
    int charge = gpio_get_level(GPIO_NUM_15);
    err = sample(1, &battery_mv);
    if (err == ESP_OK) { err = sample(0, &usb_mv); }
    if (err == ESP_OK && gpio_get_level(GPIO_NUM_15) != charge) {
        err = ESP_ERR_INVALID_RESPONSE;
    }
    if (err == ESP_OK && !d1001_power_compose(battery_mv, usb_mv, charge,
            s.usb_present, s.config.usb_on_mv, s.config.usb_off_mv, &next)) {
        err = ESP_ERR_INVALID_RESPONSE;
    }
done: {
        esp_err_t off_err = disable_gate();
        if (off_err != ESP_OK) {
            s.ready = false; /* Require deinit retry before using resources. */
            err = off_err;
        }
    }
    if (err == ESP_OK) {
        *snapshot = next;
        s.usb_present = next.usb_present;
    }
    _lock_release(&s_lock);
    return err;
}

esp_err_t d1001_power_deinit(void)
{
    _lock_acquire(&s_lock);
    esp_err_t err = cleanup();
    _lock_release(&s_lock);
    return err;
}
