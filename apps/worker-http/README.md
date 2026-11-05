# D1001 Worker HTTP

A 400x640 native-primary app adapted from `pocket-m5/apps/worker-http` at commit `aa8a0ca3ad4bc2aca737af128310c1269902c4cf`. It requires `runtime.worker`, `net.http` and `text.glyphs.baked`, declares only the `http` worker node, and has no touch or keyboard UI.

At worker startup it sends one HTTP GET to `http://example.com/`. Edit `TARGET_URL` in `protocol.ts` to select another URL. The request has a 30-second timeout and a 256 KiB response-body limit.

The worker streams response facts and publishes a `progress` snapshot to the UI. Its 256-byte record contains the phase, HTTP status, response-body byte count, resource status and a printable-ASCII error of up to 240 bytes. The UI displays these fields; headers, errors and the final status and byte count also print on the serial console.

The D1001 Wi-Fi driver starts independently of this app. A usable network and any required Wi-Fi provisioning must already be present; this app does not scan, join or save a network.
