#include <assert.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "d1001_board.h"
#include "d1001_fs.h"
#include "d1001_hot_push.h"
#include "d1001_wifi.h"
#include "esp_async_memcpy.h"
#include "esp_cache.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "display_move.h"
#include "inputs.h"
#include "pocket/device.h"
#include "pocket/display_esp_dpi.h"
#include "pocket/guest_idf.h"
#include "pocket/http_esp.h"
#include "pocket/package_source.h"
#include "pocket/runner.h"
#include "pocket/worker_esp.h"
#include "pocket/worker_ui.h"
#include "pocket_quickjs_abi.h"
#include "packages.h"
#include "pocket_profile.h"
#include "worker_package.h"
#include "pocketjs/esp32p4_ppa_lanes.h"
#include "pocketjs/esp32p4_ppa_status.h"
#include "pocketjs_package_app.h"

#define D1001_RASTER_WIDTH 400U
#define D1001_RASTER_HEIGHT 640U
#define D1001_PRESENT_SCALE 2U
#define D1001_STRIP_ROWS 80U
#define D1001_STRIP_BYTES (D1001_RASTER_WIDTH * D1001_STRIP_ROWS * 2U)
#define D1001_GUEST_HEAP (8U * 1024U * 1024U)
#define D1001_GUEST_STACK (192U * 1024U)
#define D1001_GUEST_STACK_LIMIT (144U * 1024U)

static const char *TAG = "pocketjs_d1001";

typedef struct {
  d1001_board_handles board;
  pocket_runtime *runtime;
  pocket_guest_idf *guest;
  pocket_render_esp_ppa *renderers[2];
  pocketjs_esp32p4_ppa_t *ppa[2];
  pocketjs_esp32p4_ppa_lanes_t *lanes;
  pocket_display_esp_dpi *display;
  pocket_runner_t *runner;
  pocket_http_esp *http;
  pocket_worker_node http_node;
  pocket_worker_esp *worker;
  pocket_worker_ui *worker_ui;
  uint32_t worker_generation;
  bool hot_started;
  TaskHandle_t app_task;
  SemaphoreHandle_t hot_done;
  volatile uint32_t hot_operation;
  esp_err_t hot_result;
  d1001_inputs inputs;
  d1001_package package;
} d1001_host;

static void require_status(int32_t status) {
  assert(status == POCKET_STATUS_OK);
}

static void start_display(d1001_host *host) {
  ESP_ERROR_CHECK(d1001_board_init(&host->board));
  const size_t frame_bytes =
      D1001_PANEL_WIDTH * D1001_PANEL_HEIGHT * sizeof(uint16_t);
  memset(host->board.framebuffer, 0, frame_bytes);
  ESP_ERROR_CHECK(esp_cache_msync(host->board.framebuffer, frame_bytes,
                                  ESP_CACHE_MSYNC_FLAG_DIR_C2M));
  ESP_ERROR_CHECK(esp_lcd_panel_disp_on_off(host->board.panel, true));
  ESP_ERROR_CHECK(d1001_board_backlight_set(100));

  async_memcpy_handle_t copy = NULL;
  async_memcpy_config_t copy_config = ASYNC_MEMCPY_DEFAULT_CONFIG();
  copy_config.backlog = 12;
  copy_config.dma_burst_size = 64;
  ESP_ERROR_CHECK(esp_async_memcpy_install_gdma_axi(&copy_config, &copy));

  const pocket_display_esp_dpi_config display_config = {
      .struct_size = sizeof(display_config),
      .framebuffer = host->board.framebuffer,
      .panel_width = D1001_PANEL_WIDTH,
      .panel_height = D1001_PANEL_HEIGHT,
      .role = POCKET_DISPLAY_ROLE_PRIMARY,
      .width = D1001_RASTER_WIDTH,
      .height = D1001_RASTER_HEIGHT,
      .turned = false,
      .scale = D1001_PRESENT_SCALE,
      .origin_x = 0,
      .origin_y = 0,
      .strip_rows = D1001_STRIP_ROWS,
      .row_alignment = 4,
      .frame_buffer_budget = 2U * D1001_STRIP_BYTES,
      .copy = copy,
      .move_copy = copy,
  };
  host->display = pocket_display_esp_dpi_create(&display_config);
  assert(host->display != NULL);
  assert(pocket_display_esp_dpi_buffer_bytes(host->display) ==
         2U * D1001_STRIP_BYTES);
  ESP_LOGI(TAG, "raster 400x640 at 2x, strips 2 x %u bytes",
           (unsigned)D1001_STRIP_BYTES);
}

