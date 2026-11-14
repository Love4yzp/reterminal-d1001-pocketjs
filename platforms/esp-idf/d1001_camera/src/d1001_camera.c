#include "d1001_camera.h"

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/time.h>

#include "esp_cam_sensor.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_private/esp_cache_private.h"
#include "esp_timer.h"
#include "esp_video.h"
#include "esp_video_device.h"
#include "esp_video_init.h"
#include "esp_video_ioctl.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "linux/videodev2.h"

#define D1001_CAMERA_MAGIC 0x43364d31U
#define D1001_CAMERA_WORK_BUFFERS 2U
#define D1001_CAMERA_POLL_INTERVAL_MS 10U
#define D1001_CAMERA_SCCB_FREQUENCY_HZ 100000U
/* Internal device name in the pinned esp_video 2.6.0, not its VFS path. */
#define D1001_CAMERA_VIDEO_NAME "MIPI-CSI"

static const char *TAG = "d1001_camera";
static d1001_camera_handle_t s_camera;

struct d1001_camera {
  uint32_t magic;
  d1001_camera_config_t config;
  int fd;
  struct esp_video *video;
  bool close_pending;
  bool video_initialized;
  bool controls_started;
  bool ready;
  bool capturing;
  bool cleanup_pending;
  bool buffers_requested;
  bool streaming;
  uint8_t *working[D1001_CAMERA_WORK_BUFFERS];
  size_t working_size[D1001_CAMERA_WORK_BUFFERS];
  uint16_t sensor_id;
  uint32_t captured_frames;
  uint32_t failed_captures;
  uint32_t timeouts;
  uint32_t rejected_frames;
  d1001_camera_format_t last_format;
  size_t last_sensor_frame_bytes;
  size_t psram_allocated_bytes;
  size_t psram_peak_bytes;
  d1001_camera_frame_t frame;
};

static bool camera_valid(d1001_camera_handle_t camera) {
  return camera != NULL && camera == s_camera &&
         camera->magic == D1001_CAMERA_MAGIC;
}

static esp_err_t errno_to_esp_err(int error) {
  switch (error) {
  case EAGAIN:
  case ETIMEDOUT:
    return ESP_ERR_TIMEOUT;
  case ENOMEM:
    return ESP_ERR_NO_MEM;
  case EBUSY:
    return ESP_ERR_INVALID_STATE;
  case EINVAL:
  case ENOTTY:
    return ESP_ERR_INVALID_ARG;
  default:
    return ESP_FAIL;
  }
}

static esp_err_t video_ioctl(int fd, int request, void *arg,
                             const char *operation) {
  if (ioctl(fd, request, arg) == 0)
    return ESP_OK;
  const int error = errno;
  ESP_LOGE(TAG, "%s failed: errno=%d (%s)", operation, error,
           strerror(error));
  return errno_to_esp_err(error);
}

static esp_err_t dequeue_video_frame(int fd, struct v4l2_buffer *buffer) {
  if (ioctl(fd, VIDIOC_DQBUF, buffer) == 0)
    return ESP_OK;
  const int error = errno;
  if (error == EAGAIN)
    return ESP_ERR_TIMEOUT;
  ESP_LOGE(TAG, "dequeue video frame failed: errno=%d (%s)", error,
           strerror(error));
  return errno_to_esp_err(error);
}

static esp_err_t set_control(d1001_camera_handle_t camera,
                             d1001_camera_control_fn_t control, bool high,
                             const char *name) {
  ESP_RETURN_ON_ERROR(control(camera->config.control_context, high), TAG,
                      "%s=%u", name, (unsigned)high);
  return ESP_OK;
}

