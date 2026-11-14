idf_component_register(
    SRCS "src/d1001_modem.c" "src/d1001_modem_at.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_common
    PRIV_REQUIRES freertos log espressif__usb_host_cdc_acm
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