static bool network_online(void *context) {
  (void)context;
  return d1001_wifi_online();
}

static void start_worker_http(d1001_host *host) {
  if (host->http != NULL)
    return;
  const pocket_http_esp_config config = {
      .struct_size = sizeof(config),
      .online = network_online,
      .memory_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT,
      .task_stack_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT,
      .task_core = 1,
      .task_priority = 2,
  };
  host->http = pocket_http_esp_create(&config);
  assert(host->http != NULL);
  host->http_node = (pocket_worker_node){
      .struct_size = sizeof(host->http_node),
      .kind = POCKET_WORKER_HTTP,
      .name = "http",
      .driver = pocket_http_esp_driver(host->http),
  };
}

static void before_tick(void *context) {
  d1001_host *host = context;
  if (host->worker_ui != NULL)
    assert(pocket_worker_ui_latch(host->worker_ui) == POCKET_WORKER_OK);
}

static void start_guest(d1001_host *host) {
  pocket_runtime_config config = {
      .struct_size = sizeof(config),
      .host_abi = pocket_profile.host_abi,
      .tick_hz = pocket_profile.tick_hz,
      .heap_limit = D1001_GUEST_HEAP,
      .frame_buffer_budget = 2U * D1001_STRIP_BYTES,
      .profile = pocket_profile.facts,
  };
  memcpy(config.profile_hash, pocket_profile.profile_hash, 32);
  host->runtime = pocket_runtime_create(&config);
  assert(host->runtime != NULL);

  const pocket_guest_idf_config guest_config = {
      .heap_limit = D1001_GUEST_HEAP,
      .stack_limit = D1001_GUEST_STACK_LIMIT,
      .prefer_psram = true,
  };
  host->guest = pocket_guest_idf_create(&guest_config);
  assert(host->guest != NULL);
  require_status(pocket_runtime_set_guest(
      host->runtime, pocket_guest_idf_vtable(), host->guest));

  require_status(pocket_runtime_set_package_source(
      host->runtime, pocket_memory_package_vtable(), &host->package.source));
  ESP_ERROR_CHECK(d1001_inputs_init(&host->board, host->runtime, &host->inputs));

  JSContext *realm = pocket_guest_idf_context(host->guest);
  const uint32_t features = host->package.facts.features;
  if ((features & POCKET_IDF_FEATURE_FS) != 0U)
    ESP_ERROR_CHECK(d1001_fs_install(realm));
  if ((features & POCKET_IDF_FEATURE_DEVICE) != 0U)
    ESP_ERROR_CHECK(pocket_device_install(realm));
  ESP_ERROR_CHECK(d1001_wifi_install(realm));

  const char *worker_source = NULL;
  size_t worker_source_size = 0;
  const uint8_t *worker_bytecode = NULL;
  size_t worker_bytecode_size = 0;
  (void)d1001_package_worker(&host->package, &worker_source,
                             &worker_source_size);
  (void)d1001_package_worker_bytecode(&host->package, &worker_bytecode,
                                      &worker_bytecode_size);
  if (worker_source != NULL || worker_bytecode != NULL) {
    const pocket_worker_esp_config worker_config = {
        .struct_size = sizeof(worker_config),
        .generation = ++host->worker_generation,
        .nodes = &host->http_node,
        .node_count = 1,
        .source = worker_source,
        .source_size = worker_source_size,
        .bytecode = worker_bytecode,
        .bytecode_size = worker_bytecode_size,
        .engine_abi = POCKET_QUICKJS_ENGINE_ABI_ESP_IDF_QUICKJS_NG_0_14_0,
        .heap_limit = 1024U * 1024U,
        .stack_limit = 16U * 1024U,
        .task_stack_size = 24U * 1024U,
        .task_core = 1,
        .task_priority = 3,
        .defer_turns = true,
        .heap_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT,
        .task_stack_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT,
    };
    ESP_ERROR_CHECK(pocket_worker_esp_start(&worker_config, &host->worker));
    host->worker_ui = pocket_worker_ui_attach(
        realm, pocket_worker_esp_core(host->worker));
    assert(host->worker_ui != NULL);
  }

  const pocket_ppa_config ppa_config = {
      .struct_size = sizeof(ppa_config),
      .scale = pocket_profile.facts->display->raster_density,
      .min_fill_pixels = 1024,
      .min_blend_pixels = 256,
      .min_srm_pixels = 256,
      .mask_budget = D1001_STRIP_BYTES / 2U,
  };
  for (size_t i = 0; i < 2U; ++i) {
    ESP_ERROR_CHECK(pocketjs_esp32p4_ppa_create(&host->ppa[i]));
    host->renderers[i] = pocket_render_esp_ppa_create(
        &ppa_config, pocketjs_esp32p4_ppa_status_ops(host->ppa[i]));
    assert(host->renderers[i] != NULL);
  }
  ESP_ERROR_CHECK(pocketjs_esp32p4_ppa_lanes_create(
      host->renderers[0], host->renderers[1], 1, 4, &host->lanes));
  const pocket_renderer_id renderer = pocket_runtime_add_renderer(
      host->runtime, pocketjs_esp32p4_ppa_lanes_vtable(), host->lanes);
  assert(renderer != POCKET_RENDERER_INVALID);
  d1001_move_tracker_init();
  require_status(pocket_runtime_add_display(
      host->runtime, d1001_move_tracker_vtable(), host->display, renderer));

  const int32_t boot = pocket_runtime_boot(host->runtime);
  if (boot != POCKET_STATUS_OK)
    ESP_LOGE(TAG, "boot status=%" PRId32 ": %s", boot,
             pocket_guest_idf_error(host->guest));
  require_status(boot);
  if (host->worker != NULL)
    pocket_worker_esp_resume(host->worker);

  pocket_runner_config_t runner_config;
  pocket_runner_config_defaults(&runner_config);
  runner_config.task_stack_bytes = D1001_GUEST_STACK;
  runner_config.task_stack_caps = MALLOC_CAP_SPIRAM;
  runner_config.task_core = 0;
  runner_config.before_tick = before_tick;
  runner_config.user_data = host;
  ESP_ERROR_CHECK(
      pocket_runner_start(host->runtime, &runner_config, &host->runner));
}

