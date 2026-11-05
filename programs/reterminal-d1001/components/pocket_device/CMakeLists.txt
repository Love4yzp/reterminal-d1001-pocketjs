idf_component_register(
    SRCS "src/device.c"
    INCLUDE_DIRS "include"
    REQUIRES d1001_board pocket_guest_quickjs
    PRIV_REQUIRES freertos heap log
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
