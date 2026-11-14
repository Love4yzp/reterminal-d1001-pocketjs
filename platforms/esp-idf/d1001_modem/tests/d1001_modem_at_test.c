#include "d1001_modem_at.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition)                                                   \
  do {                                                                     \
    if (!(condition)) {                                                    \
      fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__,          \
              #condition);                                                 \
      exit(1);                                                             \
    }                                                                      \
  } while (0)

static void test_response_result(void) {
  CHECK(d1001_modem_at_response_result("") == D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("AT\r\r\n") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("\r\n+CSQ: 20,99\r\n") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("\r\n+CSQ: 20,99\r\n\r\nO") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("AT\r\r\nOK\r\n") ==
        D1001_MODEM_AT_OK);
  CHECK(d1001_modem_at_response_result("\r\n OK \r\n") ==
        D1001_MODEM_AT_OK);
  CHECK(d1001_modem_at_response_result("+COPS: 0,0,\"OK\",7\r\n") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("\r\nERROR\r\n") ==
        D1001_MODEM_AT_ERROR);
  CHECK(d1001_modem_at_response_result("\r\n+CME ERROR: SIM not inserted\r\n") ==
        D1001_MODEM_AT_ERROR);
  CHECK(d1001_modem_at_response_result("\r\n+CMS ERROR: 310\r\n") ==
        D1001_MODEM_AT_ERROR);
  CHECK(d1001_modem_at_response_result("\r\nNO CARRIER\r\n") ==
        D1001_MODEM_AT_ERROR);
}

static void check_bytewise_result(const char *response,
                                  d1001_modem_at_result expected) {
  char received[128] = {0};
  const size_t length = strlen(response);
  CHECK(length < sizeof received);
  // The supplied transcript ends with the terminal line's CRLF. Every
  // preceding byte, including the full word/prefix, must remain incomplete.
  for (size_t i = 0; i < length; ++i) {
    received[i] = response[i];
    received[i + 1] = '\0';
    const d1001_modem_at_result actual =
        d1001_modem_at_response_result(received);
    CHECK(actual == (i < length - 2 ? D1001_MODEM_AT_IN_PROGRESS : expected));
  }
}

static void test_fragmented_final_results(void) {
  check_bytewise_result("AT\r\r\nOK\r\n", D1001_MODEM_AT_OK);
  check_bytewise_result("\r\nERROR\r\n", D1001_MODEM_AT_ERROR);
  check_bytewise_result("\r\n+CME ERROR: SIM not inserted\r\n",
                        D1001_MODEM_AT_ERROR);
  check_bytewise_result("\r\n+CMS ERROR: 310\r\n", D1001_MODEM_AT_ERROR);
  check_bytewise_result("\r\nNO CARRIER\r\n", D1001_MODEM_AT_ERROR);
  check_bytewise_result("\r\nNO ANSWER\r\n", D1001_MODEM_AT_ERROR);
  check_bytewise_result("\r\nBUSY\r\n", D1001_MODEM_AT_ERROR);
  CHECK(d1001_modem_at_response_result("\r\nOK") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("\r\n+CME ERROR:") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("\r\n+CME ERROR: SIM not inserted") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("\r\n+CMS ERROR:") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("OKAY\r\n") ==
        D1001_MODEM_AT_IN_PROGRESS);
  CHECK(d1001_modem_at_response_result("+COPS: 0,0,\"OK\",7\r\nOK") ==
        D1001_MODEM_AT_IN_PROGRESS);
  // A single LF also terminates a complete line.
  CHECK(d1001_modem_at_response_result("OK\n") == D1001_MODEM_AT_OK);
  d1001_modem_sim_status sim = D1001_MODEM_SIM_UNKNOWN;
  CHECK(d1001_modem_at_parse_sim("+CME ERROR: SIM not inserted\r", &sim));
  CHECK(sim == D1001_MODEM_SIM_ABSENT);
}