static esp_err_t camera_power_on(d1001_camera_handle_t camera) {
  camera->controls_started = true;
  ESP_RETURN_ON_ERROR(
      set_control(camera, camera->config.set_power, true, "camera power"), TAG,
      "enable camera power");
  vTaskDelay(pdMS_TO_TICKS(50));
  ESP_RETURN_ON_ERROR(
      set_control(camera, camera->config.set_pwdn, true, "camera PWDN"), TAG,
      "set camera PWDN");
  ESP_RETURN_ON_ERROR(
      set_control(camera, camera->config.set_reset, true, "camera RESET"), TAG,
      "set camera RESET");
  vTaskDelay(pdMS_TO_TICKS(10));
  ESP_RETURN_ON_ERROR(
      set_control(camera, camera->config.set_reset, false, "camera RESET"), TAG,
      "assert camera RESET");
  vTaskDelay(pdMS_TO_TICKS(10));
  ESP_RETURN_ON_ERROR(
      set_control(camera, camera->config.set_reset, true, "camera RESET"), TAG,
      "release camera RESET");
  vTaskDelay(pdMS_TO_TICKS(50));
  return ESP_OK;
}

static esp_err_t camera_power_off(d1001_camera_handle_t camera) {
  esp_err_t first_error = ESP_OK;
  esp_err_t err = set_control(camera, camera->config.set_reset, false,
                              "camera RESET");
  if (err != ESP_OK)
    first_error = err;
  err = set_control(camera, camera->config.set_pwdn, false, "camera PWDN");
  if (first_error == ESP_OK)
    first_error = err;
  err = set_control(camera, camera->config.set_power, false, "camera power");
  if (first_error == ESP_OK)
    first_error = err;
  if (first_error == ESP_OK)
    camera->controls_started = false;
  return first_error;
}

static esp_err_t read_sensor_id(d1001_camera_handle_t camera,
                                uint16_t *sensor_id) {
  esp_cam_sensor_id_t chip_id = {0};
  struct v4l2_ext_control control = {
      .id = ESP_CAM_SENSOR_IOC_G_CHIP_ID,
      .p_u8 = (uint8_t *)&chip_id,
      .size = sizeof(chip_id),
  };
  struct v4l2_ext_controls controls = {
      .ctrl_class = V4L2_CTRL_CLASS_ESP_CAM_IOCTL,
      .count = 1,
      .controls = &control,
  };
  ESP_RETURN_ON_ERROR(video_ioctl(camera->fd, VIDIOC_G_EXT_CTRLS, &controls,
                                  "read sensor ID"),
                      TAG, "SC2356 ID ioctl");
  *sensor_id = chip_id.pid;
  return ESP_OK;
}

static void *camera_frame_alloc(d1001_camera_handle_t camera, size_t size) {
  size_t alignment = 0;
  const uint32_t caps =
      MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT | MALLOC_CAP_CACHE_ALIGNED;
  esp_err_t err = esp_cache_get_alignment(caps, &alignment);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "read PSRAM cache alignment failed: %s", esp_err_to_name(err));
    return NULL;
  }
  void *buffer = heap_caps_aligned_alloc(alignment, size, caps);
  if (buffer == NULL) {
    ESP_LOGE(TAG, "PSRAM frame allocation failed: %u bytes", (unsigned)size);
    return NULL;
  }
  camera->psram_allocated_bytes += size;
  if (camera->psram_allocated_bytes > camera->psram_peak_bytes)
    camera->psram_peak_bytes = camera->psram_allocated_bytes;
  return buffer;
}

static void camera_frame_free(d1001_camera_handle_t camera, void *buffer,
                              size_t size) {
  if (buffer == NULL)
    return;
  heap_caps_free(buffer);
  camera->psram_allocated_bytes -= size;
}

static uint32_t capture_v4l2_format(d1001_camera_format_t format) {
  return format == D1001_CAMERA_FORMAT_RGB565 ? V4L2_PIX_FMT_RGB565
                                              : V4L2_PIX_FMT_UYVY;
}

static esp_err_t request_no_buffers(d1001_camera_handle_t camera) {
  struct v4l2_requestbuffers request = {
      .count = 0,
      .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
      .memory = V4L2_MEMORY_USERPTR,
  };
  return video_ioctl(camera->fd, VIDIOC_REQBUFS, &request, "free video buffers");
}

