#pragma once

#include <vector>
#include <cstddef>
#include <cmath>
#include <algorithm>
#include <span>

namespace johnwalls::johnwalls {

/**
 * Multi-channel audio buffer representation tailored for real-time processing
 * with main stereo I/O and dedicated auxiliary sidechain buses.
 */
class AudioBufferView {
public:
    AudioBufferView(float* const* channelData, size_t numChannels, size_t numSamples)
        : m_channels(channelData), m_numChannels(numChannels), m_numSamples(numSamples) {}

    [[nodiscard]] size_t getNumChannels() const noexcept { return m_numChannels; }
    [[nodiscard]] size_t getNumSamples() const noexcept { return m_numSamples; }

    [[nodiscard]] float* getChannelData(size_t channel) noexcept {
        return (channel < m_numChannels) ? m_channels[channel] : nullptr;
    }

    [[nodiscard]] const float* getChannelData(size_t channel) const noexcept {
        return (channel < m_numChannels) ? m_channels[channel] : nullptr;
    }

    [[nodiscard]] float getSample(size_t channel, size_t sampleIndex) const noexcept {
        if (channel < m_numChannels && sampleIndex < m_numSamples) {
            return m_channels[channel][sampleIndex];
        }
        return 0.0f;
    }

    void setSample(size_t channel, size_t sampleIndex, float value) noexcept {
        if (channel < m_numChannels && sampleIndex < m_numSamples) {
            m_channels[channel][sampleIndex] = value;
        }
    }

    void clear() noexcept {
        for (size_t ch = 0; ch < m_numChannels; ++ch) {
            if (m_channels[ch] != nullptr) {
                std::fill_n(m_channels[ch], m_numSamples, 0.0f);
            }
        }
    }

private:
    float* const* m_channels;
    size_t m_numChannels;
    size_t m_numSamples;
};

/**
 * Owned audio buffer for internal routing, delay buffers, and test fixtures.
 */
class OwnedAudioBuffer {
public:
    OwnedAudioBuffer(size_t numChannels, size_t numSamples)
        : m_numChannels(numChannels), m_numSamples(numSamples) {
        resize(numChannels, numSamples);
    }

    void resize(size_t numChannels, size_t numSamples) {
        m_numChannels = numChannels;
        m_numSamples = numSamples;
        m_data.assign(numChannels * numSamples, 0.0f);
        m_pointers.resize(numChannels);
        for (size_t ch = 0; ch < numChannels; ++ch) {
            m_pointers[ch] = m_data.data() + (ch * numSamples);
        }
    }

    [[nodiscard]] size_t getNumChannels() const noexcept { return m_numChannels; }
    [[nodiscard]] size_t getNumSamples() const noexcept { return m_numSamples; }

    [[nodiscard]] float* getChannelData(size_t channel) noexcept {
        return (channel < m_numChannels) ? m_pointers[channel] : nullptr;
    }

    [[nodiscard]] const float* getChannelData(size_t channel) const noexcept {
        return (channel < m_numChannels) ? m_pointers[channel] : nullptr;
    }

    [[nodiscard]] AudioBufferView getView() noexcept {
        return AudioBufferView(m_pointers.data(), m_numChannels, m_numSamples);
    }

    void clear() noexcept {
        std::fill(m_data.begin(), m_data.end(), 0.0f);
    }

private:
    size_t m_numChannels{0};
    size_t m_numSamples{0};
    std::vector<float> m_data;
    std::vector<float*> m_pointers;
};

} // namespace johnwalls::johnwalls
