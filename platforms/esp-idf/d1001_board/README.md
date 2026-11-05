# reTerminal D1001 board component

Owns I2C0 (touch), I2C1 (system/PCA9535), panel power and reset, the JD9365 MIPI-DSI DPI panel, LDO_VO3 and the GPIO14 PWM backlight. It returns handles and creates no tasks. Touch support is reserved for M3.

Hardware values and JD9365 initialization are derived from Seeed-Studio/reTerminal-D1001 at commit `5074d3b`, specifically `components/esp32_p4_re_terminal_d1001` and `components/esp_lcd_jd9365_8` (Apache-2.0). No Seeed BSP, component or LVGL dependency is linked.
