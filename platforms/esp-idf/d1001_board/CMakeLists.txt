idf_component_register(
    SRCS
        "src/d1001_board.c"
        "src/gsl3670.c"
        "src/gsl3670_point_id.c"
        "src/jd9365.c"
        "src/pca9535.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src"
    REQUIRES driver esp_hw_support esp_lcd espressif__esp_lcd_touch
    PRIV_REQUIRES esp_driver_ledc esp_timer freertos log
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
