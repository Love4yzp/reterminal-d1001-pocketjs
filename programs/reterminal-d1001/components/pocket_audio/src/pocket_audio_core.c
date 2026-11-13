#include "pocket_audio_core.h"

#include <stdbool.h>
#include <string.h>

#define AUDIO_HANDLE_GENERATION_MAX 0x0fffffffU

static uint32_t minimum(uint32_t a, uint32_t b) { return a < b ? a : b; }

static int16_t read_s16le(const uint8_t *bytes) {
  return (int16_t)(uint16_t)((uint16_t)bytes[0] | ((uint16_t)bytes[1] << 8));
}

static int queue_find(const pocket_audio_event_queue *queue,
                      pocket_audio_event_type type, int32_t handle) {
  for (size_t i = 0; i < queue->count; ++i) {
    const size_t index = (queue->head + i) % POCKET_AUDIO_EVENT_CAPACITY;
    const pocket_audio_event *event = &queue->events[index];
    if (event->type == type && event->handle == handle)
      return (int)i;
  }
  return -1;
}

static void queue_remove_at(pocket_audio_event_queue *queue, size_t index) {
  for (size_t i = index; i + 1U < queue->count; ++i) {
    const size_t dst = (queue->head + i) % POCKET_AUDIO_EVENT_CAPACITY;
    const size_t src = (queue->head + i + 1U) % POCKET_AUDIO_EVENT_CAPACITY;
    queue->events[dst] = queue->events[src];
  }
  --queue->count;
}

static void queue_append(pocket_audio_event_queue *queue,
                         const pocket_audio_event *event) {
  queue->events[(queue->head + queue->count) % POCKET_AUDIO_EVENT_CAPACITY] =
      *event;
  ++queue->count;
}

typedef enum {
  QUEUE_PUSH_OK = 0,
  QUEUE_PUSH_LOSSY_MERGE,
  QUEUE_PUSH_DROPPED,
} queue_push_result;

static queue_push_result queue_push(pocket_audio_event_queue *queue,
                                    const pocket_audio_event *event) {
  /* Credit is a latest-value fact; coalesce it even before the queue fills. */
  const int credit = queue_find(queue, POCKET_AUDIO_EVENT_CREDIT,
                                event->handle);
  if (event->type == POCKET_AUDIO_EVENT_CREDIT && credit >= 0) {
    const size_t index =
        (queue->head + (size_t)credit) % POCKET_AUDIO_EVENT_CAPACITY;
    queue->events[index].free_frames = event->free_frames;
    return QUEUE_PUSH_OK;
  }
  if (queue->count < POCKET_AUDIO_EVENT_CAPACITY) {
    queue_append(queue, event);
    return QUEUE_PUSH_OK;
  }

  /* Preserve ended over lower-priority facts from the same stream. */
  if (event->type == POCKET_AUDIO_EVENT_ENDED) {
    int victim = queue_find(queue, POCKET_AUDIO_EVENT_CREDIT, event->handle);
    if (victim < 0)
      victim = queue_find(queue, POCKET_AUDIO_EVENT_UNDERRUN, event->handle);
    if (victim < 0) {
      for (size_t i = 0; i < queue->count; ++i) {
        const size_t index = (queue->head + i) % POCKET_AUDIO_EVENT_CAPACITY;
        if (queue->events[index].type == POCKET_AUDIO_EVENT_CREDIT) {
          victim = (int)i;
          break;
        }
      }
    }
    if (victim < 0) {
      for (size_t i = 0; i < queue->count; ++i) {
        const size_t index = (queue->head + i) % POCKET_AUDIO_EVENT_CAPACITY;
        if (queue->events[index].type == POCKET_AUDIO_EVENT_UNDERRUN) {
          victim = (int)i;
          break;
        }
      }
    }
    if (victim >= 0) {
      queue_remove_at(queue, (size_t)victim);
      queue_append(queue, event);
      return QUEUE_PUSH_OK;
    }
  } else if (event->type == POCKET_AUDIO_EVENT_UNDERRUN) {
    if (queue_find(queue, POCKET_AUDIO_EVENT_UNDERRUN, event->handle) >= 0)
      return QUEUE_PUSH_LOSSY_MERGE;
    const int victim =
        queue_find(queue, POCKET_AUDIO_EVENT_CREDIT, event->handle);
    if (victim >= 0) {
      queue_remove_at(queue, (size_t)victim);
      queue_append(queue, event);
      return QUEUE_PUSH_OK;
    }
  }
  return QUEUE_PUSH_DROPPED;
}

