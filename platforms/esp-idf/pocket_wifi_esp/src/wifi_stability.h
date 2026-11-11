#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Stability policy shared by the D1001 Wi-Fi component and its host test. */

#define D1001_WIFI_UNSTABLE_DISCONNECTS 3U
#define D1001_WIFI_UNSTABLE_WINDOW_US (120LL * 1000LL * 1000LL)
#define D1001_WIFI_WEAK_HOLD_US (60LL * 1000LL * 1000LL)
#define D1001_WIFI_WEAK_BLOCK_US (5LL * 60LL * 1000LL * 1000LL)

typedef struct {
  int64_t disconnect_us[D1001_WIFI_UNSTABLE_DISCONNECTS];
  size_t disconnect_count;
  int64_t weak_since_us;
  int64_t weak_blocked_until_us;
} d1001_wifi_stability;

void d1001_wifi_stability_init(d1001_wifi_stability *stability);

/* A preset switch starts a new stability episode; the weak-link block stays. */
void d1001_wifi_stability_reset_episode(d1001_wifi_stability *stability);

/* Association succeeded: the continuous weakness timer starts over. */
void d1001_wifi_stability_connected(d1001_wifi_stability *stability);

/* The link dropped: the continuous weakness timer starts over. */
void d1001_wifi_stability_disconnected(d1001_wifi_stability *stability);

/* Records an associated disconnect. True on the third one within 120 s. */
bool d1001_wifi_stability_note_disconnect(d1001_wifi_stability *stability,
                                          int64_t now_us);

/* Samples a connected RSSI. True when the link stayed below 'threshold_dbm'
 * for 60 s and the five-minute weak-link block has expired. */
bool d1001_wifi_stability_note_rssi(d1001_wifi_stability *stability,
                                    int64_t now_us, int rssi_dbm,
                                    int threshold_dbm, bool can_rotate);
