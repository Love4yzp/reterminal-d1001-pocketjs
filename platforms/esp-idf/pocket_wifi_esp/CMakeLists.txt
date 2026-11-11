idf_component_register(
    SRCS "src/d1001_wifi.c" "src/wifi_stability.c"
    INCLUDE_DIRS "include"
    REQUIRES espressif__quickjs-ng
    PRIV_REQUIRES
        esp_event
        esp_netif
        espressif__esp_hosted
        espressif__esp_wifi_remote
        esp_timer
        freertos
        heap
        log
        nvs_flash
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