static bool queue_pop(pocket_audio_event_queue *queue,
                      pocket_audio_event *event) {
  if (queue->count == 0)
    return false;
  *event = queue->events[queue->head];
  queue->head = (queue->head + 1U) % POCKET_AUDIO_EVENT_CAPACITY;
  --queue->count;
  return true;
}

static int32_t handle_of(uint32_t slot, uint32_t generation) {
  return (int32_t)((generation << 3) | slot);
}

static int slot_of(const pocket_audio_core *core, int32_t handle) {
  if (handle < 0)
    return -1;
  const uint32_t slot = (uint32_t)handle & 7U;
  if (slot >= POCKET_AUDIO_STREAM_COUNT)
    return -1;
  const pocket_audio_stream *stream = &core->streams[slot];
  if (!stream->live || stream->generation != ((uint32_t)handle >> 3))
    return -1;
  return (int)slot;
}

static void append_event(pocket_audio_core *core, pocket_audio_event_type type,
                         int32_t handle, uint32_t free_frames) {
  const pocket_audio_event event = {
      .type = type,
      .handle = handle,
      .free_frames = free_frames,
  };
  if (queue_push(&core->pending, &event) != QUEUE_PUSH_OK)
    ++core->dropped_events;
}

void pocket_audio_core_init(pocket_audio_core *core, int16_t *rings) {
  memset(core, 0, sizeof *core);
  for (size_t slot = 0; slot < POCKET_AUDIO_STREAM_COUNT; ++slot) {
    core->streams[slot].ring =
        rings + slot * POCKET_AUDIO_RING_FRAMES * POCKET_AUDIO_CHANNELS;
    core->streams[slot].last_free = POCKET_AUDIO_RING_FRAMES;
  }
}

void pocket_audio_core_reset(pocket_audio_core *core) {
  memset(core, 0, sizeof *core);
}

int32_t pocket_audio_core_create_stream(pocket_audio_core *core,
                                        uint32_t sample_rate,
                                        uint32_t channels) {
  const uint32_t upsample = pocket_audio_upsample_factor(sample_rate);
  if (upsample == 0U || channels < 1U || channels > POCKET_AUDIO_CHANNELS)
    return -1;
  for (uint32_t slot = 0; slot < POCKET_AUDIO_STREAM_COUNT; ++slot) {
    pocket_audio_stream *stream = &core->streams[slot];
    if (stream->live)
      continue;
    uint32_t generation = (stream->generation + 1U) & AUDIO_HANDLE_GENERATION_MAX;
    if (generation == 0U)
      generation = 1U;
    stream->generation = generation;
    stream->channels = channels;
    stream->upsample = upsample;
    stream->write_pos = 0U;
    stream->read_pos = 0U;
    stream->volume = 256;
    stream->last_free = POCKET_AUDIO_RING_FRAMES;
    stream->playing = false;
    stream->end_flagged = false;
    stream->starved = false;
    stream->reset_interp = true;
    stream->live = true;
    return handle_of(slot, generation);
  }
  return -1;
}

void pocket_audio_core_destroy_stream(pocket_audio_core *core, int32_t handle) {
  const int slot = slot_of(core, handle);
  if (slot < 0)
    return;
  core->streams[slot].live = false;
  core->streams[slot].playing = false;
}

int32_t pocket_audio_core_write_pcm(pocket_audio_core *core, int32_t handle,
                                    const uint8_t *pcm, size_t bytes) {
  const int slot = slot_of(core, handle);
  if (slot < 0 || pcm == NULL)
    return 0;
  pocket_audio_stream *stream = &core->streams[slot];
  const uint32_t accepted = pocket_audio_ring_write(
      stream->ring, stream->write_pos, stream->read_pos, stream->channels, pcm,
      bytes);
  if (accepted == 0U)
    return 0;
  stream->write_pos += accepted;
  stream->last_free =
      pocket_audio_credit_after_write(stream->last_free, accepted);
  return (int32_t)accepted;
}

void pocket_audio_core_play(pocket_audio_core *core, int32_t handle) {
  const int slot = slot_of(core, handle);
  if (slot < 0)
    return;
  core->streams[slot].starved = false;
  core->streams[slot].playing = true;
}

