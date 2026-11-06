idf_component_register(
    SRCS
        "src/d1001_panel.c"
        "src/imu_lsm6ds3.c"
        "src/rtc_pcf8563.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src"
    REQUIRES d1001_board espressif__quickjs-ng
    PRIV_REQUIRES
        driver
        esp_netif
        esp_timer
        log
        pocket_wifi_esp
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
