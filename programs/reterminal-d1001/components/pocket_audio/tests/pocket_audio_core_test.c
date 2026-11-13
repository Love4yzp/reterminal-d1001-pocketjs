#include "pocket_audio_core.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition) do { \
  if (!(condition)) { \
    fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #condition); \
    exit(1); \
  } \
} while (0)

static pocket_audio_core core;
static int16_t rings[POCKET_AUDIO_STREAM_COUNT]
                    [POCKET_AUDIO_RING_FRAMES * POCKET_AUDIO_CHANNELS];
static int16_t out[POCKET_AUDIO_MIX_SAMPLES];
static uint8_t pcm[POCKET_AUDIO_RING_FRAMES * POCKET_AUDIO_CHANNELS * 2];

static void init_core(void) {
  memset(rings, 0, sizeof rings);
  memset(pcm, 0, sizeof pcm);
  pocket_audio_core_init(&core, &rings[0][0]);
}

static int32_t create(uint32_t rate, uint32_t channels) {
  const int32_t handle =
      pocket_audio_core_create_stream(&core, rate, channels);
  CHECK(handle >= 0);
  return handle;
}

static void fill_stereo(int16_t value, uint32_t frames) {
  CHECK(frames * 4U <= sizeof pcm);
  for (uint32_t i = 0; i < frames; ++i) {
    const uint16_t word = (uint16_t)value;
    pcm[i * 4U] = (uint8_t)(word & 0xffU);
    pcm[i * 4U + 1U] = (uint8_t)(word >> 8);
    pcm[i * 4U + 2U] = (uint8_t)(word & 0xffU);
    pcm[i * 4U + 3U] = (uint8_t)(word >> 8);
  }
}

static bool poll_event(pocket_audio_event *event) {
  return pocket_audio_core_poll(&core, event);
}

static void test_rates_ring_and_credits(void) {
  CHECK(pocket_audio_upsample_factor(44100U) == 1U);
  CHECK(pocket_audio_upsample_factor(22050U) == 2U);
  CHECK(pocket_audio_upsample_factor(11025U) == 4U);
  CHECK(pocket_audio_upsample_factor(48000U) == 0U);
  CHECK(pocket_audio_ring_queued(10U, 4U) == 6U);
  CHECK(pocket_audio_ring_free(10U, 4U) == POCKET_AUDIO_RING_FRAMES - 6U);
  CHECK(pocket_audio_ring_free(0U, POCKET_AUDIO_RING_FRAMES) == 0U);
  CHECK(pocket_audio_credit_after_write(100U, 30U) == 70U);
  CHECK(pocket_audio_credit_after_write(20U, 30U) == 0U);
}

static void test_ring_mono_stereo_and_odd_byte(void) {
  init_core();
  static int16_t ring[POCKET_AUDIO_RING_FRAMES * POCKET_AUDIO_CHANNELS];
  const uint8_t mono[] = {0x34, 0x12, 0x78, 0x56, 0x00};
  CHECK(pocket_audio_ring_write(ring, 0U, 0U, 1U, mono, sizeof mono) == 2U);
  CHECK(ring[0] == 0x1234 && ring[1] == 0x1234);
  CHECK(ring[2] == 0x5678 && ring[3] == 0x5678);

  const uint8_t stereo[] = {0x01, 0x00, 0x02, 0x00, 0xff, 0xff, 0x00, 0x80};
  CHECK(pocket_audio_ring_write(ring, 2U, 0U, 2U, stereo, sizeof stereo) == 2U);
  CHECK(ring[4] == 1 && ring[5] == 2);
  CHECK(ring[6] == -1 && ring[7] == -32768);

  const uint32_t near_end = POCKET_AUDIO_RING_FRAMES - 1U;
  const uint8_t wrap[] = {0x11, 0x00, 0x22, 0x00, 0x33, 0x00, 0x44, 0x00};
  CHECK(pocket_audio_ring_write(ring, near_end, near_end, 2U, wrap, sizeof wrap) == 2U);
  CHECK(ring[(POCKET_AUDIO_RING_FRAMES - 1U) * 2U] == 0x11);
  CHECK(ring[0] == 0x33 && ring[1] == 0x44);
}

