idf_component_register(
    SRCS "src/d1001_camera.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_video esp_cam_sensor esp_driver_i2c
    PRIV_REQUIRES esp_driver_cam esp_driver_isp esp_mm esp_timer log freertos
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