static void stop_guest(d1001_host *host) {
  if (host->runner != NULL) {
    while (pocket_runner_stop(host->runner) == ESP_ERR_TIMEOUT)
      vTaskDelay(pdMS_TO_TICKS(10));
    host->runner = NULL;
  }
  if (host->worker_ui != NULL) {
    pocket_worker_ui_detach(host->worker_ui);
    host->worker_ui = NULL;
  }
  if (host->worker != NULL) {
    while (pocket_worker_esp_stop(host->worker, 1000) == ESP_ERR_TIMEOUT)
      vTaskDelay(pdMS_TO_TICKS(10));
    host->worker = NULL;
  }
  if ((host->package.facts.features & POCKET_IDF_FEATURE_FS) != 0U)
    d1001_fs_teardown();
  if (host->runtime != NULL) {
    pocket_runtime_destroy(host->runtime);
    host->runtime = NULL;
  }
  if (host->guest != NULL) {
    pocket_guest_idf_destroy(host->guest);
    host->guest = NULL;
  }
  if (host->lanes != NULL) {
    pocketjs_esp32p4_ppa_lanes_destroy(host->lanes);
    host->lanes = NULL;
  }
  for (size_t i = 0; i < 2U; ++i) {
    if (host->renderers[i] != NULL)
      pocket_render_esp_ppa_destroy(host->renderers[i]);
    if (host->ppa[i] != NULL)
      pocketjs_esp32p4_ppa_destroy(host->ppa[i]);
  }
  memset(host->renderers, 0, sizeof host->renderers);
  memset(host->ppa, 0, sizeof host->ppa);
  if (host->inputs.touch != NULL)
    pocket_input_touch_destroy(host->inputs.touch);
  if (host->inputs.button != NULL)
    pocket_input_gpio_destroy(host->inputs.button);
  memset(&host->inputs, 0, sizeof host->inputs);
  pocket_display_esp_dpi_invalidate(host->display);
}