void pocket_audio_core_pause(pocket_audio_core *core, int32_t handle) {
  const int slot = slot_of(core, handle);
  if (slot < 0)
    return;
  core->streams[slot].playing = false;
}

void pocket_audio_core_stop(pocket_audio_core *core, int32_t handle) {
  const int slot = slot_of(core, handle);
  if (slot < 0)
    return;
  pocket_audio_stream *stream = &core->streams[slot];
  stream->playing = false;
  stream->read_pos = stream->write_pos;
  stream->end_flagged = false;
  stream->starved = false;
  stream->reset_interp = true;
}

void pocket_audio_core_set_volume(pocket_audio_core *core, int32_t handle,
                                  double volume) {
  const int slot = slot_of(core, handle);
  if (slot < 0)
    return;
  if (!(volume > 0.0))
    volume = 0.0;
  else if (volume > 1.0)
    volume = 1.0;
  core->streams[slot].volume = (int32_t)(volume * 256.0);
}

void pocket_audio_core_end_stream(pocket_audio_core *core, int32_t handle) {
  const int slot = slot_of(core, handle);
  if (slot < 0)
    return;
  core->streams[slot].end_flagged = true;
}

bool pocket_audio_core_any_playing(const pocket_audio_core *core) {
  for (size_t slot = 0; slot < POCKET_AUDIO_STREAM_COUNT; ++slot)
    if (core->streams[slot].live && core->streams[slot].playing)
      return true;
  return false;
}

bool pocket_audio_core_mix_block(pocket_audio_core *core, int16_t *out) {
  bool contributed = false;
  memset(core->mix, 0, sizeof core->mix);
  memset(out, 0, sizeof(int16_t) * POCKET_AUDIO_MIX_SAMPLES);
  for (uint32_t slot = 0; slot < POCKET_AUDIO_STREAM_COUNT; ++slot) {
    pocket_audio_stream *stream = &core->streams[slot];
    if (!stream->live || !stream->playing)
      continue;
    if (stream->reset_interp) {
      stream->previous[0] = 0;
      stream->previous[1] = 0;
      stream->reset_interp = false;
    }
    const uint32_t factor = stream->upsample;
    if (factor == 0U || factor > 4U)
      continue;
    const uint32_t need = POCKET_AUDIO_BLOCK_FRAMES / factor;
    const uint32_t available = stream->write_pos - stream->read_pos;
    const uint32_t take = minimum(available, need);
    for (uint32_t i = 0; i < take; ++i) {
      const uint32_t source =
          ((stream->read_pos + i) % POCKET_AUDIO_RING_FRAMES) *
          POCKET_AUDIO_CHANNELS;
      const int32_t left =
          ((int32_t)stream->ring[source] * stream->volume) >> 8;
      const int32_t right =
          ((int32_t)stream->ring[source + 1U] * stream->volume) >> 8;
      for (uint32_t step = 0; step < factor; ++step) {
        const uint32_t mix_at =
            (i * factor + step) * POCKET_AUDIO_CHANNELS;
        core->mix[mix_at] += pocket_audio_lerp(
            (int16_t)stream->previous[0], (int16_t)left, step + 1U, factor);
        core->mix[mix_at + 1U] += pocket_audio_lerp(
            (int16_t)stream->previous[1], (int16_t)right, step + 1U, factor);
      }
      stream->previous[0] = left;
      stream->previous[1] = right;
    }
    if (take > 0U)
      contributed = true;
    stream->read_pos += take;
    const int32_t handle = handle_of(slot, stream->generation);
    if (take < need) {
      if (stream->end_flagged && available == take) {
        stream->playing = false;
        stream->end_flagged = false;
        append_event(core, POCKET_AUDIO_EVENT_ENDED, handle, 0U);
      } else if (!stream->starved) {
        stream->starved = true;
        append_event(core, POCKET_AUDIO_EVENT_UNDERRUN, handle, 0U);
      }
    } else {
      stream->starved = false;
    }
  }
  if (!contributed)
    return false;
  for (size_t i = 0; i < POCKET_AUDIO_MIX_SAMPLES; ++i)
    out[i] = pocket_audio_clip(core->mix[i]);
  return true;
}

