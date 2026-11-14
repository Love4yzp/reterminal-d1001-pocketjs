#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define D1001_CAMERA_SCCB_ADDRESS 0x36U
#define D1001_CAMERA_SC2356_PID 0xeb52U
#define D1001_CAMERA_SENSOR_WIDTH 1280U
#define D1001_CAMERA_SENSOR_HEIGHT 720U
#define D1001_CAMERA_CAPTURE_WIDTH 640U
#define D1001_CAMERA_CAPTURE_HEIGHT 480U
#define D1001_CAMERA_BYTES_PER_PIXEL 2U
#define D1001_CAMERA_DEFAULT_TIMEOUT_MS 1000U

#define D1001_CAMERA_PCA9535_POWER (1U << 1)
#define D1001_CAMERA_PCA9535_PWDN (1U << 3)
#define D1001_CAMERA_PCA9535_RESET (1U << 9)

typedef struct d1001_camera *d1001_camera_handle_t;

typedef enum {
  D1001_CAMERA_FORMAT_RGB565 = 0,
  D1001_CAMERA_FORMAT_UYVY,
} d1001_camera_format_t;

typedef esp_err_t (*d1001_camera_control_fn_t)(void *context, bool high);

typedef struct {
  i2c_master_bus_handle_t sccb_i2c;
  void *control_context;
  d1001_camera_control_fn_t set_power;
  d1001_camera_control_fn_t set_pwdn;
  d1001_camera_control_fn_t set_reset;
} d1001_camera_config_t;

typedef struct {
  uint8_t *data;
  size_t size;
  uint16_t width;
  uint16_t height;
  d1001_camera_format_t format;
} d1001_camera_frame_t;

typedef struct {
  uint16_t sensor_id;
  bool ready;
  bool capturing;
  bool frame_outstanding;
  uint32_t captured_frames;
  uint32_t failed_captures;
  uint32_t timeouts;
  uint32_t rejected_frames;
  d1001_camera_format_t last_format;
  size_t last_sensor_frame_bytes;
  size_t psram_allocated_bytes;
  size_t psram_peak_bytes;
  size_t psram_free_bytes;
  size_t psram_largest_free_bytes;
  size_t psram_minimum_free_bytes;
  size_t internal_dma_free_bytes;
  size_t internal_dma_largest_free_bytes;
  size_t internal_dma_minimum_free_bytes;
} d1001_camera_status_t;

/** Initialize SC2356, CSI and ISP using an existing I2C0 bus. */
esp_err_t d1001_camera_init(const d1001_camera_config_t *config,
                            d1001_camera_handle_t *out_camera);

/** Read the sensor ID without starting a video stream. */
esp_err_t d1001_camera_probe(d1001_camera_handle_t camera, uint16_t *sensor_id);

/**
 * Capture one centered 640x480 frame into PSRAM. RGB565 and UYVY are packed
 * with two bytes per pixel. A zero timeout selects the default timeout.
 */
esp_err_t d1001_camera_capture(d1001_camera_handle_t camera,
                               d1001_camera_format_t format,
                               uint32_t timeout_ms,
                               d1001_camera_frame_t **out_frame);

/** Release a frame returned by d1001_camera_capture. */
esp_err_t d1001_camera_release_frame(d1001_camera_handle_t camera,
                                     d1001_camera_frame_t *frame);

/** Heap values are global snapshots; PSRAM allocation/peak are component-owned. */
esp_err_t d1001_camera_get_status(d1001_camera_handle_t camera,
                                  d1001_camera_status_t *status);

/** The caller must release frames first and serialize init/capture/deinit. */
esp_err_t d1001_camera_deinit(d1001_camera_handle_t camera);

#ifdef __cplusplus
}
#endif
