cmake_minimum_required(VERSION 3.22)

get_filename_component(d1001_root "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(pocketjs_components "${d1001_root}/third_party/pocketjs/platforms/esp-idf")
list(APPEND EXTRA_COMPONENT_DIRS
    "${pocketjs_components}/pocket_runtime"
    "${pocketjs_components}/pocket_guest_quickjs"
    "${pocketjs_components}/pocket_runner"
    "${pocketjs_components}/pocket_render_esp_ppa"
    "${pocketjs_components}/pocket_display_esp_dpi"
    "${d1001_root}/platforms/esp-idf/d1001_board")
if(NOT DEFINED POCKETJS_RUST_FROM_SOURCE)
    set(POCKETJS_RUST_FROM_SOURCE ON CACHE BOOL "")
endif()

set(POCKETJS_CLI "${d1001_root}/tools/pocket" CACHE FILEPATH "PocketJS CLI")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(pocketjs_reterminal_d1001)
