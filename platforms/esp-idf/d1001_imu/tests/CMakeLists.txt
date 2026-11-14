cmake_minimum_required(VERSION 3.16)
project(d1001_imu_host_tests C)

enable_testing()

add_executable(d1001_imu_core_test
    ../src/d1001_imu_core.c
    d1001_imu_core_test.c
)
target_include_directories(d1001_imu_core_test PRIVATE ../include ../src)
target_compile_features(d1001_imu_core_test PRIVATE c_std_11)
target_compile_options(d1001_imu_core_test PRIVATE -Wall -Wextra -Werror)
target_link_libraries(d1001_imu_core_test PRIVATE m)

add_test(NAME d1001_imu_core COMMAND d1001_imu_core_test)
