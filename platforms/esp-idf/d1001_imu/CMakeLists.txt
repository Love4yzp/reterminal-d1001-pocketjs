idf_component_register(
    SRCS
        "src/d1001_imu.c"
        "src/d1001_imu_core.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src"
    REQUIRES esp_driver_i2c
    PRIV_REQUIRES esp_driver_gpio
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
