#include <assert.h>
#include <inttypes.h>
#include <stdint.h>
#include <string.h>

#include "d1001_board.h"
#include "esp_async_memcpy.h"
#include "esp_cache.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "pocket/display_esp_dpi.h"
#include "pocket/guest_idf.h"
#include "pocket/package_source.h"
#include "pocket/runner.h"
#include "packages.h"
#include "pocket_profile.h"
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
  pocket_render_esp_ppa *renderer;
  pocketjs_esp32p4_ppa_t *ppa;
  pocket_display_esp_dpi *display;
  pocket_runner_t *runner;
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

  ESP_ERROR_CHECK(pocketjs_esp32p4_ppa_create(&host->ppa));
  const pocket_ppa_config ppa_config = {
      .struct_size = sizeof(ppa_config),
      .scale = pocket_profile.facts->display->raster_density,
      .min_fill_pixels = 1024,
      .min_blend_pixels = 256,
      .min_srm_pixels = 256,
      .mask_budget = D1001_STRIP_BYTES / 2U,
  };
  host->renderer = pocket_render_esp_ppa_create(
      &ppa_config, pocketjs_esp32p4_ppa_status_ops(host->ppa));
  assert(host->renderer != NULL);
  const pocket_renderer_id renderer = pocket_runtime_add_renderer(
      host->runtime, pocket_render_esp_ppa_vtable(), host->renderer);
  assert(renderer != POCKET_RENDERER_INVALID);
  require_status(pocket_runtime_add_display(
      host->runtime, pocket_display_esp_dpi_vtable(), host->display, renderer));

  const int32_t boot = pocket_runtime_boot(host->runtime);
  if (boot != POCKET_STATUS_OK)
    ESP_LOGE(TAG, "boot status=%" PRId32 ": %s", boot,
             pocket_guest_idf_error(host->guest));
  require_status(boot);

  pocket_runner_config_t runner_config;
  pocket_runner_config_defaults(&runner_config);
  runner_config.task_stack_bytes = D1001_GUEST_STACK;
  runner_config.task_stack_caps = MALLOC_CAP_SPIRAM;
  runner_config.task_core = 0;
  ESP_ERROR_CHECK(
      pocket_runner_start(host->runtime, &runner_config, &host->runner));
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

static void run_app(void *context) {
  static d1001_host host;
  host.package = *(d1001_package *)context;
  start_display(&host);
  start_guest(&host);
  ESP_LOGI(TAG, "hello app started");

  bool sample_pending = true;
  pocket_runner_stats_t last = {.struct_size = sizeof(last)};
  int64_t logged = esp_timer_get_time();
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(5000));
    pocket_runner_stats_t stats = {.struct_size = sizeof(stats)};
    ESP_ERROR_CHECK(pocket_runner_stats(host.runner, &stats));
    const int64_t now = esp_timer_get_time();
    const uint32_t frames = stats.frames - last.frames;
    const size_t dma_free =
        heap_caps_get_largest_free_block(MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    ESP_LOGI(TAG, "internal_dma_largest_free=%u bytes", (unsigned)dma_free);
    ESP_LOGI(TAG,
             "frames=%" PRIu32 " fps=%.1f skipped=%" PRIu32
             " errors=%" PRIu32 " max_frame_ms=%.2f",
             stats.frames, frames * 1e6 / (double)(now - logged),
             stats.frames_skipped - last.frames_skipped,
             stats.frame_errors - last.frame_errors,
             stats.max_frame_us / 1000.0);
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
  const BaseType_t created = xTaskCreatePinnedToCoreWithCaps(
      run_app, "pocketjs_d1001", D1001_GUEST_STACK, &package, 1, NULL, 0,
      MALLOC_CAP_SPIRAM);
  assert(created == pdPASS);
}
