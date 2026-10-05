cmake_minimum_required(VERSION 3.22)
project(johnwalls_studio_VST VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add JUCE submodule
add_subdirectory(JUCE)

set(ENGINE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../engine")
include_directories(
    "${ENGINE_DIR}/include"
    Source
)

juce_add_plugin(johnwalls_studio
    COMPANY_NAME "johnwalls.studio"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE JwSt
    PLUGIN_CODE JwSt
    FORMATS VST3 AU
    PRODUCT_NAME "johnwalls.studio"
)

target_sources(johnwalls_studio PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/LocalTelemetryServer.cpp
    Source/GlobalSessionHub.cpp
    Source/SuperColliderManager.cpp
    Source/ReactiveMidiEngine.cpp
    Source/SP404Engine.cpp
    "${ENGINE_DIR}/src/dsp_nodes.cpp"
    "${ENGINE_DIR}/src/pedal_rack.cpp"
    "${ENGINE_DIR}/src/feature_extractor.cpp"
    "${ENGINE_DIR}/src/cli_grammar.cpp"
)

target_compile_definitions(johnwalls_studio PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(johnwalls_studio PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags
)

# Optional test executables (not part of the plugin):
#   cmake -S vst -B vst/build -DJWS_BUILD_VST_TESTS=ON && cmake --build vst/build --target reactive_midi_test
#   reactive_midi_test            - reactive MIDI engine (no stuck notes, per-instance state, rule matching)
#   supercollider_live_test       - boots a REAL scsynth/sclang (requires SuperCollider.app) and checks OSC round-trips
option(JWS_BUILD_VST_TESTS "Build reactive MIDI + SuperCollider integration tests" OFF)
if(JWS_BUILD_VST_TESTS)
    juce_add_console_app(reactive_midi_test PRODUCT_NAME "reactive_midi_test")
    target_sources(reactive_midi_test PRIVATE
        tests/reactive_midi_test.cpp
        Source/ReactiveMidiEngine.cpp
        Source/SuperColliderManager.cpp
        Source/GlobalSessionHub.cpp)
    target_include_directories(reactive_midi_test PRIVATE Source)
    target_link_libraries(reactive_midi_test PRIVATE juce::juce_audio_processors juce::juce_audio_basics juce::juce_core)

    juce_add_console_app(supercollider_live_test PRODUCT_NAME "supercollider_live_test")
    target_sources(supercollider_live_test PRIVATE
        tests/supercollider_live_test.cpp
        Source/SuperColliderManager.cpp)
    target_include_directories(supercollider_live_test PRIVATE Source)
    target_link_libraries(supercollider_live_test PRIVATE juce::juce_core)
endif()
