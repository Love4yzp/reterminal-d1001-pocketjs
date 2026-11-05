idf_component_register(
    SRCS "src/d1001_hot_push.c"
    INCLUDE_DIRS "include"
    REQUIRES pocket_runtime
    PRIV_REQUIRES
        esp_http_server
        esp_partition
        heap
        log
        pocket_wifi_esp
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