/* Keep USERPTR storage alive until both the DMA stream and its descriptors
 * have relinquished it. Failure leaves the exact state available to deinit. */
static esp_err_t camera_return_working_buffers(d1001_camera_handle_t camera) {
  if (camera->streaming) {
    int type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    ESP_RETURN_ON_ERROR(
        video_ioctl(camera->fd, VIDIOC_STREAMOFF, &type, "stop video stream"),
        TAG, "working buffers still owned by stream");
    camera->streaming = false;
  }
  if (camera->buffers_requested) {
    ESP_RETURN_ON_ERROR(request_no_buffers(camera), TAG,
                        "working buffers still owned by video driver");
    camera->buffers_requested = false;
  }
  return ESP_OK;
}

static void camera_free_working_buffers(d1001_camera_handle_t camera) {
  /* This guard also protects future callers from freeing retained USERPTRs. */
  if (camera->streaming || camera->buffers_requested)
    return;
  for (unsigned i = 0; i < D1001_CAMERA_WORK_BUFFERS; ++i) {
    camera_frame_free(camera, camera->working[i], camera->working_size[i]);
    camera->working[i] = NULL;
    camera->working_size[i] = 0;
  }
}

static esp_err_t camera_close_video(d1001_camera_handle_t camera) {
  if (camera->fd < 0)
    return ESP_OK;
  if (camera->close_pending) {
    /* IDF 6.2 unregisters the VFS fd even when close fails. esp_video keeps
     * its reference on failure, so retry that reference, never the stale fd. */
    ESP_RETURN_ON_ERROR(esp_video_close(camera->video), TAG,
                        "retry pending video close");
    camera->close_pending = false;
  } else if (close(camera->fd) != 0) {
    const int error = errno;
    camera->close_pending = true;
    ESP_LOGE(TAG, "close video failed: errno=%d (%s)", error, strerror(error));
    return errno_to_esp_err(error);
  }
  camera->fd = -1;
  return ESP_OK;
}

static void crop_center(const uint8_t *source, uint8_t *destination) {
  const size_t source_stride = D1001_CAMERA_SENSOR_WIDTH *
                               D1001_CAMERA_BYTES_PER_PIXEL;
  const size_t destination_stride = D1001_CAMERA_CAPTURE_WIDTH *
                                    D1001_CAMERA_BYTES_PER_PIXEL;
  const size_t x_offset = (D1001_CAMERA_SENSOR_WIDTH -
                           D1001_CAMERA_CAPTURE_WIDTH) /
                          2U;
  const size_t y_offset = (D1001_CAMERA_SENSOR_HEIGHT -
                           D1001_CAMERA_CAPTURE_HEIGHT) /
                          2U;
  for (size_t y = 0; y < D1001_CAMERA_CAPTURE_HEIGHT; ++y) {
    const uint8_t *row = source + (y + y_offset) * source_stride +
                         x_offset * D1001_CAMERA_BYTES_PER_PIXEL;
    memcpy(destination + y * destination_stride, row, destination_stride);
  }
}

