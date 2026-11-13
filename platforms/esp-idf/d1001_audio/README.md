# reTerminal D1001 audio output

Owns the ES8311 codec on the board's existing I2C1 system bus and the ESP32-P4 I2S0 TX path. It returns no tasks and allocates no stream rings; `pocket_audio` owns the mixer task and guest bindings.

- ES8311 7-bit address `0x18`, 400 kHz, slave mode, 16-bit Philips I2S, DAC path only.
- MCLK GPIO33, BCLK GPIO32, WS GPIO31, DOUT GPIO30, DIN unused. I2S0 runs 44.1 kHz stereo with MCLK 256x (11.2896 MHz).
- PCA9535 P13 enables the speaker amplifier; board startup leaves it low and the mixer enables it only while a stream is playing.
- The codec master volume defaults to 75% (register 0xBF, approximately 0 dB). Per-stream volume stays in the mixer.
- Register values follow Espressif `esp_codec_dev` ES8311 (Apache-2.0), narrowed to the DAC playback path.
