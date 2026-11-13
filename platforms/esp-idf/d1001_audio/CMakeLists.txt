idf_component_register(
    SRCS "src/d1001_audio.c"
    INCLUDE_DIRS "include"
    REQUIRES d1001_board esp_driver_i2s
    PRIV_REQUIRES driver log freertos
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
