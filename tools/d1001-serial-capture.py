#!/usr/bin/env python3
import argparse
import serial
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--port", default="/dev/ttyACM0")
parser.add_argument("--seconds", type=float, required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--reset", action="store_true")
args = parser.parse_args()
if args.seconds < 30:
    parser.error("--seconds must be at least 30")

with serial.Serial(args.port, 115200, timeout=0.2) as port:
    if args.reset:
        port.setDTR(False)
        port.setRTS(True)
        time.sleep(0.1)
        port.setRTS(False)
    deadline = time.monotonic() + args.seconds
    with open(args.output, "wb") as output:
        while time.monotonic() < deadline:
            data = port.read(4096)
            if data:
                output.write(data)
                output.flush()
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