static void test_create_limits_and_generation(void) {
  init_core();
  CHECK(pocket_audio_core_create_stream(&core, 48000U, 2U) < 0);
  CHECK(pocket_audio_core_create_stream(&core, 44100U, 0U) < 0);
  CHECK(pocket_audio_core_create_stream(&core, 44100U, 3U) < 0);
  int32_t handles[POCKET_AUDIO_STREAM_COUNT];
  for (size_t i = 0; i < POCKET_AUDIO_STREAM_COUNT; ++i)
    handles[i] = create(44100U, 2U);
  CHECK(pocket_audio_core_create_stream(&core, 44100U, 2U) < 0);
  CHECK((handles[0] & 7) != (handles[1] & 7));
  const int32_t old = handles[0];
  pocket_audio_core_destroy_stream(&core, old);
  const int32_t reused = create(44100U, 1U);
  CHECK((reused & 7) == (old & 7));
  CHECK(reused != old);
  CHECK(pocket_audio_core_write_pcm(&core, old, pcm, sizeof pcm) == 0);
  CHECK(pocket_audio_core_write_pcm(&core, reused, pcm, sizeof pcm) > 0);
}

static void test_four_stream_mix(void) {
  init_core();
  int32_t handles[POCKET_AUDIO_STREAM_COUNT];
  fill_stereo(1000, 1024U);
  for (size_t i = 0; i < POCKET_AUDIO_STREAM_COUNT; ++i) {
    handles[i] = create(44100U, 2U);
    CHECK(pocket_audio_core_write_pcm(&core, handles[i], pcm, 1024U * 4U) == 1024);
    pocket_audio_core_play(&core, handles[i]);
  }
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 4000);
  for (size_t i = 0; i < POCKET_AUDIO_STREAM_COUNT; ++i)
    CHECK(core.streams[(uint32_t)handles[i] & 7U].read_pos == 1024U);
}

static void test_dual_stream_pause_and_stop(void) {
  init_core();
  const int32_t a = create(44100U, 2U);
  const int32_t b = create(44100U, 2U);
  fill_stereo(1000, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, a, pcm, 1024U * 4U) == 1024);
  fill_stereo(2000, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, b, pcm, 1024U * 4U) == 1024);
  pocket_audio_core_play(&core, a);
  pocket_audio_core_play(&core, b);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 3000);

  fill_stereo(1000, 2048U);
  CHECK(pocket_audio_core_write_pcm(&core, a, pcm, 2048U * 4U) == 2048);
  fill_stereo(2000, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, b, pcm, 1024U * 4U) == 1024);
  pocket_audio_core_pause(&core, a);
  CHECK(!core.streams[(uint32_t)a & 7U].playing);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 2000);
  CHECK(core.streams[(uint32_t)a & 7U].read_pos == 1024U);
  CHECK(core.streams[(uint32_t)b & 7U].read_pos == 2048U);

  fill_stereo(2000, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, b, pcm, 1024U * 4U) == 1024);
  pocket_audio_core_stop(&core, a);
  CHECK(core.streams[(uint32_t)a & 7U].read_pos ==
        core.streams[(uint32_t)a & 7U].write_pos);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 2000);
  CHECK(core.streams[(uint32_t)a & 7U].read_pos ==
        core.streams[(uint32_t)a & 7U].write_pos);
}

static void fill_queue(pocket_audio_event_queue *queue,
                       pocket_audio_event_type type, int32_t handle) {
  queue->head = 0;
  queue->count = POCKET_AUDIO_EVENT_CAPACITY;
  for (size_t i = 0; i < POCKET_AUDIO_EVENT_CAPACITY; ++i) {
    queue->events[i] = (pocket_audio_event){
        .type = type,
        .handle = handle,
        .free_frames = (uint32_t)i,
    };
  }
}

