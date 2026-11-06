import argparse
import json
import sys
from pathlib import Path

from esptool.cmds import (
    _diff_flash_regions,
    attach_flash,
    connect_esp,
    reset_chip,
    run_stub,
    write_flash,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True)
    parser.add_argument("--offset", required=True)
    args = parser.parse_args()

    with connect_esp(port=args.port, chip="esp32p4", before="default-reset") as esp:
        if esp.CHIP_NAME != "ESP32-P4":
            raise RuntimeError(f"expected ESP32-P4, got {esp.CHIP_NAME}")
        esp = run_stub(esp)
        esp.change_baud(2_000_000)
        attach_flash(esp)
        print("esptool: connection ready", flush=True)

        request = sys.stdin.readline()
        if not request:
            reset_chip(esp, "hard-reset")
            raise RuntimeError("app compilation failed before write")
        options = json.loads(request)
        offset = int(args.offset, 0)
        previous = options.get("previous")
        if previous:
            regions = _diff_flash_regions(
                Path(previous).read_bytes(),
                Path(options["image"]).read_bytes(),
                offset,
            )
            regions.sort(key=lambda region: region[0] == offset)
        else:
            regions = [(offset, options["image"])]
        for region in regions:
            write_flash(esp, [region], compress=True, diff_with=[])
        write_flash(
            esp,
            [(offset, options["image"])],
            compress=True,
            skip_flashed=True,
        )
        reset_chip(esp, "hard-reset")


if __name__ == "__main__":
    main()
