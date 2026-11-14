# PocketJS for reTerminal D1001

![PocketJS](https://img.shields.io/badge/PocketJS-0.16.0-0ea5e9)
![ESP-IDF](https://img.shields.io/badge/ESP--IDF-6.2-E7352C)
![Target](https://img.shields.io/badge/Target-ESP32--P4%20%7C%20reTerminal%20D1001-22c55e)
![Runtime](https://img.shields.io/badge/Runtime-QuickJS--ng%200.14.0-f59e0b)
![License](https://img.shields.io/badge/License-MIT-64748b)

[English](README.md) | **简体中文**

Seeed reTerminal D1001（ESP32-P4 + 8 英寸 800×1280 JD9365 MIPI-DSI 触摸屏）的 PocketJS 应用运行时与 ESP-IDF 宿主固件。应用使用 TypeScript 和 SolidJS 编写，编译为 `quickjs-ng 0.14.0` 字节码后在本地 WASM 宿主预览，再通过 USB 或 Wi-Fi 增量推送到设备渲染，不依赖 LVGL、Qt 或 Linux/WebView。

## 界面展示（Showcase）

以下截图均由仓库内置 WASM 宿主直接渲染，复用与 ESP32-P4 固件相同的 `@pocketjs/framework` + `solid-js` 管线，对应竖屏 `400×640` 与横屏 `640×400` 逻辑画布（`rasterDensity: 2`，物理屏分辨率 `800×1280` / `1280×800`）。

### 竖屏界面（`400×640` 逻辑画布）

| [`apps/ha-panel`](apps/ha-panel) — 智能家居仪表盘 | [`apps/showroom-ha-panel`](apps/showroom-ha-panel) — RGB 色轮调光 | [`apps/field-ops-panel`](apps/field-ops-panel) — 储能微网看板 |
| :---: | :---: | :---: |
| ![ha-panel 竖屏首页](docs/assets/showcase/ha-panel-portrait-home.png) | ![showroom-ha-panel 竖屏色轮](docs/assets/showcase/showroom-portrait-dimmer.png) | ![field-ops-panel 竖屏储能概览](docs/assets/showcase/field-ops-portrait-ess.png) |
| 灯光卡片、亮度进度条、快捷场景与底部导航栏。 | 交互式 HSV 色盘、开关/模式切换与长按调光控制。 | SoC 电量条、直流母线/电芯遥测、未确认告警横幅与快捷动作。 |

### 横屏界面（`640×400` 逻辑画布）

| [`apps/showroom-ha-panel`](apps/showroom-ha-panel) — 双语展厅首页（EN） | [`apps/showroom-ha-panel`](apps/showroom-ha-panel) — 系统设置页 | [`apps/field-ops-panel`](apps/field-ops-panel) — LoRaWAN 巡检看板 |
| :---: | :---: | :---: |
| ![showroom-ha-panel 横屏英文首页](docs/assets/showcase/showroom-landscape-home-en.png) | ![showroom-ha-panel 横屏设置页](docs/assets/showcase/showroom-landscape-settings.png) | ![field-ops-panel 横屏 LoRaWAN 概览](docs/assets/showcase/field-ops-landscape-lorawan.png) |
| 中英切换、电池与 USB 5V 供电状态（`readPower`）、传感器卡片与 Reachy/机械臂动作。 | 背光滑动条、自动息屏计时、Wi-Fi/HA 状态、电量信息与返回竖屏入口。 | 节点在线率、T1000-E 追踪器数量、网关 RSSI 与待处理 SOS 告警。 |

## 架构与运行取舍

| 维度 | 实现方式 | 约束与取舍 |
|---|---|---|
| **UI 与渲染** | 使用 `@pocketjs/framework` + `solid-js` 编写逻辑画布（竖屏 `400×640` / 横屏 `640×400`，density 2）；底层由 ESP32-P4 双路 PPA 与 GDMA retained-move 驱动 `800×1280` RGB565 屏幕，无 LVGL 依赖。 | 全宽矩形列表走 GDMA retained-move；局部宽度列表会退回较慢的 PPA 分带搬运路径。 |
| **运行时与内存** | 字节码直接在 ESP-IDF 上的 `quickjs-ng 0.14.0` 运行（Guest 堆上限 8 MiB，栈 192 KiB，栈保护 144 KiB）；内部 DMA 显示双缓冲合计 ≤ 128 KiB。 | 不提供浏览器 DOM、Node API 或 Linux 系统调用，应用仅能调用宿主注册的能力。 |
| **预览与热推** | 桌面 WASM 宿主按同一管线离线输出横竖屏截图；`bun run app:push` 按 4 KiB 扇区比对差量写入 `apps` 分区，典型增量推送约 3 秒。 | Wi-Fi 热推（`POST /push`）默认编译关闭，需在 `sdkconfig.local` 显式开启并配 token；串口推送依赖 ESP-IDF 提供的 `esptool`。 |
| **固件边界与回退** | I2C 总线、PCA9535、背光、GPIO3 `CIRCLE` 按键仲裁、Wi-Fi 预设轮换及槽位隔离的 `data.fs`（`/pocket`）由固件持有；`apps` 分区为空或校验失败时自动回退至内嵌 `apps/worker-http`。 | 应用不保存 Wi-Fi 密码，也不能直接访问底层总线；设备凭据存放在 `storage` 分区或被忽略的 `sdkconfig.local` 中。 |

## 快速上手

本地 WASM 预览仅需安装 [Bun](https://bun.sh/)（`>= 1.4.4`）：

```sh
git submodule update --init third_party/pocketjs
bun install

# 在本地 WASM 宿主中渲染横竖屏冒烟截图（无需连接硬件）
bun run preview --smoke
bun run ops:preview --smoke
bun run showroom:preview --smoke
```

将应用增量推送到 D1001 真机（需先加载 [ESP-IDF 6.2](docs/build-and-deploy.md#toolchain-requirements) 环境以提供 `esptool` / `idf.py`）：

```sh
. ~/esp/esp-idf-6.2/export.sh

# 仅推送 apps 分区增量包（约 3 秒，不重编固件）
bun run app:push apps/ha-panel
bun run app:push apps/ha-panel --wifi <device-ip>   # 需开启开发期 Wi-Fi 热推固件
```

首次烧录固件、迁移分区表或重编固件（需 Rust `1.98.1` 及 `riscv32imafc-unknown-none-elf` 目标），请参见 [docs/build-and-deploy.md](docs/build-and-deploy.md)。

## 两种应用开发流程

仓库同时支持基于 `AGENTS.md` 与 Skill 的 Coding Agent 协作，以及常规手动 TypeScript 开发：

| 环节 | AI 辅助开发 | 手写 TypeScript 开发 | 对应文件 / 命令 |
|---|---|---|---|
| **1. 清单与界面** | 让 Agent 基于 [`apps/`](apps) 模板修改或新增页面，能力调用收敛在 [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json) 范围内。 | 手动创建 `apps/<my-app>/pocket.app.json`、`main.tsx`（SolidJS 页面）及可选的 `worker.ts`（HTTP 轮询）。 | [`AGENTS.md`](AGENTS.md)、[`SKILL.md`](skills/pocketjs-app-dev/SKILL.md) |
| **2. 字体与契约检查** | 文案变更后由 Agent 刷新中文确定性字体子集，并校验能力声明与 `7 MiB` 分区余量。 | 涉及中文显示时运行字体子集脚本，再执行能力与分区预算检查。 | [`apps/field-ops-panel/fonts/tool.ts`](apps/field-ops-panel/fonts/tool.ts)、`bun run pocket check` |
| **3. 本地测试与截图** | Agent 运行对应单测及 `--smoke` / `--all` WASM 预览并核对截图。 | 编写 `*.test.ts` 与 [`tools/`](tools) 预览脚本，脱离真机验证 `400×640` 与 `640×400` 排版及触控。 | `bun test`、[`tools/ha-panel-preview.ts`](tools/ha-panel-preview.ts) |
| **4. 增量部署** | 通过 `app:push` 仅更新应用包；仅改动 C/ESP-IDF 代码时才重编并烧录固件。 | 将编译后的 `PKAP v1` 包差量写入 `apps` 分区（`0x510000`）。 | `bun run app:push apps/<app>`、`idf.py -C programs/reterminal-d1001 flash monitor` |

手动执行宿主契约与容量检查命令：

```sh
bun run pocket check --manifest apps/<my-app>/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts
```

## 硬件能力与 BSP 接入状态

### 已在 [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json) 注册的宿主能力

| 能力标识 | 对应组件 | 硬件与实现说明 |
|---|---|---|
| `input.touch`、`input.buttons` | `d1001_board` + `pocket_d1001` | GSL3670 电容触控（180° 镜像与横竖屏坐标映射）及 GPIO3 `CIRCLE` 按键（固件仲裁旋转、息屏唤醒与长按 3 秒重启）。 |
| `audio.pcm` | `d1001_audio`（`ES8311`） | I2S0 44.1 kHz 立体声外放；PCA9535 P13 功放仅在有音频流播放时开启。 |
| `data.fs` | `pocket_fs_esp` | FAT `storage` 分区挂载于 `/pocket`（`0xC10000`，大小 `0x3F0000`），按应用槽位隔离；驱动不自动格式化。 |
| `net.http`、`runtime.worker` | `pocket_http_esp`、`pocket_worker_esp` | 独立后台 HTTP Worker（`nodes.http: 1`），不阻塞 UI 帧循环。 |
| `system.wifi` | `pocket_wifi_esp` | ESP-Hosted 3.0.10 + C6 2.3.2（2.4 GHz），支持 2 组 Kconfig 预设故障切换与 `wifi.nextPreset()`。 |
| `system.device`、`text.glyphs.baked` | `pocket_device` + 打包工具 | 背光与设备控制接口，以及烘焙的 density-2 字体图集。 |

### 面板原生绑定与扩展中的 ESP-IDF BSP

| 组件 | 硬件 / 接口 | 当前接入状态 | 说明 |
|---|---|---|---|
| [`d1001_power`](platforms/esp-idf/d1001_power/README.md) | `ADC1` ch1/ch2（`GPIO17`/`GPIO18`）、`GPIO15`（BQ25616 `STAT`）、PCA9535 `P06` | **已接入主固件**（`d1001.readPower()`） | 通过 `d1001_panel.c` 暴露电池电压/电量百分比、USB 5V 在位及 `chargeState`（`usb_absent` / `charging` / `usb_idle` / `inconsistent`，2 秒缓存），已在 [`apps/showroom-ha-panel`](apps/showroom-ha-panel) 使用；尚未注册为 `pocket.host.json` 独立能力，板级 RC 稳定时间与仪表校准待实测。 |
| [`d1001_imu`](platforms/esp-idf/d1001_imu/README.md) | `LSM6DS3TR-C`（I2C1 `0x6a`，`INT1` 接 `GPIO19`） | **部分接入**（`d1001.readSensors()`） | `d1001_panel.c` 按需初始化并返回加速度/角速度/芯片温度 JSON；`INT1` 敲击唤醒路由及 `pocket.host.json` 独立运动能力尚未接入。 |
| [`d1001_audio`](platforms/esp-idf/d1001_audio/README.md)（采集） | `ES7210` 双麦克风（I2C1 `0x40`，I2S1 RX） | **仅 Phase 1 BSP** | 已实现 `d1001_audio_input` 驱动，尚未接入 `pocket_audio` 及主程序，也未在 `pocket.host.json` 注册。 |
| [`d1001_camera`](platforms/esp-idf/d1001_camera/README.md) | `SC2356` MIPI-CSI0（I2C0 `0x36`，576 Mbps RAW8） | **仅 Phase 1 BSP** | 已加入 `programs/reterminal-d1001` 编译依赖，尚未接入 `main.c` / `d1001_panel.c` 或注册到 `pocket.host.json`。 |
| Mini-PCIe 4G LTE | 板载 Mini-PCIe 蜂窝接口 | **规划中** | 当前 `main` 分支尚未合入对应 BSP 组件。 |

## 仓库结构概览

| 应用 / 目录 | 说明 | 文档 |
|---|---|---|
| [`apps/ha-panel`](apps/ha-panel) | 可派生双横竖屏模板（虚拟/板载/HA 灯光、调光器、RTC/SNTP 设置） | [`README`](apps/ha-panel/README.md) |
| [`apps/field-ops-panel`](apps/field-ops-panel) | 多配置工业模板（`ess`/`charger`/`lorawan`、动态换肤、离线缓存锁定、`VirtualList`） | [`README`](apps/field-ops-panel/README.md) |
| [`apps/showroom-ha-panel`](apps/showroom-ha-panel) | 中英双语控制台（`audio.pcm` 音效、HSV 色轮、`d1001.readPower()` 电量显示、槽位 `data.fs`） | [`README`](apps/showroom-ha-panel/README.md) |
| [`apps/worker-http`](apps/worker-http) | 固件内嵌默认回退应用（`runtime.worker` HTTP 轮询） | [`README`](apps/worker-http/README.md) |
| [`apps/input-test`](apps/input-test) | 触摸校准、GPIO3 `CIRCLE` 按键计数与 80 行 GDMA 滚动自测 | — |
| [`apps/system-test`](apps/system-test) | `data.fs` 持久化、7 色 RGB LED、背光调光与 Wi-Fi 扫描自测 | — |
| [`apps/hello-d1001`](apps/hello-d1001) | 最小开发包（用于实测约 3 秒 `app:push` 耗时） | — |
| [`platforms/esp-idf`](platforms/esp-idf) | 原生 ESP-IDF BSP（`d1001_board`、`d1001_audio`、`d1001_power`、`d1001_imu`、`d1001_camera`）与 `pocket_*_esp` 组件 | [`d1001_board`](platforms/esp-idf/d1001_board/README.md) |
| [`programs/reterminal-d1001`](programs/reterminal-d1001) | ESP32-P4 宿主工程、`partitions.csv` 与能力清单 [`pocket.host.json`](programs/reterminal-d1001/pocket.host.json) | [架构文档](docs/architecture-and-firmware.md) |
| [`tools`](tools) | `app:push` 推送、分区检查、WASM 预览脚本与本地 Mock 服务 | [构建与部署](docs/build-and-deploy.md) |

## 文档导航

| 文档 | 适用场景 | 核心内容 |
|---|---|---|
| [`docs/architecture-and-firmware.md`](docs/architecture-and-firmware.md) | 修改固件、显示管线、按键仲裁或 Wi-Fi 策略 | 分层边界、PPA/GDMA 渲染与 DMA 预算、GPIO3 按键仲裁、FAT 存储、Wi-Fi 预设轮换 |
| [`docs/build-and-deploy.md`](docs/build-and-deploy.md) | 编译固件、迁移分区表或排查热推问题 | 工具链版本、`sdkconfig.local` 优先级、`partitions.csv`、串口诊断日志、USB/Wi-Fi 热推原理 |
| [`AGENTS.md`](AGENTS.md) 与 [`skills/pocketjs-app-dev/SKILL.md`](skills/pocketjs-app-dev/SKILL.md) | 开发新应用或配置 Coding Agent | 工程红线、验收检查矩阵与 Agent 协同规范 |