esp_err_t d1001_camera_init(const d1001_camera_config_t *config,
                            d1001_camera_handle_t *out_camera) {
  if (out_camera != NULL)
    *out_camera = NULL;
  ESP_RETURN_ON_FALSE(config != NULL && out_camera != NULL,
                      ESP_ERR_INVALID_ARG, TAG, "missing init argument");
  ESP_RETURN_ON_FALSE(config->sccb_i2c != NULL && config->set_power != NULL &&
                          config->set_pwdn != NULL && config->set_reset != NULL,
                      ESP_ERR_INVALID_ARG, TAG,
                      "missing SCCB bus or power control callback");
  ESP_RETURN_ON_FALSE(s_camera == NULL, ESP_ERR_INVALID_STATE, TAG,
                      "camera is already initialized");

  d1001_camera_handle_t camera =
      heap_caps_calloc(1, sizeof(*camera), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
  ESP_RETURN_ON_FALSE(camera != NULL, ESP_ERR_NO_MEM, TAG,
                      "allocate camera handle");
  camera->magic = D1001_CAMERA_MAGIC;
  camera->config = *config;
  camera->fd = -1;
  s_camera = camera;

  esp_err_t err = camera_power_on(camera);
  esp_err_t cleanup_err;
  if (err != ESP_OK)
    goto fail;

  const esp_video_init_csi_config_t csi_config = {
      .sccb_config =
          {
              .init_sccb = false,
              .i2c_handle = config->sccb_i2c,
              .freq = D1001_CAMERA_SCCB_FREQUENCY_HZ,
          },
      .reset_pin = -1,
      .pwdn_pin = -1,
  };
  const esp_video_init_config_t video_config = {
      .csi = &csi_config,
  };
  /* An unsuccessful init can also leave resources if its own rollback fails. */
  camera->video_initialized = true;
  err = esp_video_init_with_flags(&video_config, ESP_VIDEO_INIT_FLAGS_MIPI_CSI);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "initialize CSI/ISP failed: %s", esp_err_to_name(err));
    goto fail;
  }

  camera->video = esp_video_device_get_object(D1001_CAMERA_VIDEO_NAME);
  if (camera->video == NULL) {
    err = ESP_ERR_NOT_FOUND;
    goto fail;
  }

  camera->fd = open(ESP_VIDEO_MIPI_CSI_DEVICE_NAME, O_RDONLY | O_NONBLOCK, 0);
  if (camera->fd < 0) {
    err = errno_to_esp_err(errno);
    ESP_LOGE(TAG, "open %s failed: %s", ESP_VIDEO_MIPI_CSI_DEVICE_NAME,
             strerror(errno));
    goto fail;
  }
  err = d1001_camera_probe(camera, &camera->sensor_id);
  if (err != ESP_OK)
    goto fail;

  camera->ready = true;
  *out_camera = camera;
  ESP_LOGI(TAG,
           "SC2356 PID=0x%04x on I2C0/0x%02x, 1-lane 576 Mbps RAW8 "
           "1280x720@30, output 640x480",
           camera->sensor_id, D1001_CAMERA_SCCB_ADDRESS);
  return ESP_OK;

fail:
  cleanup_err = d1001_camera_deinit(camera);
  if (cleanup_err != ESP_OK) {
    ESP_LOGE(TAG, "init failed (%s), rollback pending (%s)",
             esp_err_to_name(err), esp_err_to_name(cleanup_err));
    *out_camera = camera;
    return cleanup_err;
  }
  return err;
}

esp_err_t d1001_camera_probe(d1001_camera_handle_t camera,
                             uint16_t *sensor_id) {
  ESP_RETURN_ON_FALSE(camera_valid(camera) && camera->fd >= 0 &&
                          !camera->close_pending && !camera->cleanup_pending,
                      ESP_ERR_INVALID_STATE, TAG, "camera is not initialized");
  ESP_RETURN_ON_FALSE(sensor_id != NULL, ESP_ERR_INVALID_ARG, TAG,
                      "missing sensor ID output");
  uint16_t id = 0;
  ESP_RETURN_ON_ERROR(read_sensor_id(camera, &id), TAG, "probe SC2356");
  ESP_RETURN_ON_FALSE(id == D1001_CAMERA_SC2356_PID, ESP_ERR_NOT_FOUND, TAG,
                      "unexpected sensor PID=0x%04x", id);
  *sensor_id = id;
  return ESP_OK;
}

