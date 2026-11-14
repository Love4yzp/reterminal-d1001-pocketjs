# reTerminal D1001 audio

Owns the ES8311 and ES7210 codecs on the board's existing system I2C bus and the independent ESP32-P4 I2S0 TX/I2S1 RX paths. It starts no tasks and allocates no stream rings; `pocket_audio` owns tasks, rings and guest bindings.

TX and RX have separate lifecycles: pair `d1001_audio_init()` with
`d1001_audio_deinit()`, and `d1001_audio_input_open()` with
`d1001_audio_input_close()`. Closing or rolling back one direction never closes
the other. The caller must close both explicitly when releasing both codecs,
and keep the board/system I2C bus alive until both closes succeed.

Each direction serializes lifecycle operations (and TX codec controls) with its
own mutex. A short state spinlock protects readiness, closing and in-flight I/O
references; PCM transfers hold neither that spinlock nor a board lock while
blocked. Close rejects new transfers, disables I2S, waits for pinned transfers,
then deletes the channel and removes the codec. Driver waits use at most 20 ms
per wait with 1024-byte chunks so a transfer paused before driver entry can also
leave a disabled channel. `timeout_ms` is an overall transfer budget, subject
to FreeRTOS tick rounding; input reports partial frames on cancellation or
timeout. Cancellation returns `ESP_ERR_INVALID_STATE`. Calls are task-context
APIs, not ISR APIs. The per-direction mutex remains allocated across closes to
keep concurrent lifecycle callers safe.

Both close functions return `esp_err_t`. Failed channel deletion or I2C device
removal retains the corresponding handle; retry close after an error, including
`ESP_ERR_INVALID_STATE` when another system-I2C device is busy. A retained handle
blocks reinitialization instead of being overwritten. Initialization failures
attempt the same cleanup and return a cleanup error if cleanup also fails;
logs preserve both errors. Successful resource cleanup makes repeated close a
no-op. Existing playback callers can ignore the new return value, but should
handle/retry cleanup failures before setting up playback again.

- ES8311 7-bit address `0x18`, 400 kHz, slave mode, 16-bit Philips I2S, DAC path only.
- Output MCLK GPIO33, BCLK GPIO32, WS GPIO31 and DOUT GPIO30. I2S0 runs 44.1 kHz stereo with MCLK 256x (11.2896 MHz).
- PCA9535 P13 enables the speaker amplifier; board startup leaves it low and the mixer enables it only while a stream is playing.
- The output codec master volume defaults to 75% (register 0xBF, approximately 0 dB). Per-stream volume stays in the mixer.
- ES7210 7-bit address `0x40` opens lazily on I2S1: MCLK GPIO29, BCLK GPIO28, WS GPIO27 and DIN GPIO26, always 16-bit Philips stereo.
- Input rates are 44.1/22.05/11.025 kHz with fixed 11.2896 MHz MCLK at 256x/512x/1024x. The two microphone channels use 2.87 V bias, 24 dB gain, HPF and 0 dB ADC volume.
- ES8311 values follow Espressif `esp_codec_dev`. The narrowed ES7210 reset, HPF, bias, gain, power and coefficient sequence follows `Love4yzp/reTerminal-D1001` `driver_examples/02_I2SCodec_es7210` at `5074d3b`, using the new I2C master API.