static void select_package_internal(d1001_host *host);

#if CONFIG_D1001_HOT_PUSH
static esp_err_t run_hot_operation(d1001_host *host, uint32_t operation) {
  if (host->app_task == NULL || host->hot_operation != 0U)
    return ESP_ERR_INVALID_STATE;
  host->hot_done = xSemaphoreCreateBinary();
  if (host->hot_done == NULL)
    return ESP_ERR_NO_MEM;
  host->hot_result = ESP_OK;
  host->hot_operation = operation;
  xTaskNotifyGive(host->app_task);
  xSemaphoreTake(host->hot_done, portMAX_DELAY);
  vSemaphoreDelete(host->hot_done);
  host->hot_done = NULL;
  return host->hot_result;
}

static esp_err_t stop_hot_push(void *context) {
  return run_hot_operation(context, 1U);
}

static esp_err_t restart_hot_push(void *context) {
  return run_hot_operation(context, 2U);
}
#endif

static void start_hot_push(d1001_host *host) {
#if CONFIG_D1001_HOT_PUSH
  if (host->hot_started || !d1001_wifi_online())
    return;
  const d1001_hot_push_config config = {
      .facts = pocket_profile.facts,
      .host_abi = pocket_profile.host_abi,
      .profile_hash = pocket_profile.profile_hash,
      .context = host,
      .stop = stop_hot_push,
      .restart = restart_hot_push,
  };
  const esp_err_t status = d1001_hot_push_start(&config);
  if (status != ESP_OK)
    ESP_LOGW(TAG, "hot push unavailable: %s", esp_err_to_name(status));
  host->hot_started = true;
#else
  (void)host;
#endif
}

static void log_framebuffer_sample(const d1001_host *host) {
  const size_t frame_bytes =
      D1001_PANEL_WIDTH * D1001_PANEL_HEIGHT * sizeof(uint16_t);
  ESP_ERROR_CHECK(esp_cache_msync(host->board.framebuffer, frame_bytes,
                                  ESP_CACHE_MSYNC_FLAG_DIR_M2C));
  const uint16_t *fb = host->board.framebuffer;
  ESP_LOGI(TAG,
           "framebuffer_rgb565 (0,0)=%04x (128,128)=%04x (400,100)=%04x (796,1276)=%04x",
           fb[0], fb[128U * D1001_PANEL_WIDTH + 128U],
           fb[100U * D1001_PANEL_WIDTH + 400U],
           fb[1276U * D1001_PANEL_WIDTH + 796U]);
}

typedef struct {
  d1001_host *host;
  SemaphoreHandle_t done;
} package_selection_work;

static void select_package_task(void *context) {
  package_selection_work *work = context;
  d1001_package_release(&work->host->package);
  d1001_package_select(&work->host->package);
  xSemaphoreGive(work->done);
  vTaskDelete(NULL);
}

