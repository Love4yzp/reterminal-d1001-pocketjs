#!/usr/bin/env python3
"""Build pure-C regressions in /tmp; never configure or build ESP-IDF."""

from pathlib import Path
import os
import subprocess

component = Path(__file__).resolve().parent.parent
output = Path('/tmp/d1001-modem-host-test')
output.mkdir(parents=True, exist_ok=True)
stubs = output / 'include'
# These forwards expose deterministic task-context fakes only to the host test.
for name in ('esp_err.h', 'esp_log.h', 'freertos/FreeRTOS.h',
             'freertos/event_groups.h', 'freertos/semphr.h',
             'freertos/stream_buffer.h', 'freertos/task.h',
             'usb/cdc_acm_host.h', 'usb/usb_host.h'):
    header = stubs / name
    header.parent.mkdir(parents=True, exist_ok=True)
    header.write_text('#include "modem_host_fakes.h"\n')

# Exercise the actual vendored function, not a reimplementation of its logic.
source = (component / 'vendor/usb_host_cdc_acm/cdc_acm_host.c').read_text()
start = source.index('esp_err_t cdc_acm_host_uninstall()')
end = source.index('esp_err_t cdc_acm_host_register_new_dev_callback', start)
(output / 'cdc_uninstall_under_test.h').write_text(source[start:end])

flags = [os.environ.get('CC', 'cc'), '-std=c11', '-Wall', '-Wextra', '-Werror',
         '-pedantic', '-fsanitize=address,undefined', '-fno-omit-frame-pointer',
         '-fno-pie', '-no-pie',
         '-I' + str(component / 'include'), '-I' + str(component / 'tests'),
         '-I' + str(stubs), '-I' + str(output)]
for name, sources in (
    ('d1001_modem_at_test', ['src/d1001_modem_at.c', 'tests/d1001_modem_at_test.c']),
    ('d1001_modem_lifecycle_test', ['src/d1001_modem_at.c',
                                   'tests/d1001_modem_lifecycle_test.c']),
    ('d1001_modem_cdc_cleanup_test', ['tests/d1001_modem_cdc_cleanup_test.c']),
):
    binary = output / name
    subprocess.run(flags + [str(component / src) for src in sources] +
                   ['-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
