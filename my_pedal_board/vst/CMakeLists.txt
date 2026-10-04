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
