#include "pocket_audio_args.h"

bool pocket_audio_argument_i32(JSContext *ctx, int argc, JSValueConst *argv,
                               int index, int32_t *value) {
  if (index >= argc) {
    JS_ThrowTypeError(ctx, "missing argument %d", index + 1);
    return false;
  }
  if (JS_ToInt32(ctx, value, argv[index]) == 0)
    return true;
  if (!JS_HasException(ctx))
    (void)JS_ThrowTypeError(ctx, "argument %d is not an integer", index + 1);
  return false;
}

bool pocket_audio_argument_f64(JSContext *ctx, int argc, JSValueConst *argv,
                               int index, double *value) {
  if (index >= argc) {
    JS_ThrowTypeError(ctx, "missing argument %d", index + 1);
    return false;
  }
  if (JS_ToFloat64(ctx, value, argv[index]) == 0)
    return true;
  if (!JS_HasException(ctx))
    (void)JS_ThrowTypeError(ctx, "argument %d is not a number", index + 1);
  return false;
}

bool pocket_audio_argument_buffer(JSContext *ctx, int argc, JSValueConst *argv,
                                  int index, uint8_t **pcm, size_t *bytes) {
  if (index >= argc) {
    JS_ThrowTypeError(ctx, "missing argument %d", index + 1);
    return false;
  }
  if (!JS_IsArrayBuffer(argv[index])) {
    JS_ThrowTypeError(ctx, "writePcm expects an ArrayBuffer");
    return false;
  }
  size_t size = 0;
  uint8_t *data = JS_GetArrayBuffer(ctx, &size, argv[index]);
  if (data == NULL && JS_HasException(ctx))
    return false;
  /* A valid zero-length ArrayBuffer may have a NULL data pointer. */
  *pcm = data;
  *bytes = size;
  return true;
}
