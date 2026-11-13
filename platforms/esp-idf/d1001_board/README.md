# reTerminal D1001 board component

Owns I2C0 (touch), I2C1 (system/PCA9535), panel power and reset, the JD9365 MIPI-DSI DPI panel, GSL3670 touch, LDO_VO3, the GPIO14 PWM backlight, the active-high RGB LED and the PCA9535 P13 speaker-amplifier enable. It returns handles and creates no tasks.

The RGB LED uses GPIO22 (red), GPIO36 (green) and GPIO23 (blue) on LEDC channels 1, 2 and 3. PCA9535 register updates are serialized by a FreeRTOS mutex so board power, touch reset and the audio PA can share the expander safely. These channels reuse the backlight's 1 kHz, 10-bit LEDC timer 0; GPIO14 remains on channel 0. `d1001_board_rgb_set` controls the three channels independently, so callers can combine colors. `d1001_board_rgb_set_color` additionally accepts normalized 8-bit channels and scales them to the per-channel maxima. All channels start at duty 0 (off); enabled channels use duty 20 (red), 8 (green) or 50 (blue). Logs include the requested channel states and target LEDC duties; LEDC applies a new duty at the next PWM cycle.

Touch uses I2C0 at address `0x40` and 400 kHz, with `x_max=800`, `y_max=1280`, no axis swap, and both axes mirrored. `D1001_TOUCH_INT_GPIO` defaults to GPIO16 and can be changed in `menuconfig`; `-1` disables the interrupt input. Touch reset is PCA9535 P12 through the board's own `d1001_pca9535_set_level`, not a BSP global. Call `esp_lcd_touch_read_data` from the existing application polling path to sample the controller. Changed touch samples are logged at most once per 100 ms with raw, mirrored physical, and half-scale logical coordinates.

## Sources and licenses

Hardware values and JD9365 initialization are derived from Seeed-Studio/reTerminal-D1001 at commit `5074d3b`, specifically `components/esp32_p4_re_terminal_d1001` and `components/esp_lcd_jd9365_8` (Apache-2.0).

The GSL3670 protocol, firmware image and point-id configuration are board-local ports of `components/esp_lcd_touch_gsl3670` at the same commit (Apache-2.0), including the BSP touch settings at `esp32_p4_re_terminal_d1001.c:730-761`. The Silead point-id algorithm in `src/gsl3670_point_id.c` retains its upstream GPL-2.0-or-later license. Other board code remains MIT; the combined component carries all three license designations.

No Seeed BSP, Seeed component or LVGL dependency is linked. The only external touch dependency is `espressif/esp_lcd_touch` version 1.2.1 for the generic touch handle and coordinate API.
