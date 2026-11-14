idf_component_register(
    SRCS "src/d1001_power.c" "src/d1001_power_core.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src"
    REQUIRES esp_common
    PRIV_REQUIRES esp_adc esp_driver_gpio esp_libc freertos
    REQUIRED_IDF_TARGETS esp32p4
)
target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
