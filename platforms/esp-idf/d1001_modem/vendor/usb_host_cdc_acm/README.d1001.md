# D1001 retry-safe CDC dependency

Source: Espressif `usb_host_cdc_acm` 2.4.1, repository commit `eb0f02163be96dfc753cf43d1207329e44f1ca60`, path `host/class/cdc/usb_host_cdc_acm`. The component manifest and Apache-2.0 license are retained. Only runtime sources/headers and build metadata are included; upstream examples/tests are not vendored.

The local patch in `cdc_acm_host.c` keeps the singleton reachable across an uninstall timeout, sends the client teardown request only once, rejects new opens while teardown is pending, and clears/frees the singleton after confirmed teardown. Callers must serialize driver lifecycle calls; D1001's worker is their sole owner. CMake restricts this copy to ESP32-P4 and enables the project warning flags.

The parent manifest uses `override_path` so no managed component files are modified. Keep the source pinned and compare this narrow patch when updating. Remove the override and vendor directory only when an upstream release has equivalent retry-safe teardown and the timeout/retry host regression and device lifecycle acceptance both pass.

Host verification uses the actual vendored uninstall function with fake synchronization/client completion; it does not validate the physical USB controller or FreeRTOS scheduling. Full ESP-IDF build and hardware acceptance remain required at integration.
