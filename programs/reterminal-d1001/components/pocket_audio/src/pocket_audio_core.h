#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define POCKET_AUDIO_STREAM_COUNT 4U
#define POCKET_AUDIO_RING_FRAMES 16384U
#define POCKET_AUDIO_BLOCK_FRAMES 1024U
#define POCKET_AUDIO_CHANNELS 2U
#define POCKET_AUDIO_EVENT_CAPACITY 64U
#define POCKET_AUDIO_MIX_SAMPLES (POCKET_AUDIO_BLOCK_FRAMES * POCKET_AUDIO_CHANNELS)

typedef enum {
  POCKET_AUDIO_EVENT_ENDED = 1,
  POCKET_AUDIO_EVENT_UNDERRUN,
  POCKET_AUDIO_EVENT_CREDIT,
} pocket_audio_event_type;

typedef struct {
  pocket_audio_event_type type;
  int32_t handle;
  uint32_t free_frames;
} pocket_audio_event;

typedef struct {
  pocket_audio_event events[POCKET_AUDIO_EVENT_CAPACITY];
  size_t head;
  size_t count;
} pocket_audio_event_queue;

typedef struct {
  bool live;
  bool playing;
  bool end_flagged;
  bool starved;
  bool reset_interp;
  uint32_t generation;
  uint32_t channels;
  uint32_t upsample;
  uint32_t write_pos;
  uint32_t read_pos;
  int32_t volume; /* 0..256 fixed point */
  uint32_t last_free;
  int32_t previous[2];
  int16_t *ring;
} pocket_audio_stream;

typedef struct {
  pocket_audio_stream streams[POCKET_AUDIO_STREAM_COUNT];
  pocket_audio_event_queue pending;
  pocket_audio_event_queue latched;
  int32_t mix[POCKET_AUDIO_MIX_SAMPLES];
  uint32_t dropped_events;
} pocket_audio_core;

typedef struct {
  uint32_t reported;
  uint32_t last_log_ms;
  bool logged;
} pocket_audio_overflow_reporter;

/**
 * The pure core has no locks. The FreeRTOS adapter serializes every state
 * function with its state mutex, and serializes the mix-plus-I2S commit with
 * a separate write mutex. The core never calls I2S or blocks.
 */
void pocket_audio_core_init(pocket_audio_core *core, int16_t *rings);
void pocket_audio_core_reset(pocket_audio_core *core);

int32_t pocket_audio_core_create_stream(pocket_audio_core *core,
                                        uint32_t sample_rate,
                                        uint32_t channels);
void pocket_audio_core_destroy_stream(pocket_audio_core *core, int32_t handle);
int32_t pocket_audio_core_write_pcm(pocket_audio_core *core, int32_t handle,
                                    const uint8_t *pcm, size_t bytes);
void pocket_audio_core_play(pocket_audio_core *core, int32_t handle);
void pocket_audio_core_pause(pocket_audio_core *core, int32_t handle);
void pocket_audio_core_stop(pocket_audio_core *core, int32_t handle);
void pocket_audio_core_set_volume(pocket_audio_core *core, int32_t handle,
                                  double volume);
void pocket_audio_core_end_stream(pocket_audio_core *core, int32_t handle);

bool pocket_audio_core_any_playing(const pocket_audio_core *core);

/** Mix one 1024-frame block into out. Returns true when any stream
 *  contributed. The output buffer holds POCKET_AUDIO_MIX_SAMPLES samples. */
bool pocket_audio_core_mix_block(pocket_audio_core *core, int16_t *out);

/** Move mixer facts into the tick boundary queue and append credit facts. */
void pocket_audio_core_latch(pocket_audio_core *core);

/** Pop one latched fact; false when the tick queue is empty. */
bool pocket_audio_core_poll(pocket_audio_core *core, pocket_audio_event *event);

/** Cumulative facts lost after merge/eviction attempts. */
uint32_t pocket_audio_core_dropped_events(const pocket_audio_core *core);

/** Track cumulative drops and rate-limit one log per interval. Returns true
 *  only when a new drop arrived and the interval elapsed. */
bool pocket_audio_overflow_observe(pocket_audio_overflow_reporter *reporter,
                                   uint32_t dropped, uint32_t now_ms,
                                   uint32_t interval_ms);

/** 44100 -> 1, 22050 -> 2, 11025 -> 4; zero means unsupported. */
uint32_t pocket_audio_upsample_factor(uint32_t sample_rate);

uint32_t pocket_audio_ring_queued(uint32_t write_pos, uint32_t read_pos);
uint32_t pocket_audio_ring_free(uint32_t write_pos, uint32_t read_pos);

/** Saturating mirror update after the guest's write was accepted. */
uint32_t pocket_audio_credit_after_write(uint32_t last_free, uint32_t accepted);

/**
 * Copy interleaved s16 LE into the stereo ring (mono is duplicated).
 * Returns accepted frames; channels must be 1 or 2.
 */
uint32_t pocket_audio_ring_write(int16_t *ring, uint32_t write_pos,
                                 uint32_t read_pos, uint32_t channels,
                                 const uint8_t *pcm, size_t bytes);

/** Linear interpolation from previous to current at 1..factor. */
int16_t pocket_audio_lerp(int16_t previous, int16_t current, uint32_t step,
                          uint32_t factor);

int16_t pocket_audio_clip(int32_t sample);

#ifdef __cplusplus
}
#endif
