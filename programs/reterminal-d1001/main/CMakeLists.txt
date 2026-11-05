idf_component_register(
    SRCS "main.c"
    REQUIRES
        d1001_board
        esp_driver_dma
        esp_driver_ppa
        esp_lcd
        esp_mm
        esp_timer
        pocket_display_esp_dpi
        pocket_guest_quickjs
        pocket_render_esp_ppa
        pocket_runner
        pocket_runtime
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)

pocketjs_compile_app(
    TARGET ${COMPONENT_LIB}
    NAME app
    MANIFEST "../../../apps/hello-d1001/pocket.app.json"
    HOST_CONFIG "../pocket.host.config.ts")
