#include "pedalboard/pedal_rack.hpp"
#include <algorithm>

namespace johnwalls::pedalboard {

PedalRack::PedalRack() = default;

void PedalRack::prepare(double sampleRate, size_t maxBlockSize) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    m_sampleRate = sampleRate;
    m_maxBlockSize = maxBlockSize;
    for (auto& node : m_nodes) {
        node->prepare(sampleRate, maxBlockSize);
    }
}

void PedalRack::reset() {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    for (auto& node : m_nodes) {
        node->reset();
    }
}

bool PedalRack::addNode(std::unique_ptr<DSPNode> node) {
    if (!node) return false;
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    // Check ID collision
    for (const auto& existing : m_nodes) {
        if (existing->getId() == node->getId()) {
            return false;
        }
    }
    node->prepare(m_sampleRate, m_maxBlockSize);
    m_nodes.push_back(std::move(node));
    updateCachedNodes();
    return true;
}

bool PedalRack::addPedalByType(const std::string& type, const std::string& id) {
    std::unique_ptr<DSPNode> node;
    if (type == "delay" || type == "tape") {
        node = std::make_unique<TapeDelayNode>(id);
    } else if (type == "filter" || type == "ladder") {
        node = std::make_unique<LadderFilterNode>(id);
    } else if (type == "drive" || type == "overdrive") {
        node = std::make_unique<OverdriveNode>(id);
    } else if (type == "ducker" || type == "duck") {
        node = std::make_unique<ReactiveDuckerNode>(id);
    } else if (type == "mesa" || type == "mesa_mark" || type == "mark3" || type == "mark_iii") {
        node = std::make_unique<MesaMarkNode>(id);
    } else if (type == "vox" || type == "vox_ac30" || type == "ac30") {
        node = std::make_unique<VoxAC30Node>(id);
    } else {
        return false;
    }
    return addNode(std::move(node));
}

bool PedalRack::removeNode(const std::string& id) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    auto it = std::remove_if(m_nodes.begin(), m_nodes.end(),
        [&id](const std::unique_ptr<DSPNode>& node) {
            return node->getId() == id;
        });
    if (it != m_nodes.end()) {
        m_nodes.erase(it, m_nodes.end());
        updateCachedNodes();
        return true;
    }
    return false;
}

bool PedalRack::moveNode(size_t fromIndex, size_t toIndex) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    if (fromIndex >= m_nodes.size() || toIndex >= m_nodes.size()) {
        return false;
    }
    if (fromIndex == toIndex) return true;

    auto node = std::move(m_nodes[fromIndex]);
    m_nodes.erase(m_nodes.begin() + static_cast<long>(fromIndex));
    m_nodes.insert(m_nodes.begin() + static_cast<long>(toIndex), std::move(node));
    updateCachedNodes();
    return true;
}

void PedalRack::clear() {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    m_nodes.clear();
    updateCachedNodes();
}

DSPNode* PedalRack::getNode(const std::string& id) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    for (auto& node : m_nodes) {
        if (node->getId() == id) return node.get();
    }
    return nullptr;
}

const DSPNode* PedalRack::getNode(const std::string& id) const {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    for (const auto& node : m_nodes) {
        if (node->getId() == id) return node.get();
    }
    return nullptr;
}

size_t PedalRack::getNumNodes() const {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    return m_nodes.size();
}

std::vector<PedalInfo> PedalRack::getRackInfo() const {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    std::vector<PedalInfo> result;
    result.reserve(m_nodes.size());
    for (const auto& node : m_nodes) {
        PedalInfo info;
        info.id = node->getId();
        info.type = node->getType();
        info.bypassed = node->isBypassed();
        for (const auto& pName : node->getParameterNames()) {
            info.parameters.emplace_back(pName, node->getParameter(pName));
        }
        result.push_back(std::move(info));
    }
    return result;
}

bool PedalRack::setParameter(const std::string& nodeId, const std::string& paramName, float value) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    for (auto& node : m_nodes) {
        if (node->getId() == nodeId) {
            return node->setParameter(paramName, value);
        }
    }
    return false;
}

std::optional<float> PedalRack::getParameter(const std::string& nodeId, const std::string& paramName) const {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    for (const auto& node : m_nodes) {
        if (node->getId() == nodeId) {
            return node->getParameter(paramName);
        }
    }
    return std::nullopt;
}

bool PedalRack::setBypassed(const std::string& nodeId, bool bypassed) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    for (auto& node : m_nodes) {
        if (node->getId() == nodeId) {
            node->setBypassed(bypassed);
            return true;
        }
    }
    return false;
}

void PedalRack::setInspectedNode(std::string id) {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    m_inspectedNodeId = std::move(id);
}

std::string PedalRack::getInspectedNode() const {
    std::lock_guard<std::recursive_mutex> lock(m_rackMutex);
    return m_inspectedNodeId;
}

void PedalRack::getInspectedWaveform(std::array<float, 512>& dest) const {
    const size_t readIdx = m_activeWaveformIndex.load(std::memory_order_acquire);
    dest = m_waveformBuffers[readIdx];
}

void PedalRack::process(AudioBufferView& buffer) {
    std::unique_lock<std::recursive_mutex> lock(m_rackMutex, std::try_to_lock);
    if (!lock.owns_lock()) {
        // Wait-free: if rack structure is momentarily modified on GUI thread,
        // pass through cleanly without stalling audio thread or causing glitches
        return;
    }
    processWithLock(buffer, lock);
}

void PedalRack::processWithLock(AudioBufferView& buffer, std::unique_lock<std::recursive_mutex>& lock) {
    if (!lock.owns_lock()) {
        return;
    }

    const size_t numSamples = buffer.getNumSamples();
    const size_t copyCount = std::min<size_t>(numSamples, 512);
    const size_t writeIdx = 1 - m_activeWaveformIndex.load(std::memory_order_relaxed);

    for (auto& node : m_nodes) {
        if (!node->isBypassed()) {
            node->process(buffer);

            // If this node is being solo'd/inspected, capture its real output!
            if (!m_inspectedNodeId.empty() && node->getId() == m_inspectedNodeId) {
                const float* data = buffer.getChannelData(0);
                for (size_t s = 0; s < copyCount; ++s) {
                    m_waveformBuffers[writeIdx][s] = data[s];
                }
            }
        }
    }

    // If master is inspected or no specific node, capture final output
    if (m_inspectedNodeId.empty() || m_inspectedNodeId == "master") {
        const float* data = buffer.getChannelData(0);
        for (size_t s = 0; s < copyCount; ++s) {
            m_waveformBuffers[writeIdx][s] = data[s];
        }
    }

    m_activeWaveformIndex.store(writeIdx, std::memory_order_release);
}

void PedalRack::updateCachedNodes() noexcept {
    m_cachedMesa = nullptr;
    m_cachedVox = nullptr;
    m_cachedDelay = nullptr;
    m_cachedFilter = nullptr;
    m_cachedDucker = nullptr;

    for (const auto& node : m_nodes) {
        if (!node) continue;
        const auto type = node->getType();
        const auto id = node->getId();
        if (type == "mesa" || id == "mesa_mark3") m_cachedMesa = node.get();
        else if (type == "vox" || id == "vox_ac30") m_cachedVox = node.get();
        else if (type == "delay" || id == "dub_echo") m_cachedDelay = node.get();
        else if (type == "filter" || id == "resonant_filter") m_cachedFilter = node.get();
        else if (type == "ducker" || id == "sidechain_ducker") m_cachedDucker = dynamic_cast<ReactiveDuckerNode*>(node.get());
    }
}

} // namespace johnwalls::pedalboard
