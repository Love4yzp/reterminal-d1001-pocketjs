# reTerminal D1001 Mini-PCIe modem BSP

Pure hardware support for one USB CDC-ACM modem behind the Mini-PCIe slot. The component owns modem power sequencing, USB Host/CDC-ACM lifetime, AT probing and basic SIM/CSQ/operator snapshots. It does not create a network interface, implement PPP/ECM/NCM, select routes, hold credentials or expose JavaScript APIs.

## API and integration boundary

- `d1001_modem_start()` copies the config and creates a worker; it does not wait for power, USB or AT readiness. `PROBING` changes to `READY` asynchronously; failed probes pass through `STOPPING` before `NOT_PRESENT` or `ERROR`.
- `READY` only means that the selected CDC interface answered `AT`. It does not assert SIM readiness, packet-service registration or Internet connectivity.
- `set_power` and `set_reset` are required; `set_disable` is optional. Callbacks receive logical assertion/enable values; the integrator owns PCA9535 access, polarity and pin mapping. Callbacks and `user_ctx` must remain valid until the worker stops. WAKE# is a modem output and SIM detect terminates at the modem, so this component intentionally has no host WAKE-output or SIM-GPIO callback.
- `usb_vendor_id == 0` and `usb_product_id == 0` accept any CDC-ACM device. Set both and `at_interface_index` from the actual module descriptor to avoid opening another CDC device.
- The worker sends `AT`, `AT+CPIN?`, `AT+CSQ` and `AT+COPS?`. `d1001_modem_refresh()` requests another snapshot without blocking; repeated pending requests coalesce. A complete final ERROR from CPIN/CSQ/COPS leaves that field unchanged or unknown. A command timeout, RX overflow or transport error ends the probe/refresh and powers down instead of sending another command into an ambiguous response stream. Final-result recognition requires a terminating CR or LF, including CME/CMS errors.
- Missing modules, disconnects and fatal CDC errors trigger cleanup. Install/exit completions and disconnect/error/stop requests are persistent event bits; refresh traffic cannot discard them. The event group is static and reused only after the previous worker finishes.
- `STOPPING` is nonterminal: the worker still owns callbacks and `user_ctx`. Power is released before waiting for USB teardown. CDC close/uninstall and USB Host uninstall failures retain a cleanup owner and retry every 100 ms; `last_error` retains the first cleanup error. See the retry-safe dependency below.
- `d1001_modem_stop()` waits up to 10 s. `ESP_ERR_TIMEOUT` means ownership has not been released: keep callbacks/`user_ctx` alive and call stop again or wait for a terminal state. After completion, stop returns the first cleanup error, even if a retry succeeded. Start is allowed after completion and resets the previous run's errors and completion signals. Stop completion is published under the status mutex; start is rejected while a stop caller is still collecting completion.
- Only one instance is supported. Public start/stop calls must not race each other. Status snapshots are protected by a static mutex.
- This is a CDC-ACM BSP only. Vendor-specific bulk serial, QMI, MBIM, PPP and CDC-ECM/NCM require their own matching driver and are not claimed by `READY`.

Zero-valued timing/stack/priority fields select these defaults:

| Field | Default |
|---|---:|
| `power_off_delay_ms` | 20 ms; validate discharge/minimum off time for the actual module |
| `reset_pulse_ms` | 100 ms |
| `power_on_delay_ms` | 1500 ms |
| `usb_probe_timeout_ms` | 3000 ms |
| `at_timeout_ms` | 750 ms per command |
| `task_stack_size` | 4096 bytes |
| `usb_task_stack_size` | 4096 bytes |
| `task_priority` | 5 (USB task 6, CDC task 7) |

The reset pulse is applied after power is enabled. DISABLE is deasserted, RESET is asserted while power is cycled, then released for the power-on delay. GPIO2 WAKE# must remain an input and is not used by this AT-only milestone. Module-specific timing belongs in the integration config, not in board-global initialization. The default 20 ms off interval is not a measured discharge guarantee; account for the slot's bulk capacitance and the selected module's minimum off time.