static void test_event_queue_saturation(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  pocket_audio_core_play(&core, handle);
  pocket_audio_core_end_stream(&core, handle);
  fill_queue(&core.pending, POCKET_AUDIO_EVENT_CREDIT, handle);
  fill_queue(&core.latched, POCKET_AUDIO_EVENT_CREDIT, handle);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  CHECK(pocket_audio_core_dropped_events(&core) == 0U);

  pocket_audio_event event;
  CHECK(pocket_audio_core_poll(&core, &event));
  bool ended = false;
  for (int round = 0; round < 3; ++round) {
    pocket_audio_core_latch(&core);
    while (poll_event(&event)) {
      if (event.type == POCKET_AUDIO_EVENT_ENDED && event.handle == handle)
        ended = true;
    }
  }
  CHECK(ended);

  init_core();
  const int32_t second = create(44100U, 2U);
  pocket_audio_core_play(&core, second);
  fill_queue(&core.pending, POCKET_AUDIO_EVENT_CREDIT, 0x7fffffff);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  CHECK(pocket_audio_core_dropped_events(&core) == 1U);

  init_core();
  const int32_t third = create(44100U, 2U);
  pocket_audio_core_play(&core, third);
  fill_queue(&core.pending, POCKET_AUDIO_EVENT_UNDERRUN, third);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  CHECK(pocket_audio_core_dropped_events(&core) == 1U);
}

static void test_overflow_reporter(void) {
  pocket_audio_overflow_reporter reporter = {0};
  CHECK(!pocket_audio_overflow_observe(&reporter, 0U, 0U, 1000U));
  CHECK(pocket_audio_overflow_observe(&reporter, 1U, 1000U, 1000U));
  CHECK(reporter.reported == 1U);
  CHECK(!pocket_audio_overflow_observe(&reporter, 1U, 1500U, 1000U));
  CHECK(!pocket_audio_overflow_observe(&reporter, 2U, 1500U, 1000U));
  CHECK(reporter.reported == 2U);
  CHECK(!pocket_audio_overflow_observe(&reporter, 2U, 2000U, 1000U));
  CHECK(pocket_audio_overflow_observe(&reporter, 3U, 2500U, 1000U));
  CHECK(!pocket_audio_overflow_observe(&reporter, 3U, 2600U, 1000U));
}

static void test_stop_flush_and_full_reuse(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  fill_stereo(0x0aaa, 2048U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 2048U * 4U) == 2048);
  pocket_audio_core_play(&core, handle);
  CHECK(pocket_audio_core_mix_block(&core, out));
  const uint32_t slot = (uint32_t)handle & 7U;
  CHECK(core.streams[slot].read_pos == 1024U);

  pocket_audio_core_stop(&core, handle);
  CHECK(!core.streams[slot].playing);
  CHECK(core.streams[slot].read_pos == core.streams[slot].write_pos);

  fill_stereo(0x1234, 16384U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 16384U * 4U) == 16384);
  pocket_audio_core_play(&core, handle);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(core.streams[slot].read_pos == 3072U);
  CHECK(out[0] == 0x1234 && out[1] == 0x1234);
  pocket_audio_core_latch(&core);
  pocket_audio_event event;
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_CREDIT);
  CHECK(event.handle == handle);
  CHECK(event.free_frames == 1024U);
}

static void test_slot_reuse_events(void) {
  init_core();
  const int32_t old = create(44100U, 2U);
  pocket_audio_core_play(&core, old);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_destroy_stream(&core, old);
  const int32_t reused = create(44100U, 2U);
  CHECK((reused & 7) == (old & 7));
  CHECK(reused != old);
  fill_stereo(0x2222, 2U);
  CHECK(pocket_audio_core_write_pcm(&core, reused, pcm, 2U * 4U) == 2);
  pocket_audio_core_play(&core, reused);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 0x2222);
  CHECK(core.streams[(uint32_t)reused & 7U].read_pos == 2U);
  pocket_audio_core_latch(&core);
  pocket_audio_event event;
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);
  CHECK(event.handle == old);
  CHECK(event.handle != reused);
}

static void test_tick_boundary_and_events(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  pocket_audio_core_play(&core, handle);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_event event;
  CHECK(!poll_event(&event));
  pocket_audio_core_latch(&core);
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);
  CHECK(event.handle == handle);

  fill_stereo(0x0102, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 1024U * 4U) == 1024);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_latch(&core);
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);

  pocket_audio_core_stop(&core, handle);
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_CREDIT);
  CHECK(event.handle == handle);
}

