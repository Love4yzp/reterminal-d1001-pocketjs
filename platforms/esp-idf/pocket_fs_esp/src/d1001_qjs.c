/* QuickJS argument and result shapes follow pocket-m5
 * programs/m5stack-tab5/components/pocket_system/src/qjs.c. */

#include "d1001_fs.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "d1001_fs_internal.h"
#include "fs.h"

enum {
  OP_FS_READ,
  OP_FS_WRITE,
  OP_FS_REMOVE,
  OP_FS_LIST,
  OP_FS_STAT,
  OP_FS_MKDIR,
  OP_FS_RENAME,
  OP_FS_USAGE,
  OP_FS_LAST_ERROR,
};

static int32_t argument_int(JSContext *ctx, int argc, JSValueConst *argv,
                            int index) {
  int32_t value = 0;
  if (index < argc)
    JS_ToInt32(ctx, &value, argv[index]);
  return value;
}

static double argument_float(JSContext *ctx, int argc, JSValueConst *argv,
                             int index) {
  double value = 0;
  if (index < argc)
    JS_ToFloat64(ctx, &value, argv[index]);
  return value;
}

static const char *argument_text(JSContext *ctx, int argc, JSValueConst *argv,
                                 int index, size_t *length) {
  *length = 0;
  if (index >= argc || !JS_IsString(argv[index]))
    return NULL;
  return JS_ToCStringLen(ctx, length, argv[index]);
}

static void free_text(JSContext *ctx, const char *text) {
  if (text != NULL)
    JS_FreeCString(ctx, text);
}

typedef enum {
  RESULT_UNDEFINED,
  RESULT_TEXT,
  RESULT_INT,
} ResultKind;

typedef struct {
  int magic;
  const char *text;
  size_t length;
  const char *second;
  size_t second_length;
  int32_t number;
  double first_float;
  double second_float;
  ResultKind kind;
  const char *out_text;
  int32_t out_int;
} Request;

static void text_result(Request *request, const char *text) {
  request->kind = RESULT_TEXT;
  request->out_text = text;
}

static void fs_result(Request *request, const char *line) {
  text_result(request, line != NULL ? line : "{\"error\":\"out of memory\"}");
}

static void int_result(Request *request, int32_t value) {
  request->kind = RESULT_INT;
  request->out_int = value;
}

static void perform(void *argument) {
  Request *request = argument;
  request->kind = RESULT_UNDEFINED;
  switch (request->magic) {
  case OP_FS_READ:
    fs_result(request, fs_read(request->text, request->length,
                               request->first_float, request->second_float));
    break;
  case OP_FS_WRITE:
    int_result(request,
               fs_write(request->text, request->length, request->second,
                        request->second_length, request->number));
    break;
  case OP_FS_REMOVE:
    int_result(request,
               fs_remove(request->text, request->length, request->number));
    break;
  case OP_FS_LIST:
    fs_result(request,
              fs_list(request->text, request->length, request->first_float));
    break;
  case OP_FS_STAT:
    fs_result(request, fs_stat(request->text, request->length));
    break;
  case OP_FS_MKDIR:
    int_result(request, fs_mkdir(request->text, request->length));
    break;
  case OP_FS_RENAME:
    int_result(request, fs_rename(request->text, request->length,
                                  request->second, request->second_length));
    break;
  case OP_FS_USAGE:
    fs_result(request, fs_usage());
    break;
  case OP_FS_LAST_ERROR:
    text_result(request, fs_last_error());
    break;
  default:
    break;
  }
}

static JSValue operation(JSContext *ctx, JSValueConst this_value, int argc,
                         JSValueConst *argv, int magic) {
  (void)this_value;
  Request request = {.magic = magic};
  switch (magic) {
  case OP_FS_READ:
  case OP_FS_LIST:
    request.text = argument_text(ctx, argc, argv, 0, &request.length);
    request.first_float = argument_float(ctx, argc, argv, 1);
    request.second_float = argument_float(ctx, argc, argv, 2);
    break;
  case OP_FS_WRITE:
    request.text = argument_text(ctx, argc, argv, 0, &request.length);
    request.second = argument_text(ctx, argc, argv, 1, &request.second_length);
    request.number = argument_int(ctx, argc, argv, 2);
    break;
  case OP_FS_REMOVE:
    request.text = argument_text(ctx, argc, argv, 0, &request.length);
    request.number = argument_int(ctx, argc, argv, 1);
    break;
  case OP_FS_STAT:
  case OP_FS_MKDIR:
    request.text = argument_text(ctx, argc, argv, 0, &request.length);
    break;
  case OP_FS_RENAME:
    request.text = argument_text(ctx, argc, argv, 0, &request.length);
    request.second = argument_text(ctx, argc, argv, 1, &request.second_length);
    break;
  default:
    break;
  }
  const bool ran = d1001_fs_run(perform, &request);
  free_text(ctx, request.text);
  free_text(ctx, request.second);
  if (!ran)
    return JS_ThrowInternalError(ctx, "fs system task is unavailable");
  switch (request.kind) {
  case RESULT_TEXT:
    return JS_NewString(ctx, request.out_text);
  case RESULT_INT:
    return JS_NewInt32(ctx, request.out_int);
  default:
    return JS_UNDEFINED;
  }
}

static void add(JSContext *ctx, JSValue object, const char *name, int arity,
                int magic) {
  JS_SetPropertyStr(ctx, object, name,
                    JS_NewCFunctionMagic(ctx, operation, name, arity,
                                         JS_CFUNC_generic_magic, magic));
}

static void read_bound(void *argument) { *(bool *)argument = fs_bound(); }

esp_err_t d1001_fs_install(JSContext *realm) {
  if (realm == NULL)
    return ESP_ERR_INVALID_ARG;
  bool bound = false;
  if (!d1001_fs_run(read_bound, &bound))
    return ESP_ERR_INVALID_STATE;
  if (!bound)
    return ESP_OK;

  JSValue global = JS_GetGlobalObject(realm);
  JSValue fs = JS_NewObject(realm);
  add(realm, fs, "read", 3, OP_FS_READ);
  add(realm, fs, "write", 3, OP_FS_WRITE);
  add(realm, fs, "remove", 2, OP_FS_REMOVE);
  add(realm, fs, "list", 2, OP_FS_LIST);
  add(realm, fs, "stat", 1, OP_FS_STAT);
  add(realm, fs, "mkdir", 1, OP_FS_MKDIR);
  add(realm, fs, "rename", 2, OP_FS_RENAME);
  add(realm, fs, "usage", 0, OP_FS_USAGE);
  add(realm, fs, "lastError", 0, OP_FS_LAST_ERROR);
  JS_SetPropertyStr(realm, global, "fs", fs);
  const bool failed = JS_HasException(realm);
  JS_FreeValue(realm, global);
  return failed ? ESP_ERR_NO_MEM : ESP_OK;
}