Add `platforms/esp-idf/d1001_modem` to the integrating project's `EXTRA_COMPONENT_DIRS`. `idf_component.yml` declares `esp32p4`, IDF `>=6.0,<6.3` and the local retry-safe `espressif/usb_host_cdc_acm 2.4.1` override. The reference ESP-IDF 6.2 dependency resolution used `usb_host_cdc_acm 2.4.1` and `espressif/usb 1.6.1`; it does not validate the local override or current lifecycle implementation. Their ESP-IDF build and device acceptance remain unverified.

### Retry-safe CDC dependency

`idf_component.yml` fixes CDC to 2.4.1 and resolves it from `vendor/usb_host_cdc_acm` within this component. The local override retains the upstream singleton when uninstall returns `ESP_ERR_NOT_FINISHED`, rejects new opens after teardown starts, and only frees the object after the CDC client confirms completion. The worker can retry and reclaim the object, mutex and event group. USB Host uninstall is retried independently by its owner task. `last_error` and completed stop retain the first cleanup failure even when retries succeed.

The vendor copy is necessary because unmodified CDC 2.4.1 clears its singleton before waiting for teardown and cannot recover its allocations after timeout. Source provenance, the narrow patch and removal criteria are in `vendor/usb_host_cdc_acm/README.d1001.md`. Install/open/close/uninstall calls remain exclusively owned and serialized by this BSP; it is not a shared system-wide USB service.

## Pure C host tests

Run all regressions from the repository root:

```sh
python3 platforms/esp-idf/d1001_modem/tests/run_host_tests.py
```

The runner compiles with C11, `-Wall -Wextra -Werror -pedantic`, ASan and UBSan; generated headers and binaries stay in `/tmp/d1001-modem-host-test`. Lifecycle tests compile the BSP source with deterministic host fakes and inject combined install/exit completion, refresh floods with disconnect/error, stop timeout/completion races, close/CDC/Host teardown failures and AT timeouts at each command. The CDC cleanup test executes the actual vendored uninstall body with delayed client completion, verifies timeout retention and retry reclamation, and verifies the client is not unblocked again after deregistration. These tests do not validate the IDF ABI, FreeRTOS scheduler or physical USB.

For the parser alone:

```sh
mkdir -p /tmp/d1001-modem-host-test
cc -std=c11 -Wall -Wextra -Werror -pedantic \
  -fsanitize=address,undefined -fno-omit-frame-pointer \
  -Iplatforms/esp-idf/d1001_modem/include \
  platforms/esp-idf/d1001_modem/src/d1001_modem_at.c \
  platforms/esp-idf/d1001_modem/tests/d1001_modem_at_test.c \
  -o /tmp/d1001-modem-host-test/d1001_modem_at_test
/tmp/d1001-modem-host-test/d1001_modem_at_test
```

Tests cover byte-by-byte final-result reception, fragmented CME/CMS prefixes, every reserved CSQ RSSI value from 32 through 98, preservation of the previous signal on rejection, partial responses, OK text inside operator data, Quectel/SIMCom-style CPIN/CSQ/COPS responses, numeric and quoted operators, unknown/out-of-range CSQ values and invalid arguments.

## ESP-IDF 6.2 component audit

The installed IDF is `188e3e55` (`6.2.0`). IDF 6.x moved the USB Host stack out of the core `components` directory; `espressif/usb` is pulled from the Component Registry. The local evidence is `~/esp/esp-idf-6.2/docs/en/migration-guides/release-6.x/6.0/peripherals.rst` and `examples/peripherals/usb/host/cdc/main/idf_component.yml`.

