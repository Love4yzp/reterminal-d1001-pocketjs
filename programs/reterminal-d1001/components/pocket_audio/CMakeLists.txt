idf_component_register(
    SRCS "src/pocket_audio.c" "src/pocket_audio_args.c" "src/pocket_audio_core.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src"
    REQUIRES d1001_audio pocket_guest_quickjs
    PRIV_REQUIRES freertos heap log
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
