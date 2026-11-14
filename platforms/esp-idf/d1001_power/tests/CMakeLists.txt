cmake_minimum_required(VERSION 3.16)
project(d1001_power_host_test C)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)
enable_testing()
add_executable(d1001_power_core_test
    d1001_power_core_test.c ../src/d1001_power_core.c)
target_include_directories(d1001_power_core_test PRIVATE ../include ../src)
target_compile_options(d1001_power_core_test PRIVATE -Wall -Wextra -Werror)
# Keep assertions enabled even for Release builds.
target_compile_options(d1001_power_core_test PRIVATE -UNDEBUG)
add_test(NAME d1001_power_core COMMAND d1001_power_core_test)