| Component | Registry version checked | ESP32-P4 / data-plane conclusion |
|---|---:|---|
| `espressif/usb` | 1.6.1 | P4 target declared; USB Host core for IDF 6.x |
| `espressif/usb_host_cdc_acm` | 2.4.1 | P4 target declared; CDC-ACM and vendor-class bulk byte streams, no IP data plane |
| `espressif/esp_modem` | 2.1.0 | AT/DCE/PPPoS; USB Host is not included |
| `espressif/esp_modem_usb_dte` | 1.3.1 | USB CDC DTE for `esp_modem`; has a P4 PPPoS example |
| `espressif/iot_usbh_modem` | 2.2.0 | Separate USB PPP/AT stack with P4 support, not an `esp_modem` wrapper |
| `espressif/iot_usbh_ecm` | 0.4.0 | Separate ECM driver; matches CDC subclass 0x06 |

No checked component implements an NCM data plane. Do not treat an NCM subclass constant, ECM, RNDIS or a CDC byte stream as NCM support. PPP and ECM are alternative follow-up integrations; this BSP deliberately does not pull either stack into the firmware.

Module evidence from the current `esp_modem_usb_dte` configuration/examples:

- Quectel EC20: `2c7c:0125`, interface 3, listed as tested. This is the relevant starting point for the direct `usb_host_cdc_acm` API used here.
- SIMCom A7670E: `1e0e:9011`, interface 4 with optional second AT interface 5, listed as tested. The basic AT parser is generic and does not include a SIM7600/PPP DCE.
- Quectel EG25: no current `esp_modem_usb_dte` preset or current `iot_usbh_modem` PPP-table entry was found. Old `iot_usbh_modem 1.2.0` has an EG25_GL preset (PPP interface 3, second AT interface 2), but that is only an adaptation clue. Verify descriptors and firmware USB mode before use.
- `iot_usbh_modem 2.2.0` uses different example interface numbers for the same modules (for example EC20 interface 2). Never copy an interface index between driver stacks; use the actual descriptor. The current ECM tested-module list does not establish EC20/EG25/A7670 support, so their evidenced route is PPP rather than assumed ECM.