esp_err_t d1001_camera_capture(d1001_camera_handle_t camera,
                               d1001_camera_format_t format,
                               uint32_t timeout_ms,
                               d1001_camera_frame_t **out_frame) {
  if (out_frame != NULL)
    *out_frame = NULL;
  ESP_RETURN_ON_FALSE(camera_valid(camera) && camera->ready &&
                          !camera->cleanup_pending,
                      ESP_ERR_INVALID_STATE, TAG, "camera is not ready");
  ESP_RETURN_ON_FALSE(out_frame != NULL, ESP_ERR_INVALID_ARG, TAG,
                      "missing frame output");
  ESP_RETURN_ON_FALSE(format == D1001_CAMERA_FORMAT_RGB565 ||
                          format == D1001_CAMERA_FORMAT_UYVY,
                      ESP_ERR_INVALID_ARG, TAG, "unsupported format=%d", format);
  ESP_RETURN_ON_FALSE(!camera->capturing && camera->frame.data == NULL,
                      ESP_ERR_INVALID_STATE, TAG,
                      "capture active or previous frame not released");

  const size_t sensor_frame_bytes = D1001_CAMERA_SENSOR_WIDTH *
                                    D1001_CAMERA_SENSOR_HEIGHT *
                                    D1001_CAMERA_BYTES_PER_PIXEL;
  const size_t output_frame_bytes = D1001_CAMERA_CAPTURE_WIDTH *
                                    D1001_CAMERA_CAPTURE_HEIGHT *
                                    D1001_CAMERA_BYTES_PER_PIXEL;
  uint8_t *output = NULL;
  bool frame_valid = false;
  size_t received_size = 0;
  unsigned received_index = 0;
  esp_err_t err = ESP_OK;
  esp_err_t cleanup_err;

  camera->capturing = true;
  output = camera_frame_alloc(camera, output_frame_bytes);
  if (output == NULL) {
    err = ESP_ERR_NO_MEM;
    goto cleanup;
  }

  struct v4l2_format video_format = {
      .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
      .fmt.pix =
          {
              .width = D1001_CAMERA_SENSOR_WIDTH,
              .height = D1001_CAMERA_SENSOR_HEIGHT,
              .pixelformat = capture_v4l2_format(format),
          },
  };
  err = video_ioctl(camera->fd, VIDIOC_S_FMT, &video_format, "set video format");
  if (err != ESP_OK)
    goto cleanup;
  if (video_format.fmt.pix.width != D1001_CAMERA_SENSOR_WIDTH ||
      video_format.fmt.pix.height != D1001_CAMERA_SENSOR_HEIGHT ||
      video_format.fmt.pix.pixelformat != capture_v4l2_format(format)) {
    err = ESP_ERR_NOT_SUPPORTED;
    goto cleanup;
  }

  struct v4l2_requestbuffers request = {
      .count = D1001_CAMERA_WORK_BUFFERS,
      .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
      .memory = V4L2_MEMORY_USERPTR,
  };
  err = video_ioctl(camera->fd, VIDIOC_REQBUFS, &request, "request video buffers");
  if (err != ESP_OK)
    goto cleanup;
  camera->buffers_requested = true;
  if (request.count != D1001_CAMERA_WORK_BUFFERS) {
    ESP_LOGE(TAG, "driver changed buffer count to %" PRIu32, request.count);
    err = ESP_ERR_NOT_SUPPORTED;
    goto cleanup;
  }

  for (unsigned i = 0; i < D1001_CAMERA_WORK_BUFFERS; ++i) {
    struct v4l2_buffer buffer = {
        .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
        .memory = V4L2_MEMORY_USERPTR,
        .index = i,
    };
    err = video_ioctl(camera->fd, VIDIOC_QUERYBUF, &buffer, "query video buffer");
    if (err != ESP_OK)
      goto cleanup;
    if (buffer.length < sensor_frame_bytes) {
      err = ESP_ERR_INVALID_SIZE;
      goto cleanup;
    }
    camera->working_size[i] = buffer.length;
    camera->working[i] = camera_frame_alloc(camera, buffer.length);
    if (camera->working[i] == NULL) {
      err = ESP_ERR_NO_MEM;
      goto cleanup;
    }
    buffer.m.userptr = (unsigned long)camera->working[i];
    err = video_ioctl(camera->fd, VIDIOC_QBUF, &buffer, "queue video buffer");
    if (err != ESP_OK)
      goto cleanup;
  }

  int type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  err = video_ioctl(camera->fd, VIDIOC_STREAMON, &type, "start video stream");
  if (err != ESP_OK)
    goto cleanup;
  camera->streaming = true;

  if (timeout_ms == 0)
    timeout_ms = D1001_CAMERA_DEFAULT_TIMEOUT_MS;
  const int64_t deadline = esp_timer_get_time() + timeout_ms * 1000LL;
  while (!frame_valid) {
    const int64_t remaining_us = deadline - esp_timer_get_time();
    if (remaining_us <= 0) {
      err = ESP_ERR_TIMEOUT;
      goto cleanup;
    }
    struct timeval dequeue_timeout = {
        .tv_sec = 0,
        .tv_usec = remaining_us < D1001_CAMERA_POLL_INTERVAL_MS * 1000LL
                       ? remaining_us
                       : D1001_CAMERA_POLL_INTERVAL_MS * 1000LL,
    };
    /* esp_video floors this to scheduler ticks; a sub-tick remainder polls
     * without blocking rather than rounding past the deadline. */
    err = video_ioctl(camera->fd, VIDIOC_S_DQBUF_TIMEOUT, &dequeue_timeout,
                      "set frame timeout");
    if (err != ESP_OK)
      goto cleanup;
    struct v4l2_buffer buffer = {
        .type = V4L2_BUF_TYPE_VIDEO_CAPTURE,
        .memory = V4L2_MEMORY_USERPTR,
    };
    err = dequeue_video_frame(camera->fd, &buffer);
    /* Check every dequeue, including valid frames and consecutive rejects. */
    if (esp_timer_get_time() >= deadline) {
      err = ESP_ERR_TIMEOUT;
      goto cleanup;
    }
    if (err == ESP_ERR_TIMEOUT) {
      taskYIELD();
      err = ESP_OK;
      continue;
    }
    if (err != ESP_OK)
      goto cleanup;
    if (buffer.index >= D1001_CAMERA_WORK_BUFFERS ||
        camera->working[buffer.index] == NULL) {
      err = ESP_FAIL;
      goto cleanup;
    }

    if ((buffer.flags & V4L2_BUF_FLAG_DONE) != 0 &&
        !(buffer.flags & V4L2_BUF_FLAG_ERROR) &&
        buffer.bytesused >= sensor_frame_bytes) {
      frame_valid = true;
      received_index = buffer.index;
      received_size = buffer.bytesused;
      break;
    }

    ++camera->rejected_frames;
    buffer.m.userptr = (unsigned long)camera->working[buffer.index];
    buffer.length = camera->working_size[buffer.index];
    err = video_ioctl(camera->fd, VIDIOC_QBUF, &buffer, "requeue rejected frame");
    if (err != ESP_OK)
      goto cleanup;
  }

cleanup:
  cleanup_err = camera_return_working_buffers(camera);
  if (cleanup_err != ESP_OK) {
    camera->cleanup_pending = true;
    camera->ready = false;
    if (err == ESP_OK)
      err = cleanup_err;
  }

  if (err == ESP_OK && frame_valid) {
    crop_center(camera->working[received_index], output);
    camera->frame.data = output;
    camera->frame.size = output_frame_bytes;
    camera->frame.width = D1001_CAMERA_CAPTURE_WIDTH;
    camera->frame.height = D1001_CAMERA_CAPTURE_HEIGHT;
    camera->frame.format = format;
    output = NULL;
    ++camera->captured_frames;
    camera->last_format = format;
    camera->last_sensor_frame_bytes = received_size;
    *out_frame = &camera->frame;
  }

  camera_free_working_buffers(camera);
  camera_frame_free(camera, output, output_frame_bytes);
  camera->capturing = false;

  if (err != ESP_OK) {
    ++camera->failed_captures;
    if (err == ESP_ERR_TIMEOUT)
      ++camera->timeouts;
    return err;
  }
  return ESP_OK;
}

