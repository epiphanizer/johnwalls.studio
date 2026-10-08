#pragma once

#include "johnwalls/audio_buffer.hpp"
#include "johnwalls/dsp_nodes.hpp"
#include <vector>
#include <memory>
#include <string>
#include <optional>
#include <mutex>

namespace johnwalls::johnwalls {

struct PedalInfo {
    std::string id;
    std::string type;
    bool bypassed{false};
    std::vector<std::pair<std::string, float>> parameters;
};

/**
 * Modular audio graph & johnwalls rack.
 * Maintains an ordered sequence of DSP stompboxes, processes audio in-place,
 * and allows hot-swapping and dynamic node creation.
 */
class PedalRack {
public:
    PedalRack();
    ~PedalRack() = default;

    void prepare(double sampleRate, size_t maxBlockSize);
    void reset();

    // Node management
    bool addNode(std::unique_ptr<DSPNode> node);
    bool addPedalByType(const std::string& type, const std::string& id);
    bool removeNode(const std::string& id);
    bool moveNode(size_t fromIndex, size_t toIndex);
    void clear();

    // Node inspection
    [[nodiscard]] DSPNode* getNode(const std::string& id);
    [[nodiscard]] const DSPNode* getNode(const std::string& id) const;
    [[nodiscard]] size_t getNumNodes() const;
    [[nodiscard]] std::vector<PedalInfo> getRackInfo() const;

    // Node inspection & waveform capture
    void setInspectedNode(std::string id);
    [[nodiscard]] std::string getInspectedNode() const;
    void getInspectedWaveform(std::array<float, 512>& dest) const;

    // Parameter access
    bool setParameter(const std::string& nodeId, const std::string& paramName, float value);
    std::optional<float> getParameter(const std::string& nodeId, const std::string& paramName) const;
    bool setBypassed(const std::string& nodeId, bool bypassed);

    // Audio processing
    [[nodiscard]] std::unique_lock<std::recursive_mutex> tryLock() const {
        return std::unique_lock<std::recursive_mutex>(m_rackMutex, std::try_to_lock);
    }
    [[nodiscard]] std::unique_lock<std::recursive_mutex> lock() const {
        return std::unique_lock<std::recursive_mutex>(m_rackMutex);
    }
    void process(AudioBufferView& buffer);
    void processWithLock(AudioBufferView& buffer, std::unique_lock<std::recursive_mutex>& lock);

    // Cached quick access for high-performance audio thread dispatch (valid while holding tryLock)
    [[nodiscard]] DSPNode* getCachedMesa() const noexcept { return m_cachedMesa; }
    [[nodiscard]] DSPNode* getCachedVox() const noexcept { return m_cachedVox; }
    [[nodiscard]] DSPNode* getCachedDelay() const noexcept { return m_cachedDelay; }
    [[nodiscard]] DSPNode* getCachedFilter() const noexcept { return m_cachedFilter; }
    [[nodiscard]] ReactiveDuckerNode* getCachedDucker() const noexcept { return m_cachedDucker; }

    // Master Gain Staging & Soft Limiter Controls
    void setMasterTrimDb(float db) noexcept {
        float clamped = std::clamp(db, -24.0f, 12.0f);
        m_masterTrimDb.store(clamped, std::memory_order_relaxed);
        m_masterTrimLinear.store(std::pow(10.0f, clamped / 20.0f), std::memory_order_relaxed);
    }
    [[nodiscard]] float getMasterTrimDb() const noexcept {
        return m_masterTrimDb.load(std::memory_order_relaxed);
    }
    [[nodiscard]] float getMasterTrimLinear() const noexcept {
        return m_masterTrimLinear.load(std::memory_order_relaxed);
    }

    void setLimiterEnabled(bool enabled) noexcept { m_masterLimiter.setEnabled(enabled); }
    [[nodiscard]] bool isLimiterEnabled() const noexcept { return m_masterLimiter.isEnabled(); }

    void setLimiterCeilingDb(float db) noexcept { m_masterLimiter.setCeilingDb(db); }
    [[nodiscard]] float getLimiterCeilingDb() const noexcept { return m_masterLimiter.getCeilingDb(); }

    [[nodiscard]] float getLimiterReductionDb() const noexcept { return m_masterLimiter.getMaxReductionDb(); }

private:
    void updateCachedNodes() noexcept;

    double m_sampleRate{44100.0};
    size_t m_maxBlockSize{512};

    mutable std::recursive_mutex m_rackMutex;
    std::vector<std::unique_ptr<DSPNode>> m_nodes;
    std::string m_inspectedNodeId{"master"};

    // Master output soft limiter and trim
    TransparentSoftLimiter m_masterLimiter{-0.3f};
    std::atomic<float> m_masterTrimDb{0.0f};
    std::atomic<float> m_masterTrimLinear{1.0f};

    // Lock-free double-buffered waveform capture
    mutable std::array<std::array<float, 512>, 2> m_waveformBuffers{};
    mutable std::atomic<size_t> m_activeWaveformIndex{0};

    // Cached node pointers for zero-overhead audio thread dispatch
    DSPNode* m_cachedMesa{nullptr};
    DSPNode* m_cachedVox{nullptr};
    DSPNode* m_cachedDelay{nullptr};
    DSPNode* m_cachedFilter{nullptr};
    ReactiveDuckerNode* m_cachedDucker{nullptr};
};

} // namespace johnwalls::johnwalls
