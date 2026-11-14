# D1001 Field Ops Console (`apps/field-ops-panel`)

A forkable, config-driven industrial & field equipment HMI baseline (`dev.pocket-nexus.d1001.field-ops-panel`) for reTerminal D1001 with 400×640 portrait and rearranged 640×400 landscape views.

## Why fork this app

- **Industry-ready vertical template**: Ships with three switchable profiles (`ess` 储能微网柜, `charger` 直流充电桩, `lorawan` LoRaWAN + T1000-E 巡检网关) over a single normalized telemetry/command/alarm HTTP contract.
- **Hot-swappable theme tokens**: [`theme.ts`](theme.ts) isolates all colors (`cobalt`, `emerald`, `amber`); switch live on screen or edit one palette without touching component files.
- **Delivery closed-loop & offline safety**:
  - Live telemetry cached to slot-local `data.fs` (`ops-cache.json`).
  - Disconnected or stale readings (`> staleAfterSeconds`) automatically lock remote setpoint/ack writes with a clear status banner.
  - Setpoint changes follow `commit -> pending -> readback confirm/fail` receipt state.
  - Unacknowledged critical alarms raise onboard RGB (`d1001.setRgb`) + optional `audio.pcm` chime and list inside a full-width GDMA `VirtualList`.

## 5-minute Quickstart (Desktop & Hardware)

```sh
# 1. Start the local multi-profile mock gateway (port 18124)
MOCK_OPS_TOKEN="ops-demo-token" bun run ops:mock

# 2. Verify tests, CJK font subset, manifest, and desktop WASM screenshots
bun test apps/field-ops-panel tools/partitions.test.ts
bun run ops:fonts --check
bun run pocket check --manifest apps/field-ops-panel/pocket.app.json \
  --host-config programs/reterminal-d1001/pocket.host.config.ts
bun run ops:preview --all

# 3. Push app-only PKAP delta to D1001 (~3 seconds)
bun run app:push apps/field-ops-panel --wifi <device-ip>
```

## Slot-local `ops-config.json` format

Store per-device gateway settings inside this app slot's `data.fs` (`ops-config.json`):

```json
{
  "version": 1,
  "baseUrl": "http://192.168.1.50:18124",
  "token": "replace-with-gateway-token",
  "profileId": "ess",
  "staleAfterSeconds": 30,
  "pollIntervalMs": 3000
}
```

## HTTP API contract

- `GET /api/v1/ops/snapshot?profile=<ess|charger|lorawan>`: returns `OpsTelemetrySnapshot`.
- `POST /api/v1/ops/command`: `{ profileId, mode, targetKw, commandId }` -> `{ ok, message, snapshot }`.
- `POST /api/v1/ops/alarms/:id/ack?profile=<...>`: `{ acked: true }` -> `{ ok, message, snapshot }`.