void pocket_audio_core_latch(pocket_audio_core *core) {
  pocket_audio_event event;
  while (core->pending.count > 0 &&
         core->latched.count < POCKET_AUDIO_EVENT_CAPACITY) {
    if (!queue_pop(&core->pending, &event))
      break;
    if (queue_push(&core->latched, &event) != QUEUE_PUSH_OK)
      break;
  }
  for (size_t slot = 0; slot < POCKET_AUDIO_STREAM_COUNT; ++slot) {
    if (core->latched.count >= POCKET_AUDIO_EVENT_CAPACITY)
      break;
    pocket_audio_stream *stream = &core->streams[slot];
    if (!stream->live)
      continue;
    const uint32_t free =
        pocket_audio_ring_free(stream->write_pos, stream->read_pos);
    if (free == stream->last_free)
      continue;
    event = (pocket_audio_event){
        .type = POCKET_AUDIO_EVENT_CREDIT,
        .handle = handle_of(slot, stream->generation),
        .free_frames = free,
    };
    if (queue_push(&core->latched, &event) != QUEUE_PUSH_OK) {
      ++core->dropped_events;
      break;
    }
    stream->last_free = free;
  }
}

bool pocket_audio_core_poll(pocket_audio_core *core,
                            pocket_audio_event *event) {
  return queue_pop(&core->latched, event);
}

uint32_t pocket_audio_core_dropped_events(const pocket_audio_core *core) {
  return core->dropped_events;
}

bool pocket_audio_overflow_observe(pocket_audio_overflow_reporter *reporter,
                                   uint32_t dropped, uint32_t now_ms,
                                   uint32_t interval_ms) {
  if (dropped == reporter->reported)
    return false;
  const bool increased = dropped > reporter->reported;
  reporter->reported = dropped;
  if (!increased)
    return false;
  if (reporter->logged && now_ms - reporter->last_log_ms < interval_ms)
    return false;
  reporter->logged = true;
  reporter->last_log_ms = now_ms;
  return true;
}

uint32_t pocket_audio_upsample_factor(uint32_t sample_rate) {
  switch (sample_rate) {
  case 44100U:
    return 1U;
  case 22050U:
    return 2U;
  case 11025U:
    return 4U;
  default:
    return 0U;
  }
}

uint32_t pocket_audio_ring_queued(uint32_t write_pos, uint32_t read_pos) {
  return write_pos - read_pos;
}

uint32_t pocket_audio_ring_free(uint32_t write_pos, uint32_t read_pos) {
  return POCKET_AUDIO_RING_FRAMES -
         minimum(pocket_audio_ring_queued(write_pos, read_pos),
                 POCKET_AUDIO_RING_FRAMES);
}

uint32_t pocket_audio_credit_after_write(uint32_t last_free,
                                         uint32_t accepted) {
  return accepted >= last_free ? 0U : last_free - accepted;
}

uint32_t pocket_audio_ring_write(int16_t *ring, uint32_t write_pos,
                                 uint32_t read_pos, uint32_t channels,
                                 const uint8_t *pcm, size_t bytes) {
  if (ring == NULL || pcm == NULL || (channels != 1U && channels != 2U))
    return 0U;
  const uint32_t frames = (uint32_t)(bytes / (2U * channels));
  const uint32_t free = pocket_audio_ring_free(write_pos, read_pos);
  const uint32_t accepted = minimum(frames, free);
  for (uint32_t i = 0; i < accepted; ++i) {
    const uint32_t dst =
        ((write_pos + i) % POCKET_AUDIO_RING_FRAMES) * POCKET_AUDIO_CHANNELS;
    if (channels == 1U) {
      const int16_t sample = read_s16le(pcm + (size_t)i * 2U);
      ring[dst] = sample;
      ring[dst + 1U] = sample;
    } else {
      ring[dst] = read_s16le(pcm + (size_t)i * 4U);
      ring[dst + 1U] = read_s16le(pcm + (size_t)i * 4U + 2U);
    }
  }
  return accepted;
}

int16_t pocket_audio_lerp(int16_t previous, int16_t current, uint32_t step,
                          uint32_t factor) {
  if (factor == 0U)
    return current;
  const int32_t previous_part =
      (int32_t)previous * (int32_t)(factor - minimum(step, factor));
  const int32_t current_part = (int32_t)current * (int32_t)minimum(step, factor);
  return pocket_audio_clip((previous_part + current_part) / (int32_t)factor);
}

int16_t pocket_audio_clip(int32_t sample) {
  if (sample > INT16_MAX)
    return INT16_MAX;
  if (sample < INT16_MIN)
    return INT16_MIN;
  return (int16_t)sample;
}