static void test_sim_status(void) {
  d1001_modem_sim_status status = D1001_MODEM_SIM_UNKNOWN;
  CHECK(d1001_modem_at_parse_sim("AT+CPIN?\r\r\n+CPIN: READY\r\n\r\nOK\r\n",
                                 &status));
  CHECK(status == D1001_MODEM_SIM_READY);
  CHECK(d1001_modem_at_parse_sim("\r\n+CPIN: SIM PIN\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_PIN_REQUIRED);
  CHECK(d1001_modem_at_parse_sim("\r\n+CPIN: SIM PUK\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_PUK_REQUIRED);
  CHECK(d1001_modem_at_parse_sim("\r\n+CPIN: PH-SIM PUK\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_PUK_REQUIRED);
  CHECK(d1001_modem_at_parse_sim("\r\n+CPIN: NOT INSERTED\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_ABSENT);
  CHECK(d1001_modem_at_parse_sim("\r\n+CME ERROR: SIM not inserted\r\n",
                                 &status));
  CHECK(status == D1001_MODEM_SIM_ABSENT);
  CHECK(d1001_modem_at_parse_sim("\r\n+CME ERROR: SIM busy\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_BUSY);
  CHECK(d1001_modem_at_parse_sim("\r\n+CME ERROR: SIM failure\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_ERROR);
  CHECK(d1001_modem_at_parse_sim("\r\n+CPIN: FUTURE_STATUS\r\n", &status));
  CHECK(status == D1001_MODEM_SIM_UNKNOWN);
  CHECK(!d1001_modem_at_parse_sim("\r\nOK\r\n", &status));
  CHECK(!d1001_modem_at_parse_sim(NULL, &status));
  CHECK(!d1001_modem_at_parse_sim("+CPIN: READY", NULL));
}

static void test_csq(void) {
  d1001_modem_signal signal = {0};
  CHECK(d1001_modem_at_parse_csq("AT+CSQ\r\r\n+CSQ: 20,99\r\n\r\nOK\r\n",
                                 &signal));
  CHECK(signal.signal_known);
  CHECK(signal.rssi == 20);
  CHECK(signal.rssi_dbm == -73);
  CHECK(signal.ber == 99);

  CHECK(d1001_modem_at_parse_csq("\r\n+CSQ: 0,0\r\n", &signal));
  CHECK(signal.signal_known);
  CHECK(signal.rssi_dbm == -113);
  CHECK(d1001_modem_at_parse_csq("\r\n+CSQ: 31,7\r\n", &signal));
  CHECK(signal.rssi_dbm == -51);
  CHECK(signal.ber == 7);
  CHECK(d1001_modem_at_parse_csq("\r\n+CSQ: 99,99\r\n", &signal));
  CHECK(!signal.signal_known);
  CHECK(signal.rssi == 99);
  CHECK(signal.rssi_dbm == 0);

  // Test every reserved RSSI, including both boundaries 32 and 98. Failure
  // must leave the caller's previous snapshot intact.
  for (int rssi = 32; rssi <= 98; ++rssi) {
    char response[32];
    (void)snprintf(response, sizeof response, "+CSQ: %d,0\r\n", rssi);
    signal = (d1001_modem_signal){.rssi = 20, .ber = 7, .rssi_dbm = -73,
                                   .signal_known = true};
    CHECK(!d1001_modem_at_parse_csq(response, &signal));
    CHECK(signal.rssi == 20 && signal.ber == 7 && signal.rssi_dbm == -73 &&
          signal.signal_known);
  }
  CHECK(!d1001_modem_at_parse_csq("\r\n+CSQ: 100,0\r\n", &signal));
  CHECK(!d1001_modem_at_parse_csq("\r\n+CSQ: 20,8\r\n", &signal));
  CHECK(!d1001_modem_at_parse_csq("\r\n+CSQ: 20\r\n", &signal));
  CHECK(!d1001_modem_at_parse_csq("\r\n+CSQ: x,0\r\n", &signal));
  CHECK(!d1001_modem_at_parse_csq("\r\nOK\r\n", &signal));
  CHECK(!d1001_modem_at_parse_csq(NULL, &signal));
  CHECK(!d1001_modem_at_parse_csq("+CSQ: 20,0", NULL));
}

static void test_operator(void) {
  d1001_modem_operator operator_info = {0};
  CHECK(d1001_modem_at_parse_operator(
            "\r\n+COPS: 0,0,\"China Mobile\",7\r\n\r\nOK\r\n",
            &operator_info));
  CHECK(operator_info.available);
  CHECK(operator_info.format == 0);
  CHECK(operator_info.access_technology == 7);
  CHECK(strcmp(operator_info.name, "China Mobile") == 0);

  CHECK(d1001_modem_at_parse_operator("\r\n+COPS: 0,2,\"46000\",2\r\n",
                                      &operator_info));
  CHECK(operator_info.available);
  CHECK(operator_info.format == 2);
  CHECK(operator_info.access_technology == 2);
  CHECK(strcmp(operator_info.name, "46000") == 0);

  CHECK(d1001_modem_at_parse_operator("\r\n+COPS: 0\r\n", &operator_info));
  CHECK(!operator_info.available);
  CHECK(operator_info.name[0] == '\0');
  CHECK(operator_info.access_technology == -1);

  CHECK(d1001_modem_at_parse_operator("\r\n+COPS: 0,0,\"\",0\r\n",
                                      &operator_info));
  CHECK(!operator_info.available);

  CHECK(d1001_modem_at_parse_operator(
            "\r\n+COPS: 0,0,\"Operator, with comma\",7\r\n",
            &operator_info));
  CHECK(strcmp(operator_info.name, "Operator, with comma") == 0);
  CHECK(!d1001_modem_at_parse_operator("\r\n+COPS: 0,0,46000,7\r\n",
                                       &operator_info));
  CHECK(!d1001_modem_at_parse_operator("\r\nOK\r\n", &operator_info));
  CHECK(!d1001_modem_at_parse_operator(NULL, &operator_info));
  CHECK(!d1001_modem_at_parse_operator("+COPS: 0", NULL));
}

int main(void) {
  test_response_result();
  test_fragmented_final_results();
  test_sim_status();
  test_csq();
  test_operator();
  puts("d1001_modem_at: all checks passed");
  return 0;
}
