idf_component_register(
    SRCS "src/d1001_camera.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_video esp_cam_sensor esp_driver_i2c
    PRIV_REQUIRES esp_driver_cam esp_driver_isp esp_mm esp_timer log freertos
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)

# IDF 6.2 unregisters a failed close's fd. Retry esp_video's retained reference
# through the pinned 2.6.0 internal API rather than closing a recycled fd.
idf_component_get_property(d1001_camera_video_dir espressif__esp_video COMPONENT_DIR)
target_include_directories(${COMPONENT_LIB} PRIVATE
    "${d1001_camera_video_dir}/private_include")