esp_err_t d1001_camera_release_frame(d1001_camera_handle_t camera,
                                     d1001_camera_frame_t *frame) {
  ESP_RETURN_ON_FALSE(camera_valid(camera), ESP_ERR_INVALID_STATE, TAG,
                      "camera is not initialized");
  ESP_RETURN_ON_FALSE(frame != NULL && frame == &camera->frame &&
                          camera->frame.data != NULL,
                      ESP_ERR_INVALID_ARG, TAG, "unknown or released frame");
  ESP_RETURN_ON_FALSE(!camera->capturing, ESP_ERR_INVALID_STATE, TAG,
                      "capture is active");
  camera_frame_free(camera, camera->frame.data, camera->frame.size);
  memset(&camera->frame, 0, sizeof(camera->frame));
  return ESP_OK;
}

esp_err_t d1001_camera_get_status(d1001_camera_handle_t camera,
                                  d1001_camera_status_t *status) {
  ESP_RETURN_ON_FALSE(camera_valid(camera), ESP_ERR_INVALID_STATE, TAG,
                      "camera is not initialized");
  ESP_RETURN_ON_FALSE(status != NULL, ESP_ERR_INVALID_ARG, TAG,
                      "missing status output");
  memset(status, 0, sizeof(*status));
  status->sensor_id = camera->sensor_id;
  status->ready = camera->ready;
  status->capturing = camera->capturing;
  status->frame_outstanding = camera->frame.data != NULL;
  status->cleanup_pending = camera->cleanup_pending;
  status->captured_frames = camera->captured_frames;
  status->failed_captures = camera->failed_captures;
  status->timeouts = camera->timeouts;
  status->rejected_frames = camera->rejected_frames;
  status->last_format = camera->last_format;
  status->last_sensor_frame_bytes = camera->last_sensor_frame_bytes;
  status->psram_allocated_bytes = camera->psram_allocated_bytes;
  status->psram_peak_bytes = camera->psram_peak_bytes;

  const uint32_t psram_caps = MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT;
  const uint32_t dma_caps = MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL;
  status->psram_free_bytes = heap_caps_get_free_size(psram_caps);
  status->psram_largest_free_bytes = heap_caps_get_largest_free_block(psram_caps);
  status->psram_minimum_free_bytes = heap_caps_get_minimum_free_size(psram_caps);
  status->internal_dma_free_bytes = heap_caps_get_free_size(dma_caps);
  status->internal_dma_largest_free_bytes =
      heap_caps_get_largest_free_block(dma_caps);
  status->internal_dma_minimum_free_bytes =
      heap_caps_get_minimum_free_size(dma_caps);
  return ESP_OK;
}

