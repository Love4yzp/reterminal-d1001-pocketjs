# reTerminal D1001 audio

Owns the ES8311 and ES7210 codecs on the board's existing system I2C bus and the independent ESP32-P4 I2S0 TX/I2S1 RX paths. It starts no tasks and allocates no stream rings; `pocket_audio` owns tasks, rings and guest bindings.

- ES8311 7-bit address `0x18`, 400 kHz, slave mode, 16-bit Philips I2S, DAC path only.
- Output MCLK GPIO33, BCLK GPIO32, WS GPIO31 and DOUT GPIO30. I2S0 runs 44.1 kHz stereo with MCLK 256x (11.2896 MHz).
- PCA9535 P13 enables the speaker amplifier; board startup leaves it low and the mixer enables it only while a stream is playing.
- The output codec master volume defaults to 75% (register 0xBF, approximately 0 dB). Per-stream volume stays in the mixer.
- ES7210 7-bit address `0x40` opens lazily on I2S1: MCLK GPIO29, BCLK GPIO28, WS GPIO27 and DIN GPIO26, always 16-bit Philips stereo.
- Input rates are 44.1/22.05/11.025 kHz with fixed 11.2896 MHz MCLK at 256x/512x/1024x. The two microphone channels use 2.87 V bias, 24 dB gain, HPF and 0 dB ADC volume.
- ES8311 values follow Espressif `esp_codec_dev`. The narrowed ES7210 reset, HPF, bias, gain, power and coefficient sequence follows `Love4yzp/reTerminal-D1001` `driver_examples/02_I2SCodec_es7210` at `5074d3b`, using the new I2C master API.
