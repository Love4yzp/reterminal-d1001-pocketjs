#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "d1001_modem_at.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef esp_err_t (*d1001_modem_set_signal_cb)(void *user_ctx, bool asserted);

typedef enum {
  D1001_MODEM_STATE_IDLE = 0,
  D1001_MODEM_STATE_PROBING,
  D1001_MODEM_STATE_READY,
  D1001_MODEM_STATE_NOT_PRESENT,
  D1001_MODEM_STATE_ERROR,
  /** Cleanup still owns callbacks/resources; start is not allowed yet. */
  D1001_MODEM_STATE_STOPPING,
} d1001_modem_state;

typedef struct {
  void *user_ctx;
  /** Logical enable/assertion; the integrator owns GPIO/PCA9535 polarity. */
  d1001_modem_set_signal_cb set_power;
  d1001_modem_set_signal_cb set_reset;
  d1001_modem_set_signal_cb set_disable;
  /** Zero selects any VID/PID. Nonzero values restrict the CDC device. */
  uint16_t usb_vendor_id;
  uint16_t usb_product_id;
  uint8_t at_interface_index;
  uint8_t task_priority;
  uint32_t reset_pulse_ms;
  uint32_t power_on_delay_ms;
  uint32_t usb_probe_timeout_ms;
  uint32_t at_timeout_ms;
  uint32_t task_stack_size;
  uint32_t usb_task_stack_size;
  /** Zero selects 20 ms. Validate rail discharge and module minimum off time. */
  uint32_t power_off_delay_ms;
} d1001_modem_config;

typedef struct {
  d1001_modem_state state;
  esp_err_t last_error;
  uint16_t usb_vendor_id;
  uint16_t usb_product_id;
  d1001_modem_sim_status sim_status;
  d1001_modem_signal signal;
  d1001_modem_operator operator_info;
} d1001_modem_status;

/** Start one asynchronous power/USB/AT probe. This function never waits for
 * the modem and does not install a network interface. */
esp_err_t d1001_modem_start(const d1001_modem_config *config);

/** Request a SIM/CSQ/operator refresh; repeated pending requests coalesce. */
esp_err_t d1001_modem_refresh(void);

/** Copy the latest status. READY means the AT port works, not that PS is
 * registered or that a data connection is up. */
esp_err_t d1001_modem_get_status(d1001_modem_status *status);

/** Stop and release resources. ESP_ERR_TIMEOUT means the worker still owns
 * callbacks/user_ctx; retry stop or wait for IDLE/NOT_PRESENT/ERROR.
 * A completed stop reports any cleanup error even if a later retry succeeded.
 * Start/stop callers must serialize their calls. */
esp_err_t d1001_modem_stop(void);

#ifdef __cplusplus
}
#endif
