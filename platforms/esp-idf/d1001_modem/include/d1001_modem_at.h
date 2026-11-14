#pragma once

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_MODEM_OPERATOR_NAME_SIZE 48

typedef enum {
  D1001_MODEM_AT_IN_PROGRESS = 0,
  D1001_MODEM_AT_OK,
  D1001_MODEM_AT_ERROR,
} d1001_modem_at_result;

typedef enum {
  D1001_MODEM_SIM_UNKNOWN = 0,
  D1001_MODEM_SIM_READY,
  D1001_MODEM_SIM_PIN_REQUIRED,
  D1001_MODEM_SIM_PUK_REQUIRED,
  D1001_MODEM_SIM_ABSENT,
  D1001_MODEM_SIM_BUSY,
  D1001_MODEM_SIM_ERROR,
} d1001_modem_sim_status;

typedef struct {
  uint8_t rssi;
  uint8_t ber;
  int16_t rssi_dbm;
  bool signal_known;
} d1001_modem_signal;

typedef struct {
  char name[D1001_MODEM_OPERATOR_NAME_SIZE];
  uint8_t format;
  int access_technology;
  bool available;
} d1001_modem_operator;

/** Classify a complete or partially received AT response. */
d1001_modem_at_result d1001_modem_at_response_result(const char *response);

/** Parse +CPIN and common SIM-related +CME ERROR responses. */
bool d1001_modem_at_parse_sim(const char *response,
                              d1001_modem_sim_status *status);

/** Parse +CSQ. RSSI 99 is valid input with signal_known set to false. */
bool d1001_modem_at_parse_csq(const char *response, d1001_modem_signal *signal);

/** Parse +COPS, including numeric and quoted operator names. */
bool d1001_modem_at_parse_operator(const char *response,
                                   d1001_modem_operator *operator_info);

#ifdef __cplusplus
}
#endif
