# pocket_device

`globalThis.device` for the reTerminal D1001, implementing the PocketJS `system.device` contract (`contracts/spec/device.ts`). The operation task and QuickJS binding are ported from `programs/m5stack-tab5/components/pocket_device/src/device.c` and `include/pocket/device.h` in pocket-m5 commit `aa8a0ca3ad4bc2aca737af128310c1269902c4cf`. M5 BSP, IO-expander, USB, audio, card, free-pin and power-off support are not part of this port.

| Operation | D1001 mechanism |
| --- | --- |
| `status()` | PocketJS `DeviceStatus` JSON with the JD9365 panel, backlight and RGB switch state; unsupported ports, pins and card are empty |
| `setBrightness(percent)` | `d1001_board_backlight_set` on GPIO14, clamped to 0–100 |
| `setSwitch(id, on)` | `led-r`, `led-g` or `led-b`, mapped to the active-low GPIO22, GPIO36 or GPIO23 PWM channel |

The switch states are independent. Repeated `setSwitch` calls select any combination of red, green and blue without adding operations or status fields to the PocketJS contract. Unsupported operations are not installed.

Every operation runs synchronously on the component task, whose 6 KiB stack is allocated with `MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT`. Setup initializes the backlight to 100% and all RGB channels off. Guest teardown restores those defaults and leaves the task available for the next guest.