Sources: the corresponding Component Registry release manifests, `ESP_MODEM_EC20_USB_CONFIG()`, `esp_modem` USB PPPoS examples, `iot_usbh_modem` examples, and the [Espressif USB PPP](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_host/usb_ppp.html) and [USB ECM](https://docs.espressif.com/projects/esp-iot-solution/en/latest/usb/usb_host/usb_ecm.html) documentation. Version numbers above are audit inputs, not claims of device validation.

## Integration Kconfig

No project `sdkconfig.defaults` change was made. Review these options during integration:

```text
# Recommended for modules whose configuration descriptor exceeds the 256-byte default.
CONFIG_USB_HOST_CONTROL_TRANSFER_MAX_SIZE=512

# Optional on this SPIRAM board: moves DWC qTD lists and URB data buffers to PSRAM.
CONFIG_USB_HOST_DWC_DMA_CAP_MEMORY_IN_PSRAM=y

# Only when the modem is attached through a hub; not needed for a direct Mini-PCIe link.
CONFIG_USB_HOST_HUBS_SUPPORTED=y
```

`USB_HOST_HW_BUFFER_BIAS_*` tunes controller FIFO, not heap. `CONFIG_USBH_CDC_CONTROL_TRANSFER_BUFFER_SIZE` belongs to the separate `iot_usbh_cdc` stack and is not used by this component.

A later PPP milestone must also evaluate `CONFIG_LWIP_PPP_SUPPORT=y`, `CONFIG_LWIP_PPP_NOTIFY_PHASE_SUPPORT=y` and operator-dependent `CONFIG_LWIP_PPP_PAP_SUPPORT=y`. `esp_modem` can select PPP support itself. These are not requirements of the AT-only BSP.

## Internal DMA and ordinary heap budget

USB 1.6.1 `hcd_dwc.c` allocates two qTD lists per pipe. Each qTD is 8 bytes; list allocation requires 512-byte alignment. The source-derived payload sizes are control 48 B, bulk 32 B, interrupt 512 B and isochronous 1024 B per pipe (both lists included). Each enabled controller also has a 128 B frame list in internal DMA RAM, even when qTD/data offload to PSRAM is enabled.

URB data is cache-line aligned (64 B for P4 internal RAM). Enumeration retains `8 + CONFIG_USB_HOST_CONTROL_TRANSFER_MAX_SIZE` bytes, and configuration-descriptor reads can temporarily allocate the same size again. For this BSP, `in_buffer_size=0` selects the IN endpoint MPS (typically 64 B FS or 512 B HS), OUT is 512 B, and an optional notification endpoint adds its MPS and interrupt pipe.

For one direct AT interface with EP0, two bulk pipes and one interrupt notification, the qTD plus frame-list payload is 752 B before alignment. With control max 512, HS IN, 512 B OUT, 64 B class control and 64 B notification, the explicitly requested descriptor/data items are approximately 2.9 KiB including one temporary configuration-descriptor buffer. This is **not** a heap measurement: it excludes alignment padding, block metadata, URB/class objects, fragmentation and other clients.

Budget recommendations, to be checked on hardware:

- Reserve 16 KiB of internal DMA heap for this single-port BSP initially. Keep 24 KiB as the starting budget for a future PPP plus second AT interface. These are conservative integration budgets, not source constants or measurements.
- With `CONFIG_USB_HOST_DWC_DMA_CAP_MEMORY_IN_PSRAM=y`, qTD lists and URB data move to PSRAM; the fixed internal frame-list payload is 128 B per controller plus alignment. Start with 4 KiB internal DMA debugging headroom and account separately for third-party class allocations.
- Ordinary heap is separate: this component creates three 4096 B task stacks (modem, USB and CDC), a 1024 B RX stream, TCBs and USB objects. Its event group and status/stop synchronization objects use static storage. PPP/lwIP memory is not included.
- Add USB usage on top of the display's independent 128 KiB internal DMA staging budget. USB DWC has its own scatter/gather DMA and does not consume a PPA/GDMA channel number; shared internal SRAM, aligned free blocks, cache sync and memory/AHB bandwidth are the real interactions.

The fully linked minimal P4 check reported `libd1001_modem.a`: 336 B DIRAM `.bss` and 5642 B flash; `libespressif__usb.a`: 1094 B DIRAM and 41112 B flash; `libespressif__usb_host_cdc_acm.a`: 12 B DIRAM and 8792 B flash. These are reference archive contributions from the earlier unmodified baseline, not sizes for the current lifecycle code/local override, runtime DMA usage or whole-firmware deltas. Remeasure at integration.

At integration, capture `MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL` free, largest-free and minimum-free sizes before USB install, after install, after CDC open and after traffic/repeated replug. The existing firmware's periodic internal-DMA heap log can be used; no startup blocking or new logger is needed in this BSP. Record all three values because 512-byte aligned allocations can fail even with a large total free heap.

## Mini-PCIe electrical audit

Evidence baseline:

- `Love4yzp/reTerminal-D1001` commit `5074d3b2f45626b261298e305aaf792036febc5a`. This repository contains BSP/firmware, not the schematic itself.
- Official `reTerminal_D1001_260715.pdf`, 13 pages, SHA-256 `c488b1aeac3e8fd72d08f65aeb23e8c1143f0b36e2997024ddee252daa4a292c`, linked from `Seeed-Studio/wiki-documents` at `sites/en/docs/Sensor/LCD_Displays/reTerminal_D10xx/getting_started_with_reterminal_D1001.md`. Schematic/PCB sources are under `reTerminal D1001 main board V1.0 SCH & PCB_260715/`.
- The upstream BSP mapping in `components/esp32_p4_re_terminal_d1001/include/esp32_p4_re_terminal_d1001.h:131-137` matches the schematic. The schematic is not tracked by the Love4yzp commit, so exact PCB revision still must be checked on the device.

`U27` is PCA9535 at I2C address `0x20` on the system I2C bus (P4 GPIO21 SCL/GPIO20 SDA). Linear bit numbers below are the 16-bit BSP masks, not the `EXP_PIN_NUM_n` symbol names.

| Signal | Verified connection | Integration meaning |
|---|---|---|
| Power enable | U27 P17/P1.7, bit15/mask `0x8000` → `EXP_GPO15`/`PCIE_PWR_EN` → U10 enable; VSYS → U10 → `PCIE_3V3` | `set_power(true)` drives bit15 high, false low. Schematic marks the regulator 1.5 A maximum; R58 is a 1 MΩ pull-down |
| RESET | U27 P16/P1.6, bit14/mask `0x4000` → `PCIE_RESETn` → U21 `PERST#` pin22 | Low-active. `set_reset(true)` drives bit14 low, false high |
| W_DISABLE# | U27 P15/P1.5, bit13/mask `0x2000` → `AIRPLANE_MODEn` → U21 pin20 | Low-active flight mode. `set_disable(true)` drives bit13 low, false high for normal operation |
| DTR | U27 P04/P0.4, bit4/mask `0x0010` → `PCIE_DTRn` → R123 0 Ω → U21 pin31 | Low-active; not used by this AT-only milestone or any sleep policy |
| WAKE# | U21 pin1 → R124 0 Ω → `PCIE_WAKE_HOSTn` → P4 GPIO2 | Modem output, P4 input. Do not drive GPIO2 from the power/reset callback |
| USB D− | U21 pin36 → `PCIE_USB_DN`/`USB_HS_DN` → P4 dedicated package pad49 `USB_DM` | OTG_HS integrated UTMI PHY, not GPIO49 |
| USB D+ | U21 pin38 → `PCIE_USB_DP`/`USB_HS_DP` → P4 dedicated package pad50 `USB_DP` | OTG_HS integrated UTMI PHY, not GPIO50 |
| SIM detect | J4 SIM C7/CD → R127 0 Ω → U21 `USIM_PRESENCE` pin44 | No P4 GPIO/PCA connection. R126/R128 pull options are DNP; polarity/debounce requires the modem/SIM-holder data or measurement |
| SIM data/power | U21 `USIM_VDD/DATA/CLK/RST` pins8/10/12/14 → J4 C5/C2/C1/C3 | SIM is electrically owned by the modem. R125 pulls SIM_DIO to SIM_VDD. Host status comes from CPIN |
| Mini-PCIe UART | U21 RX/TX pins11/13 → R60/R59 0 Ω | Netlist has no P4/other-device endpoint; cannot serve as the P4 console |

U21 pin42 only reaches a DNP LED path. PCM, I2C, RI, UART CTS/RTS and RESERVED are not connected to the host. There is no PCIe differential data link: this slot uses USB, 3.3 V, sideband signals and SIM.

The component explicitly installs USB Host with `peripheral_map = BIT0`, selecting OTG_HS. P4 OTG_HS has an integrated UTMI PHY and needs no external ULPI PHY. OTG_FS GPIO26/27 and USB Serial/JTAG GPIO24/25 are separate and are not used here.

### Integration callback mapping and baseline caution

Use the existing board I2C/PCA9535 lock and shadow-register update when implementing callbacks; do not independently write the whole 16-bit output register. Bit13–15 updates must preserve display, touch and audio outputs.

At the audited PocketJS baseline (`5534ad9`), `pca9535.c` initializes outputs to `0xf3ff` and `d1001_board.c` configures all 16 pins as outputs. Consequently bit15=1 powers the modem, bit14=1 releases RESET and bit13=1 releases W_DISABLE. Do not assume an unused modem starts powered off. The BSP start sequence deliberately cycles power; integration must tolerate the initial already-powered state. The upstream reference uses a 10 ms reset pulse, while this component defaults to a conservative configurable 100 ms; validate the selected module's requirement rather than treating either value as universal.

## USB/JTAG/console/SDIO/display conflict audit

- **4G versus USB-JTAG:** no conflict. USB1 Type-C uses GPIO24/25; Mini-PCIe uses dedicated HS pads49/50. No separate four-wire JTAG connector was found.
- **4G versus C6:** no conflict. C6 SDIO uses CMD6, D0=7, D1=8, D2=9, D3=10, CLK=11, with CHIP_PU=13 and boot/UART sidebands on 12/47/48.
- **4G versus display/touch:** no modem overlap. MIPI DSI uses dedicated analog pads, not same-numbered GPIOs. Touch uses GPIO37/38 and interrupt16; system I2C/PCA uses20/21.
- **Existing console issue, not caused by modem:** IDF 6.2 defaults UART0 console TX/RX to GPIO37/38, which are already touch SDA/SCL. Default UART1 TX/RX=10/11 would collide with C6 D3/CLK. Console configuration must be resolved separately during integration; it was not changed in this task.
- **DMA:** USB DWC does not allocate PPA/GDMA channels. It shares internal DMA SRAM, aligned free blocks, cache synchronization and memory/AHB bandwidth with display and SDIO. No ESP32-S2 ECO0 USB DMA erratum should be applied to P4; P4 still needs bandwidth/latency/heap stress validation.

## Hardware acceptance checklist

No item below is marked complete without a real board and the named module:

1. Identify PCB revision, P4 revision, inserted module and firmware USB mode. Confirm the schematic hash/revision matches the board. Check SIM orientation and the 3.3 V supply/current path before enabling power.
2. Scope or log PCA bit15/14/13 transitions for power, RESET and W_DISABLE. Verify the 100 ms configured reset pulse and module boot delay against its data sheet. Keep GPIO2 as input and verify unrelated PCA outputs never change.
3. Start with no module: `start` returns immediately, the rest of firmware continues, and state reaches `NOT_PRESENT` after the configured power delay plus USB timeout (about 4.5 s with defaults), with no leaked task/RX/USB allocation after completed teardown, including a transient CDC teardown timeout followed by a successful retry. Repeat start/stop cycles.
4. Capture the actual USB configuration descriptor: VID/PID, interface numbers, class/subclass/protocol, bulk endpoints and MPS. Set VID/PID and AT interface from that evidence. Do not copy interface numbers from another modem firmware or driver stack.
5. For EC20, EG25 and A7670 variants separately, verify HS enumeration, `AT`, inserted/removed SIM CPIN results, CSQ raw/dBm conversion, COPS operator and refresh. EG25 support remains explicitly unproven until this passes. Do not enter or log SIM PIN/PUK secrets during tests.
6. Test USB disconnect, modem-initiated reset, stop during each probe phase and at least 20 repeated power/enumeration cycles. Confirm terminal states and that another start does not report `ESP_ERR_INVALID_STATE` after cleanup.
7. Run display updates, touch input and C6 Wi-Fi traffic concurrently with USB enumeration/AT traffic. Capture at least 30 s of serial output including internal DMA heap and runner statistics; resolve the existing UART0/touch console conflict first so logs are trustworthy.
8. Record internal DMA free/largest/minimum before install, after install, after CDC open and after repeated cycles. Check the 16 KiB starting budget and PSRAM-offload variant independently. Also record ordinary heap and task-stack high-water marks.
9. A later PPP/ECM milestone must verify its chosen component, SIM/APN provisioning, registration and data path separately. This BSP does not validate PPP, ECM/NCM, multi-netif routing, HTTP or JavaScript behavior.

Evidence limitations: schematic/netlist and source audits are complete, but no electrical waveform, module descriptor, SIM polarity, modem timing, driver runtime or heap low-water value has been measured. The Love4yzp source and official hardware package agree on the mapping, but that does not prove every manufactured PCB revision.
