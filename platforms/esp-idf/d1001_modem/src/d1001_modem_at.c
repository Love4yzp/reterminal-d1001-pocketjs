#include "d1001_modem_at.h"

#include <stddef.h>
#include <string.h>

typedef struct {
  const char *begin;
  const char *end;
} text_span;

static bool next_line(const char **cursor, text_span *line, bool complete_only) {
  const char *begin = *cursor;
  if (begin == NULL || *begin == '\0')
    return false;

  const char *end = begin + strcspn(begin, "\r\n");
  if (complete_only && *end == '\0')
    return false;
  *cursor = end;
  while (**cursor == '\r' || **cursor == '\n')
    ++*cursor;

  while (begin < end && (*begin == ' ' || *begin == '\t'))
    ++begin;
  while (end > begin && (end[-1] == ' ' || end[-1] == '\t'))
    --end;
  line->begin = begin;
  line->end = end;
  return true;
}

static bool span_equal(text_span span, const char *text) {
  const size_t length = strlen(text);
  return (size_t)(span.end - span.begin) == length &&
         memcmp(span.begin, text, length) == 0;
}

static bool span_starts_with(text_span span, const char *text) {
  const size_t length = strlen(text);
  return (size_t)(span.end - span.begin) >= length &&
         memcmp(span.begin, text, length) == 0;
}

static text_span span_from_text(const char *text) {
  text_span span = {.begin = text, .end = text + strcspn(text, "\r\n")};
  while (span.begin < span.end &&
         (*span.begin == ' ' || *span.begin == '\t'))
    ++span.begin;
  while (span.end > span.begin &&
         (span.end[-1] == ' ' || span.end[-1] == '\t'))
    --span.end;
  return span;
}

static const char *find_line(const char *response, const char *prefix) {
  const size_t prefix_length = strlen(prefix);
  const char *cursor = response;
  text_span line;
  while (next_line(&cursor, &line, false)) {
    if ((size_t)(line.end - line.begin) >= prefix_length &&
        memcmp(line.begin, prefix, prefix_length) == 0)
      return line.begin + prefix_length;
  }
  return NULL;
}

static void skip_spaces(const char **cursor) {
  while (**cursor == ' ' || **cursor == '\t')
    ++*cursor;
}

static bool parse_uint(const char **cursor, int *value) {
  if (**cursor < '0' || **cursor > '9')
    return false;
  int parsed = 0;
  do {
    if (parsed > 100000)
      return false;
    parsed = parsed * 10 + (**cursor - '0');
    ++*cursor;
  } while (**cursor >= '0' && **cursor <= '9');
  *value = parsed;
  return true;
}

d1001_modem_at_result d1001_modem_at_response_result(const char *response) {
  if (response == NULL)
    return D1001_MODEM_AT_ERROR;

  const char *cursor = response;
  text_span line;
  // A partial CME/CMS prefix is not a final result until the line ends.
  while (next_line(&cursor, &line, true)) {
    if (span_equal(line, "OK"))
      return D1001_MODEM_AT_OK;
    if (span_equal(line, "ERROR") || span_equal(line, "NO CARRIER") ||
        span_equal(line, "NO ANSWER") || span_equal(line, "BUSY") ||
        span_starts_with(line, "+CME ERROR:") ||
        span_starts_with(line, "+CMS ERROR:"))
      return D1001_MODEM_AT_ERROR;
  }
  return D1001_MODEM_AT_IN_PROGRESS;
}

