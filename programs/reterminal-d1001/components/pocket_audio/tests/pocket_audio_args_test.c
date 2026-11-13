#include "pocket_audio_args.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(condition) do { \
  if (!(condition)) { \
    fprintf(stderr, "CHECK failed at line %d: %s\n", __LINE__, #condition); \
    exit(1); \
  } \
} while (0)

static void clear_exception(JSContext *ctx) {
  CHECK(JS_HasException(ctx));
  JS_FreeValue(ctx, JS_GetException(ctx));
}

static JSValue evaluate(JSContext *ctx, const char *source) {
  JSValue value = JS_Eval(ctx, source, strlen(source), "<audio-args>",
                          JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(value)) {
    JSValue exception = JS_GetException(ctx);
    const char *text = JS_ToCString(ctx, exception);
    fprintf(stderr, "eval failed: %s\n", text != NULL ? text : "?");
    if (text != NULL)
      JS_FreeCString(ctx, text);
    JS_FreeValue(ctx, exception);
    exit(1);
  }
  return value;
}

typedef struct {
  int32_t handle;
} mock_stream;

/* Mirrors the adapter guard: state changes only after conversion succeeds. */
static bool mock_set_handle(JSContext *ctx, int argc, JSValueConst *argv,
                            mock_stream *stream) {
  int32_t handle = stream->handle;
  if (!pocket_audio_argument_i32(ctx, argc, argv, 0, &handle))
    return false;
  stream->handle = handle;
  return true;
}

int main(void) {
  JSRuntime *runtime = JS_NewRuntime();
  CHECK(runtime != NULL);
  JSContext *ctx = JS_NewContext(runtime);
  CHECK(ctx != NULL);

  int32_t integer = 0;
  JSValue value = evaluate(ctx, "42");
  CHECK(pocket_audio_argument_i32(ctx, 1, &value, 0, &integer));
  CHECK(integer == 42);
  JS_FreeValue(ctx, value);

  double number = 0.0;
  value = evaluate(ctx, "2.5");
  CHECK(pocket_audio_argument_f64(ctx, 1, &value, 0, &number));
  CHECK(number == 2.5);
  JS_FreeValue(ctx, value);

  CHECK(!pocket_audio_argument_i32(ctx, 0, NULL, 0, &integer));
  clear_exception(ctx);
  CHECK(!pocket_audio_argument_f64(ctx, 0, NULL, 0, &number));
  clear_exception(ctx);

  value = evaluate(ctx, "Symbol('handle')");
  CHECK(!pocket_audio_argument_i32(ctx, 1, &value, 0, &integer));
  clear_exception(ctx);
  JS_FreeValue(ctx, value);

  value = evaluate(ctx, "({ valueOf() { throw new Error('boom'); } })");
  CHECK(!pocket_audio_argument_f64(ctx, 1, &value, 0, &number));
  clear_exception(ctx);
  JS_FreeValue(ctx, value);

  value = evaluate(ctx, "new Uint8Array(4)");
  uint8_t *pcm = NULL;
  size_t bytes = 0;
  CHECK(!pocket_audio_argument_buffer(ctx, 1, &value, 0, &pcm, &bytes));
  clear_exception(ctx);
  JS_FreeValue(ctx, value);

  CHECK(!pocket_audio_argument_buffer(ctx, 0, NULL, 0, &pcm, &bytes));
  clear_exception(ctx);

  value = evaluate(ctx, "new ArrayBuffer(0)");
  CHECK(pocket_audio_argument_buffer(ctx, 1, &value, 0, &pcm, &bytes));
  CHECK(bytes == 0U);
  JS_FreeValue(ctx, value);

  value = evaluate(ctx, "new ArrayBuffer(8)");
  CHECK(pocket_audio_argument_buffer(ctx, 1, &value, 0, &pcm, &bytes));
  CHECK(bytes == 8);
  CHECK(pcm != NULL);
  JS_FreeValue(ctx, value);

  value = evaluate(ctx, "new ArrayBuffer(8)");
  JS_DetachArrayBuffer(ctx, value);
  CHECK(!pocket_audio_argument_buffer(ctx, 1, &value, 0, &pcm, &bytes));
  clear_exception(ctx);
  JS_FreeValue(ctx, value);

  mock_stream stream = {.handle = 7};
  value = evaluate(ctx, "Symbol('handle')");
  CHECK(!mock_set_handle(ctx, 1, &value, &stream));
  CHECK(stream.handle == 7);
  clear_exception(ctx);
  JS_FreeValue(ctx, value);
  value = evaluate(ctx, "42");
  CHECK(mock_set_handle(ctx, 1, &value, &stream));
  CHECK(stream.handle == 42);
  JS_FreeValue(ctx, value);

  JS_FreeContext(ctx);
  JS_FreeRuntime(runtime);
  puts("pocket_audio_args: all checks passed");
  return 0;
}
