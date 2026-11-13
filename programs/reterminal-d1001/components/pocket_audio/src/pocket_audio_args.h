#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "quickjs.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Convert a required argument, propagating a QuickJS exception on failure. */
bool pocket_audio_argument_i32(JSContext *ctx, int argc, JSValueConst *argv,
                               int index, int32_t *value);
bool pocket_audio_argument_f64(JSContext *ctx, int argc, JSValueConst *argv,
                               int index, double *value);

/** Require an ArrayBuffer; detached buffers and views fail with an exception. */
bool pocket_audio_argument_buffer(JSContext *ctx, int argc, JSValueConst *argv,
                                  int index, uint8_t **pcm, size_t *bytes);

#ifdef __cplusplus
}
#endif