bool d1001_modem_at_parse_sim(const char *response,
                              d1001_modem_sim_status *status) {
  if (response == NULL || status == NULL)
    return false;

  const char *value = find_line(response, "+CPIN:");
  if (value != NULL) {
    const text_span span = span_from_text(value);
    if (span_equal(span, "READY"))
      *status = D1001_MODEM_SIM_READY;
    else if (span_equal(span, "SIM PIN") || span_equal(span, "SIM PIN2") ||
             span_equal(span, "PH-SIM PIN"))
      *status = D1001_MODEM_SIM_PIN_REQUIRED;
    else if (span_equal(span, "SIM PUK") || span_equal(span, "SIM PUK2") ||
             span_equal(span, "PH-SIM PUK"))
      *status = D1001_MODEM_SIM_PUK_REQUIRED;
    else if (span_equal(span, "NOT INSERTED") ||
             span_equal(span, "SIM NOT INSERTED"))
      *status = D1001_MODEM_SIM_ABSENT;
    else if (span_equal(span, "SIM BUSY") || span_equal(span, "NOT READY"))
      *status = D1001_MODEM_SIM_BUSY;
    else
      *status = D1001_MODEM_SIM_UNKNOWN;
    return true;
  }

  value = find_line(response, "+CME ERROR:");
  if (value == NULL)
    return false;
  const text_span span = span_from_text(value);
  if (span_equal(span, "SIM not inserted"))
    *status = D1001_MODEM_SIM_ABSENT;
  else if (span_equal(span, "SIM busy") || span_equal(span, "SIM not ready"))
    *status = D1001_MODEM_SIM_BUSY;
  else if (span_equal(span, "SIM PIN required"))
    *status = D1001_MODEM_SIM_PIN_REQUIRED;
  else if (span_equal(span, "SIM PUK required"))
    *status = D1001_MODEM_SIM_PUK_REQUIRED;
  else if (span_equal(span, "SIM failure") || span_equal(span, "SIM wrong"))
    *status = D1001_MODEM_SIM_ERROR;
  else
    return false;
  return true;
}

bool d1001_modem_at_parse_csq(const char *response,
                              d1001_modem_signal *signal) {
  if (response == NULL || signal == NULL)
    return false;
  const char *cursor = find_line(response, "+CSQ:");
  if (cursor == NULL)
    return false;

  int rssi;
  int ber;
  skip_spaces(&cursor);
  if (!parse_uint(&cursor, &rssi))
    return false;
  skip_spaces(&cursor);
  if (*cursor != ',')
    return false;
  ++cursor;
  skip_spaces(&cursor);
  if (!parse_uint(&cursor, &ber) || (rssi > 31 && rssi != 99) || ber > 99 ||
      (ber > 7 && ber != 99))
    return false;

  signal->rssi = (uint8_t)rssi;
  signal->ber = (uint8_t)ber;
  signal->signal_known = rssi != 99;
  signal->rssi_dbm = rssi == 99 ? 0 : (int16_t)(2 * rssi - 113);
  return true;
}

bool d1001_modem_at_parse_operator(const char *response,
                                   d1001_modem_operator *operator_info) {
  if (response == NULL || operator_info == NULL)
    return false;
  const char *cursor = find_line(response, "+COPS:");
  if (cursor == NULL)
    return false;

  d1001_modem_operator parsed = {.access_technology = -1};
  int mode;
  skip_spaces(&cursor);
  if (!parse_uint(&cursor, &mode) || mode > 4)
    return false;
  skip_spaces(&cursor);
  if (*cursor != ',') {
    *operator_info = parsed;
    return true;
  }

  ++cursor;
  int format;
  skip_spaces(&cursor);
  if (!parse_uint(&cursor, &format) || format > 2)
    return false;
  parsed.format = (uint8_t)format;
  skip_spaces(&cursor);
  if (*cursor != ',')
    return false;
  ++cursor;
  skip_spaces(&cursor);
  if (*cursor != '"')
    return false;
  ++cursor;

  size_t name_length = 0;
  while (*cursor != '"') {
    if (*cursor == '\0' || *cursor == '\r' || *cursor == '\n')
      return false;
    if (name_length + 1 < sizeof parsed.name)
      parsed.name[name_length++] = *cursor;
    ++cursor;
  }
  parsed.name[name_length] = '\0';
  ++cursor;

  skip_spaces(&cursor);
  if (*cursor == ',') {
    ++cursor;
    skip_spaces(&cursor);
    if (!parse_uint(&cursor, &parsed.access_technology))
      return false;
  }
  parsed.available = parsed.name[0] != '\0';
  *operator_info = parsed;
  return true;
}