static void test_multiple_underruns_same_latch(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  pocket_audio_core_play(&core, handle);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  fill_stereo(0x0203, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 1024U * 4U) == 1024);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_latch(&core);
  pocket_audio_event event;
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);
  CHECK(event.handle == handle);
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);
  CHECK(event.handle == handle);
}

static void test_latch_orders_pending_then_credit(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  fill_stereo(0x0102, 1024U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 1024U * 4U) == 1024);
  pocket_audio_core_play(&core, handle);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_latch(&core);
  pocket_audio_event event;
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_CREDIT);
  CHECK(event.handle == handle);
  CHECK(event.free_frames == POCKET_AUDIO_RING_FRAMES);
  pocket_audio_core_latch(&core);
  CHECK(!poll_event(&event));
}

static void test_stop_does_not_erase_events(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  pocket_audio_core_play(&core, handle);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_latch(&core);
  pocket_audio_core_stop(&core, handle);
  pocket_audio_event event;
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);

  init_core();
  const int32_t second = create(44100U, 2U);
  pocket_audio_core_play(&core, second);
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_stop(&core, second);
  pocket_audio_core_latch(&core);
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_UNDERRUN);
}

static void test_pause_and_volume(void) {
  init_core();
  const int32_t handle = create(44100U, 2U);
  fill_stereo(1000, 4U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 4U * 4U) == 4);
  pocket_audio_core_play(&core, handle);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 1000);

  fill_stereo(2000, 4U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 4U * 4U) == 4);
  pocket_audio_core_set_volume(&core, handle, 0.0);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 0);

  pocket_audio_core_pause(&core, handle);
  CHECK(!pocket_audio_core_any_playing(&core));
  CHECK(!pocket_audio_core_mix_block(&core, out));
  pocket_audio_core_play(&core, handle);
  pocket_audio_core_set_volume(&core, handle, 0.5);
  fill_stereo(1000, 4U);
  CHECK(pocket_audio_core_write_pcm(&core, handle, pcm, 4U * 4U) == 4);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 500);
}

static void test_end_and_interpolation(void) {
  init_core();
  const int32_t handle = create(22050U, 1U);
  const uint8_t mono[] = {0xe8, 0x03, 0xd0, 0x07}; /* 1000, 2000 */
  CHECK(pocket_audio_core_write_pcm(&core, handle, mono, sizeof mono) == 2);
  pocket_audio_core_play(&core, handle);
  pocket_audio_core_end_stream(&core, handle);
  CHECK(pocket_audio_core_mix_block(&core, out));
  CHECK(out[0] == 500 && out[1] == 500);
  CHECK(out[2] == 1000 && out[3] == 1000);
  CHECK(out[4] == 1500 && out[5] == 1500);
  CHECK(out[6] == 2000 && out[7] == 2000);
  CHECK(!core.streams[(uint32_t)handle & 7U].playing);
  pocket_audio_core_latch(&core);
  pocket_audio_event event;
  CHECK(poll_event(&event));
  CHECK(event.type == POCKET_AUDIO_EVENT_ENDED);
  CHECK(event.handle == handle);

  CHECK(pocket_audio_lerp(0, 100, 1U, 2U) == 50);
  CHECK(pocket_audio_lerp(0, 100, 3U, 4U) == 75);
  CHECK(pocket_audio_clip(40000) == 32767);
  CHECK(pocket_audio_clip(-40000) == -32768);
}

int main(void) {
  test_rates_ring_and_credits();
  test_ring_mono_stereo_and_odd_byte();
  test_create_limits_and_generation();
  test_four_stream_mix();
  test_dual_stream_pause_and_stop();
  test_event_queue_saturation();
  test_overflow_reporter();
  test_stop_flush_and_full_reuse();
  test_slot_reuse_events();
  test_tick_boundary_and_events();
  test_multiple_underruns_same_latch();
  test_latch_orders_pending_then_credit();
  test_stop_does_not_erase_events();
  test_pause_and_volume();
  test_end_and_interpolation();
  puts("pocket_audio_core: all checks passed");
  return 0;
}
