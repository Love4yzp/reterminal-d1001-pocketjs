# D1001 PocketJS filesystem

ESP32-P4 component for the PocketJS `data.fs` contract. It mounts the existing
`storage` FAT partition at `/pocket` with wear levelling, binds the selected
slot's `apps/<slot>/data` tree with staging in `apps/<slot>/fs-tmp`, and installs
the nine standard `globalThis.fs` functions.

Call `d1001_fs_init(slot)` from `app_main` on its internal RAM stack, then
`d1001_fs_install(realm)` on the QuickJS guest task. Every mount, bind, unbind,
and filesystem operation runs synchronously on the component's internal-RAM
stack task. `d1001_fs_teardown()` unbinds the guest but leaves FAT mounted for a
later slot. A slot id is 16 lowercase hexadecimal characters.

The bind quota is 0 (unmetered), rather than the shared engine's 4 MiB default,
so it does not prescribe a budget larger than the D1001's 0x3f0000-byte storage
partition. Physical partition capacity still applies.

Mount failures are returned to the caller. `format_if_mount_failed` is false:
enabling it for routine recovery can erase existing data when a mount fails.
It is suitable only for deliberate first-time provisioning after verifying that
the partition is empty and disposable.

The shared `fs.c` and `jscan.c` are compiled unchanged from the pinned
`third_party/pocketjs` submodule. The FAT mount, internal-stack dispatch, and
QuickJS binding are ported from pocket-m5 commit
`aa8a0ca3ad4bc2aca737af128310c1269902c4cf`, paths
`programs/m5stack-tab5/components/pocket_system/src/services_host.c` and
`programs/m5stack-tab5/components/pocket_system/src/qjs.c`.