static void select_package_internal(d1001_host *host) {
  package_selection_work work = {
      .host = host,
      .done = xSemaphoreCreateBinary(),
  };
  assert(work.done != NULL);
  const BaseType_t created =
      xTaskCreate(select_package_task, "d1001_package", 16384, &work, 4, NULL);
  assert(created == pdPASS);
  xSemaphoreTake(work.done, portMAX_DELAY);
  vSemaphoreDelete(work.done);
}

static void run_app(void *context) {
  static d1001_host host;
  host.app_task = xTaskGetCurrentTaskHandle();
  host.package = *(d1001_package *)context;
  start_display(&host);
  if ((host.package.facts.features & POCKET_IDF_FEATURE_DEVICE) != 0U)
    ESP_ERROR_CHECK(pocket_device_setup());
  d1001_wifi_start();
  start_worker_http(&host);
  start_guest(&host);
  ESP_LOGI(TAG, "app started");

  bool sample_pending = true;
  pocket_runner_stats_t last = {.struct_size = sizeof(last)};
  int64_t logged = esp_timer_get_time();
  for (;;) {
    (void)ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(5000));
    if (host.hot_operation != 0U) {
      const uint32_t operation = host.hot_operation;
      if (operation == 1U) {
        stop_guest(&host);
        ESP_LOGI(TAG, "runtime stopped for hot push");
      } else if (operation == 2U) {
        select_package_internal(&host);
        if ((host.package.facts.features & POCKET_IDF_FEATURE_FS) != 0U)
          ESP_ERROR_CHECK(d1001_fs_init(host.package.facts.slot));
        if ((host.package.facts.features & POCKET_IDF_FEATURE_DEVICE) != 0U)
          ESP_ERROR_CHECK(pocket_device_setup());
        start_guest(&host);
        last = (pocket_runner_stats_t){.struct_size = sizeof(last)};
        logged = esp_timer_get_time();
        sample_pending = true;
        ESP_LOGI(TAG, "runtime restarted without chip reset");
      }
      host.hot_operation = 0U;
      if (host.hot_done != NULL)
        xSemaphoreGive(host.hot_done);
      continue;
    }
    start_hot_push(&host);
    if (host.runner == NULL)
      continue;

    pocket_runner_stats_t stats = {.struct_size = sizeof(stats)};
    ESP_ERROR_CHECK(pocket_runner_stats(host.runner, &stats));
    const int64_t now = esp_timer_get_time();
    const uint32_t frames = stats.frames - last.frames;
    const size_t dma_free =
        heap_caps_get_largest_free_block(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    const d1001_move_stats moves = d1001_move_tracker_read();
    ESP_LOGI(TAG, "internal_dma_largest_free=%u bytes", (unsigned)dma_free);
    ESP_LOGI(TAG,
             "frames=%" PRIu32 " fps=%.1f skipped=%" PRIu32
             " errors=%" PRIu32 " max_frame_ms=%.2f",
             stats.frames, frames * 1e6 / (double)(now - logged),
             stats.frames_skipped - last.frames_skipped,
             stats.frame_errors - last.frame_errors,
             stats.max_frame_us / 1000.0);
    ESP_LOGI(TAG, "moves_ok=%" PRIu32 " moves_unsupported=%" PRIu32
                  " move_errors=%" PRIu32,
             moves.ok, moves.unsupported, moves.errors);
    if (sample_pending) {
      log_framebuffer_sample(&host);
      sample_pending = false;
    }
    last = stats;
    logged = now;
  }
}

void app_main(void) {
  static d1001_package package;
  d1001_package_select(&package);
  if ((package.facts.features & POCKET_IDF_FEATURE_FS) != 0U)
    ESP_ERROR_CHECK(d1001_fs_init(package.facts.slot));
  const BaseType_t created = xTaskCreatePinnedToCoreWithCaps(
      run_app, "pocketjs_d1001", D1001_GUEST_STACK, &package, 1, NULL, 0,
      MALLOC_CAP_SPIRAM);
  assert(created == pdPASS);
}