esp_err_t d1001_camera_deinit(d1001_camera_handle_t camera) {
  ESP_RETURN_ON_FALSE(camera_valid(camera), ESP_ERR_INVALID_ARG, TAG,
                      "invalid camera handle");
  ESP_RETURN_ON_FALSE(!camera->capturing && camera->frame.data == NULL,
                      ESP_ERR_INVALID_STATE, TAG,
                      "capture active or frame not released");

  camera->ready = false;
  camera->cleanup_pending = true;
  ESP_RETURN_ON_ERROR(camera_return_working_buffers(camera), TAG,
                      "capture cleanup pending");
  camera_free_working_buffers(camera);
  ESP_RETURN_ON_ERROR(camera_close_video(camera), TAG, "video close pending");
  if (camera->video_initialized) {
    ESP_RETURN_ON_ERROR(
        esp_video_deinit_with_flags(ESP_VIDEO_INIT_FLAGS_MIPI_CSI), TAG,
        "CSI deinit pending");
    camera->video_initialized = false;
    camera->video = NULL;
  }
  if (camera->controls_started) {
    ESP_RETURN_ON_ERROR(camera_power_off(camera), TAG, "power off pending");
  }

  camera->magic = 0;
  s_camera = NULL;
  free(camera);
  return ESP_OK;
}
