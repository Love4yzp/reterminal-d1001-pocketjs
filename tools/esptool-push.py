import argparse
import json
import sys

from esptool.cmds import attach_flash, connect_esp, reset_chip, run_stub, write_flash


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
        diff_with = [options["previous"]] if options.get("previous") else []
        write_flash(
            esp,
            [(int(args.offset, 0), options["image"])],
            compress=True,
            diff_with=diff_with,
        )
        reset_chip(esp, "hard-reset")


if __name__ == "__main__":
    main()
