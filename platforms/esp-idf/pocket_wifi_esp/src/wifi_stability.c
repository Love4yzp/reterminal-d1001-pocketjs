#include "wifi_stability.h"

#include <string.h>

void d1001_wifi_stability_init(d1001_wifi_stability *stability) {
  memset(stability, 0, sizeof *stability);
  stability->weak_since_us = -1;
}

void d1001_wifi_stability_reset_episode(d1001_wifi_stability *stability) {
  stability->disconnect_count = 0;
  stability->weak_since_us = -1;
}

void d1001_wifi_stability_connected(d1001_wifi_stability *stability) {
  stability->weak_since_us = -1;
}

void d1001_wifi_stability_disconnected(d1001_wifi_stability *stability) {
  stability->weak_since_us = -1;
}

bool d1001_wifi_stability_note_disconnect(d1001_wifi_stability *stability,
                                          int64_t now_us) {
  if (stability->disconnect_count < D1001_WIFI_UNSTABLE_DISCONNECTS) {
    stability->disconnect_us[stability->disconnect_count++] = now_us;
  } else {
    for (size_t index = 1; index < D1001_WIFI_UNSTABLE_DISCONNECTS; ++index)
      stability->disconnect_us[index - 1U] = stability->disconnect_us[index];
    stability->disconnect_us[D1001_WIFI_UNSTABLE_DISCONNECTS - 1U] = now_us;
  }
  return stability->disconnect_count == D1001_WIFI_UNSTABLE_DISCONNECTS &&
         now_us - stability->disconnect_us[0] <=
             D1001_WIFI_UNSTABLE_WINDOW_US;
}

bool d1001_wifi_stability_note_rssi(d1001_wifi_stability *stability,
                                    int64_t now_us, int rssi_dbm,
                                    int threshold_dbm, bool can_rotate) {
  if (!can_rotate || rssi_dbm >= threshold_dbm) {
    stability->weak_since_us = -1;
    return false;
  }
  if (stability->weak_since_us < 0)
    stability->weak_since_us = now_us;
  if (now_us < stability->weak_blocked_until_us ||
      now_us - stability->weak_since_us < D1001_WIFI_WEAK_HOLD_US)
    return false;
  stability->weak_blocked_until_us = now_us + D1001_WIFI_WEAK_BLOCK_US;
  stability->weak_since_us = -1;
  return true;
}
