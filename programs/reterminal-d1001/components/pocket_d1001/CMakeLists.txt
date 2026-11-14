idf_component_register(
    SRCS
        "src/d1001_panel.c"
        "src/rtc_pcf8563.c"
        "src/screen.c"
        "src/screen_geometry.c"
        "src/screen_state.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src"
    REQUIRES d1001_board espressif__quickjs-ng pocket_runtime
    PRIV_REQUIRES
        d1001_imu
        driver
        esp_app_format
        esp_netif
        esp_timer
        log
        pocket_wifi_esp
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
