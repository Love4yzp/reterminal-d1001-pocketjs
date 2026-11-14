# reTerminal D1001 SC2356 camera

Owns the SC2356 sensor, MIPI-CSI0 and its ISP capture channel. The caller supplies the existing I2C0 bus and the board's PCA9535 control callbacks. The component creates no tasks, owns no QR decoder, JS bindings or file storage, and never deletes the shared I2C bus.

## Hardware contract

The values below come from the [D1001 reference BSP](https://github.com/Love4yzp/reTerminal-D1001/blob/main/components/esp32_p4_re_terminal_d1001/include/esp32_p4_re_terminal_d1001.h), its [board initialization](https://github.com/Love4yzp/reTerminal-D1001/blob/main/components/esp32_p4_re_terminal_d1001/src/esp32_p4_re_terminal_d1001.c), and the [vendored SC2356 driver](https://github.com/Love4yzp/reTerminal-D1001/tree/main/components/esp_cam_sensor/sensors/sc2356).

| Signal/path | D1001 assignment | Driver contract |
| --- | --- | --- |
| SCCB SDA / SCL | GPIO37 / GPIO38, I2C0, shared with touch | Existing `touch_i2c`, 100 kHz |
| SCCB address | `0x36` (7-bit) | 16-bit register address, 8-bit value |
| Sensor PID | `0xeb52` | Checked during init and by `d1001_camera_probe` |
| Camera enable | PCA9535 P01, mask `1 << 1` | High enables power |
| Power-down control | PCA9535 P03, mask `1 << 3` | Reference firmware drives it high for operation |
| Reset | PCA9535 P09, mask `1 << 9` | High, low for 10 ms, then high |
| XCLK | No P4 GPIO is configured by the reference MIPI-CSI path | Sensor mode requires 24 MHz input; this component does not generate it |
| MIPI-CSI | CSI0, 1 data lane | 576 Mbps/lane, RAW8, 1280x720 at 30 fps, BGGR |
| MIPI PHY supply | Internal LDO_VO3, 2.5 V | Shared with DSI through the IDF LDO reference count |

The power sequence is EN high, wait 50 ms; PWDN high and RESET high, wait 10 ms; RESET low, wait 10 ms; RESET high, wait 50 ms. Deinit drives RESET low, PWDN low and EN low. These are physical-level callbacks, not active/inactive semantic callbacks.

The reference repository does not contain a schematic, so the physical source of the 24 MHz sensor clock and the PWDN electrical semantics still require schematic or device verification. Do not add an XCLK GPIO without that evidence. The old reference `sc2356.c` labels this RAW8 mode as 720 Mbps, but its own register-table heading says 576 Mbps; the current SC202CS table and metadata consistently use 576 Mbps.

## Components

| Component | Source/version | Use |
| --- | --- | --- |
| `esp_driver_cam` | Built into ESP-IDF 6.2 | CSI controller and DW-GDMA transfer |
| `esp_driver_isp` | Built into ESP-IDF 6.2 | RAW8 to RGB565/UYVY conversion |
| `espressif/esp_video` | `2.6.0`, pinned in `idf_component.yml` | Sensor detection, CSI/ISP lifetime and V4L2 buffer API |
| `esp_cam_sensor` | `2.7.0` through `esp_video` | SC202CS/SC2356 register tables and ID/format operations |
| `esp_ipa` | `2.5.0` through `esp_video` | Sensor configuration data; the automatic pipeline task is disabled |
| `esp_driver_cam` test path | ESP-IDF `test_apps/csi` | Confirms PSRAM DMA buffer support on ESP32-P4 |

`esp_video` 2.6 uses the IDF 6.x YUV422 formats and provides `esp_video_deinit_with_flags`. The D1001 factory firmware instead references `esp_video` 1.2; that older version is hardware evidence, not the dependency selected for this IDF 6.2 component. In `esp_cam_sensor` 2.7 the driver and Kconfig symbols are named SC202CS; it retains the SC2356-compatible address `0x36`, PID `0xeb52` and RAW8 register table.

## API and ownership

```c
d1001_camera_config_t config = {
    .sccb_i2c = board.touch_i2c,
    .control_context = NULL,
    .set_power = camera_power,  /* Supplied by the integration layer. */
    .set_pwdn = camera_pwdn,
    .set_reset = camera_reset,
};
d1001_camera_handle_t camera;
ESP_ERROR_CHECK(d1001_camera_init(&config, &camera));

d1001_camera_frame_t *frame;
ESP_ERROR_CHECK(d1001_camera_capture(camera, D1001_CAMERA_FORMAT_RGB565,
                                     1000, &frame));
/* Consume frame->data, frame->size == 640 * 480 * 2. */
ESP_ERROR_CHECK(d1001_camera_release_frame(camera, frame));
ESP_ERROR_CHECK(d1001_camera_deinit(camera));
```

- Output is a centered crop of the native 1280x720 frame, not a scaled image. RGB565 and packed UYVY both use two bytes per pixel. Crop offsets are even to preserve UYVY pairs.
- Capture uses two driver-owned transactions over component-allocated PSRAM working buffers. A valid frame is copied to a separate PSRAM output buffer before the working buffers are freed. Each dequeue wait is limited to the remaining deadline, up to 10 ms; sub-tick waits poll without blocking. The deadline is checked before each wait and after every dequeue, including valid and rejected frames. It bounds waiting for a frame after stream start; setup, teardown and scheduler latency are outside this budget.
- One camera instance and one unreleased output frame are supported. Serialize init, probe, capture, status, release and deinit from the owning task. Capture polls in the caller's context and has a timeout; it does not create a task.
- Release the output before another capture or deinit. Working buffers are freed only after any started stream has stopped successfully and `VIDIOC_REQBUFS(count=0)` has released its descriptors. If either operation fails, capture retains the PSRAM buffers, reports `cleanup_pending=true` and `ready=false`, and rejects further captures. Call deinit to retry cleanup; the retained buffers remain included in `psram_allocated_bytes` until safely freed.
- Deinit retries stream/buffer cleanup, closes `/dev/video0`, tears down only the CSI video resources, then applies the safe control levels. Each completed stage is recorded; failure preserves the handle and singleton for another deinit attempt. The handle becomes invalid only on success. Once teardown starts, only status and deinit are supported.
- Check both the init result and its output handle. Init normally returns a NULL handle on failure. If rollback also fails, it logs both errors, returns the cleanup error and supplies a non-NULL cleanup-only handle; retry deinit on that handle before initializing again.
- IDF 6.2 unregisters the VFS descriptor even if close fails, while `esp_video` retains the underlying reference. Close retries therefore use the pinned 2.6.0 private `esp_video_close` API and saved video object, never the stale descriptor. The private include directory is local to this component; recheck this contract before upgrading either dependency.
- `d1001_camera_get_status` reports capture/error counters and component-owned PSRAM allocation/peak. Its free/largest/minimum fields are global heap snapshots, not an attribution of other drivers' allocations.

## Memory budget

All image buffers use cache-line-aligned PSRAM. No frame payload consumes internal DMA RAM.

| Allocation | Calculation | Bytes |
| --- | --- | ---: |
| One native RGB565/UYVY working frame | 1280 x 720 x 2 | 1,843,200 |
| Two working frames | 2 x 1,843,200 | 3,686,400 |
| Returned 640x480 frame | 640 x 480 x 2 | 614,400 |
| Capture peak | 3,686,400 + 614,400 | 4,300,800 (about 4.10 MiB) |
| After working-buffer cleanup, before release | one output frame | 614,400 |
| After frame release | no component-owned frame payload | 0 |
| CSI backup frame | Disabled; two working buffers are mandatory | 0 |
| Internal-DMA frame payload | PSRAM only | 0 |

The handle, V4L2 objects, queues, semaphores, ISR and ISP/CSI driver contexts still consume internal RAM. Measure that consumption on device; the table is not a claim that total internal RAM usage is zero. The existing display's two internal-DMA staging buffers remain independent and within their 128 KiB budget.

The zero-allocation rows assume successful cleanup. A failed stream stop or buffer release retains up to 3,686,400 bytes of working-frame payload until a successful deinit retry. The output buffer is freed on failed capture.

## Integration requirements

The firmware component path includes `d1001_camera`, and `main` declares its build dependency. A native runtime camera consumer remains a follow-up; keep camera ownership outside guest/runtime restart paths.

`d1001_board_camera_set_power`, `d1001_board_camera_set_pwdn` and `d1001_board_camera_set_reset` forward the camera masks to the existing PCA9535 implementation. The consumer must supply context-compatible wrappers for these functions and pass `board.touch_i2c`, not `board.system_i2c`. Do not create a second PCA9535 device or output cache.

`programs/reterminal-d1001/sdkconfig.defaults` contains the following camera and memory configuration:

```ini
CONFIG_IDF_EXPERIMENTAL_FEATURES=y
CONFIG_SPIRAM=y
CONFIG_SPIRAM_SPEED_200M=y
CONFIG_SPIRAM_USE_MALLOC=y
CONFIG_CACHE_L2_CACHE_LINE_128B=y
CONFIG_CAMERA_SC202CS=y
CONFIG_CAMERA_SC202CS_AUTO_DETECT_MIPI_INTERFACE_SENSOR=y
CONFIG_CAMERA_SC202CS_MIPI_RAW8_1280X720_30FPS=y
CONFIG_CAMERA_SC202CS_MIPI_DEFAULT_FMT_RAW8_1280X720_30FPS=y
CONFIG_CAMERA_SC202CS_DEFAULT_IPA_JSON_CONFIGURATION_FILE=y
CONFIG_ESP_VIDEO_ENABLE_MIPI_CSI_VIDEO_DEVICE=y
CONFIG_ESP_VIDEO_DISABLE_MIPI_CSI_DRIVER_BACKUP_BUFFER=y
CONFIG_ESP_VIDEO_ENABLE_DVP_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_ENABLE_SPI_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_ENABLE_USB_UVC_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_ENABLE_ISP_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_ENABLE_ISP_PIPELINE_CONTROLLER=n
CONFIG_ESP_VIDEO_ENABLE_CAMERA_MOTOR_CONTROLLER=n
CONFIG_ESP_VIDEO_ENABLE_HW_H264_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_ENABLE_HW_JPEG_ENC_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_ENABLE_HW_JPEG_DEC_VIDEO_DEVICE=n
CONFIG_ESP_VIDEO_STREAM_STOP_DRAIN_FRAMES=1
```

Keep the ISP pipeline controller disabled for this single-shot BSP. Enabling it creates the managed `isp_task` and requires an explicit task/teardown budget review. LDO_VO3 is already acquired by `d1001_board` at the same 2.5 V; the CSI stack acquires its own reference and releases only that reference.

## Device acceptance

Build success is not camera validation. After integration, and only when a device flash is requested:

1. Identify the ESP32-P4 chip revision and flash the partition table/factory image without erasing `storage`.
2. Initialize the board, then the camera. Require PID `0xeb52`; confirm the reference power/reset pulses and 24 MHz input with a scope if detection fails.
3. Capture RGB565 and UYVY. Require a PSRAM pointer, 640x480 dimensions and 614,400-byte output. Inspect center-crop placement, packed UYVY order, color and exposure using a native validation consumer.
4. Repeat capture/release for both formats and confirm `psram_allocated_bytes` returns to zero after each release. Verify that timeout and rejected-frame paths also stop the stream and free working buffers.
5. Check status before/during/after capture for internal-DMA free/largest/minimum values and PSRAM peak. Confirm display, audio, touch and Wi-Fi still work.
6. Exercise deinit/reinit and verify that LDO_VO3 remains available to the display. No camera or ISP task may survive deinit.
7. Capture at least 30 seconds of serial logs, including the existing internal-DMA heap and runner statistics:

```sh
python3 tools/d1001-serial-capture.py --port /dev/ttyACM0 --seconds 30 \
  --output .pocket-build/validation/d1001-camera/device/serial.bin
```

Unverified without this run: actual sensor detection, image validity, physical clock/reset timing, CSI errors, runtime heap headroom and repeated teardown.
