# Ported from pocket-m5 pocket_system; the shared PocketJS sources stay pinned
# and are compiled without modification.
set(shared "${CMAKE_CURRENT_LIST_DIR}/../../../third_party/pocketjs/engine/host-services")

idf_component_register(
    SRCS
        "src/d1001_fs.c"
        "src/d1001_qjs.c"
        "${shared}/fs.c"
        "${shared}/jscan.c"
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "src" "${shared}"
    REQUIRES quickjs-ng
    PRIV_REQUIRES fatfs freertos log spi_flash vfs wear_levelling
    REQUIRED_IDF_TARGETS esp32p4
)

target_compile_options(${COMPONENT_LIB} PRIVATE -Wall -Wextra -Werror)
