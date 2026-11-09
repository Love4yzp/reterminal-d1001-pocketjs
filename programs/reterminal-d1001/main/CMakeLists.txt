idf_component_register(
    SRCS "main.c" "packages.c" "inputs.c" "display_move.c" "worker_package.c"
    REQUIRES
        d1001_board
        esp_driver_dma
        esp_partition
        esp_driver_ppa
        esp_lcd
        esp_mm
        esp_timer
        pocket_d1001
        pocket_device
        pocket_display_esp_dpi
        pocket_fs_esp
        pocket_guest_quickjs
        pocket_hot_push_esp
        pocket_http_esp
        pocket_render_esp_ppa
        pocket_runner
        pocket_runtime
        pocket_wifi_esp
        pocket_worker_esp
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)

pocketjs_compile_app(
    TARGET ${COMPONENT_LIB}
    NAME app
    MANIFEST "../../../apps/worker-http/pocket.app.json"
    HOST_CONFIG "../pocket.host.config.ts")
