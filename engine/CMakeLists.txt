cmake_minimum_required(VERSION 3.20)
project(JohnwallsStudioEngine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Compiler flags
if (CMAKE_CXX_COMPILER_ID MATCHES "Clang|AppleClang|GNU")
    add_compile_options(-Wall -Wextra -Wpedantic -Wno-unused-parameter -O3)
endif()

# Core static library
add_library(johnwalls_engine STATIC
    src/feature_extractor.cpp
    src/dsp_nodes.cpp
    src/pedal_rack.cpp
    src/state_governor.cpp
    src/cli_grammar.cpp
)

target_include_directories(johnwalls_engine PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# Test executable
add_executable(johnwalls_tests
    tests/test_main.cpp
)

target_link_libraries(johnwalls_tests PRIVATE
    johnwalls_engine
)

# Standalone Mesa Boogie Mark Processor CLI
add_executable(mesa_processor
    src/mesa_processor_cli.cpp
)

target_link_libraries(mesa_processor PRIVATE
    johnwalls_engine
)

enable_testing()
add_test(NAME EngineUnitTests COMMAND johnwalls_tests)
