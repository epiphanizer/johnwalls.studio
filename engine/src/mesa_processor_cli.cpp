#include <iostream>
#include <vector>
#include <fstream>
#include <cstring>
#include <cstdint>
#include <cmath>

#include "johnwalls/dsp_nodes.hpp"
#include "johnwalls/audio_buffer.hpp"

using namespace johnwalls::johnwalls;

// Lightweight standard 32-bit float or 16-bit WAV reader/writer
struct WavHeader {
    char riff[4];        // "RIFF"
    uint32_t fileSize;
    char wave[4];        // "WAVE"
    char fmt[4];         // "fmt "
    uint32_t fmtSize;
    uint16_t audioFormat; // 1 = PCM, 3 = IEEE Float
    uint16_t numChannels;
    uint32_t sampleRate;
    uint32_t byteRate;
    uint16_t blockAlign;
    uint16_t bitsPerSample;
    char data[4];        // "data"
    uint32_t dataSize;
};

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cerr << "Usage: " << argv[0] << " <input_wav> <output_wav> [drive=8.5] [eq_mid_scoop=-5.0]\n";
        return 1;
    }

    const char* inPath = argv[1];
    const char* outPath = argv[2];
    float leadDrive = (argc > 3) ? std::stof(argv[3]) : 8.8f;
    float eqMidScoop = (argc > 4) ? std::stof(argv[4]) : -5.0f;

    std::ifstream inFile(inPath, std::ios::binary);
    if (!inFile) {
        std::cerr << "Error: cannot open input file " << inPath << "\n";
        return 1;
    }

    // 12-byte RIFF header
    char riffHeader[12];
    inFile.read(riffHeader, 12);
    if (std::strncmp(riffHeader, "RIFF", 4) != 0 || std::strncmp(riffHeader + 8, "WAVE", 4) != 0) {
        std::cerr << "Error: Not a valid WAV file: " << inPath << "\n";
        return 1;
    }

    uint16_t audioFormat = 1;
    uint16_t numChannels = 2;
    uint32_t sampleRate = 48000;
    uint16_t bitsPerSample = 16;
    uint32_t dataSize = 0;
    bool foundData = false;

    char chunkId[4];
    uint32_t chunkSize = 0;
    while (inFile.read(chunkId, 4) && inFile.read(reinterpret_cast<char*>(&chunkSize), 4)) {
        if (std::strncmp(chunkId, "fmt ", 4) == 0) {
            inFile.read(reinterpret_cast<char*>(&audioFormat), 2);
            inFile.read(reinterpret_cast<char*>(&numChannels), 2);
            inFile.read(reinterpret_cast<char*>(&sampleRate), 4);
            uint32_t byteRate; inFile.read(reinterpret_cast<char*>(&byteRate), 4);
            uint16_t blockAlign; inFile.read(reinterpret_cast<char*>(&blockAlign), 2);
            inFile.read(reinterpret_cast<char*>(&bitsPerSample), 2);
            if (chunkSize > 16) {
                inFile.seekg(chunkSize - 16, std::ios::cur);
            }
        } else if (std::strncmp(chunkId, "data", 4) == 0) {
            dataSize = chunkSize;
            foundData = true;
            break;
        } else {
            // Skip other chunk (e.g. fact, JUNK, LIST)
            inFile.seekg(chunkSize, std::ios::cur);
        }
    }

    if (!foundData || dataSize == 0) {
        std::cerr << "Error: Could not find data chunk in: " << inPath << "\n";
        return 1;
    }

    size_t bytesPerSample = bitsPerSample / 8;
    size_t numSamples = dataSize / (numChannels * bytesPerSample);

    std::cout << "[MesaMarkProcessor] Reading: " << inPath << "\n";
    std::cout << "  Sample Rate: " << sampleRate << " Hz\n";
    std::cout << "  Channels: " << numChannels << "\n";
    std::cout << "  Bits: " << bitsPerSample << " (format " << audioFormat << ")\n";
    std::cout << "  Samples: " << numSamples << " (" << (float)numSamples / sampleRate << "s)\n";

    // Read all audio into float buffers
    std::vector<float> leftIn(numSamples, 0.0f);
    std::vector<float> rightIn(numSamples, 0.0f);

    std::vector<uint8_t> rawData(dataSize);
    inFile.read(reinterpret_cast<char*>(rawData.data()), dataSize);
    inFile.close();

    for (size_t i = 0; i < numSamples; ++i) {
        for (size_t ch = 0; ch < numChannels; ++ch) {
            size_t idx = (i * numChannels + ch) * bytesPerSample;
            float val = 0.0f;
            if (audioFormat == 3 && bitsPerSample == 32) {
                // 32-bit float
                float f;
                std::memcpy(&f, &rawData[idx], sizeof(float));
                val = f;
            } else if (audioFormat == 1 && bitsPerSample == 16) {
                int16_t s;
                std::memcpy(&s, &rawData[idx], sizeof(int16_t));
                val = (float)s / 32768.0f;
            } else if (audioFormat == 1 && bitsPerSample == 24) {
                int32_t s = (rawData[idx] | (rawData[idx + 1] << 8) | (rawData[idx + 2] << 16));
                if (s & 0x800000) s |= ~0xFFFFFF; // sign extend
                val = (float)s / 8388608.0f;
            }
            if (ch == 0) leftIn[i] = val;
            else if (ch == 1) rightIn[i] = val;
        }
        if (numChannels == 1) rightIn[i] = leftIn[i];
    }

    // Setup MesaMarkNode
    std::cout << "[MesaMarkProcessor] Initializing MesaMarkNode...\n";
    MesaMarkNode mesa("terry_mesa_lead");
    mesa.prepare(static_cast<double>(sampleRate), 1024);
    mesa.reset();

    // Terry Devine Signature Lead Parameters
    mesa.setParameter("channel", 2.0f);        // Searing Lead mode
    mesa.setParameter("gain", 8.2f);           // Volume 1 Drive
    mesa.setParameter("leadDrive", leadDrive); // Cascaded 12AX7 lead saturation
    mesa.setParameter("leadMaster", 6.8f);     // Output level
    mesa.setParameter("pullBright", 1.0f);     // High chime boost
    mesa.setParameter("bass", 4.0f);           // Tight low-end
    mesa.setParameter("pullDeep", 1.0f);       // Deep sub-cabinet punch
    mesa.setParameter("mid", 6.8f);            // Forward mid bite
    mesa.setParameter("treble", 7.4f);         // Cutting presence
    mesa.setParameter("presence", 6.8f);       // Power-amp negative feedback harmonic edge
    mesa.setParameter("simulClass", 1.0f);     // Simul-Class 85W tube power
    
    // Post-Gain 5-Band Graphic Equalizer (Iconic Mark Series V-Curve)
    mesa.setParameter("eqActive", 1.0f);
    mesa.setParameter("eq80", 3.8f);           // +3.8 dB low thump
    mesa.setParameter("eq240", 0.5f);          // +0.5 dB lower mid body
    mesa.setParameter("eq750", eqMidScoop);    // -5.0 dB vocal pocket scoop
    mesa.setParameter("eq2200", 4.2f);         // +4.2 dB singing lead cut
    mesa.setParameter("eq6600", 2.8f);         // +2.8 dB speaker sheen
    
    // Celestion Vintage 30 4x12 Cabinet Simulation
    mesa.setParameter("cabEnabled", 1.0f);

    // Setup TransparentSoftLimiter (-0.3 dBFS ceiling: ZERO clipping guaranteed)
    TransparentSoftLimiter limiter;
    limiter.prepare(static_cast<double>(sampleRate));
    limiter.reset();

    // Process in blocks
    const size_t blockSize = 512;
    std::vector<float> leftOut = leftIn;
    std::vector<float> rightOut = rightIn;

    float* chPtrs[2];
    for (size_t offset = 0; offset < numSamples; offset += blockSize) {
        size_t currentBlock = std::min(blockSize, numSamples - offset);
        chPtrs[0] = leftOut.data() + offset;
        chPtrs[1] = rightOut.data() + offset;

        AudioBufferView blockView(chPtrs, 2, currentBlock);
        
        // 1. Process through Mesa Boogie Mark Series Node
        mesa.process(blockView);

        // 2. Process through TransparentSoftLimiter
        limiter.process(blockView);
    }

    // Analyze output peak
    float maxPeak = 0.0f;
    for (size_t i = 0; i < numSamples; ++i) {
        maxPeak = std::max(maxPeak, std::abs(leftOut[i]));
        maxPeak = std::max(maxPeak, std::abs(rightOut[i]));
    }
    float peakDb = 20.0f * std::log10(maxPeak + 1e-9f);
    std::cout << "[MesaMarkProcessor] Processed complete!\n";
    std::cout << "  Output Max Peak: " << maxPeak << " (" << peakDb << " dBFS)\n";

    // Write output as 32-bit float stereo WAV
    std::ofstream outFile(outPath, std::ios::binary);
    if (!outFile) {
        std::cerr << "Error: cannot create output file " << outPath << "\n";
        return 1;
    }

    WavHeader outHeader;
    std::memcpy(outHeader.riff, "RIFF", 4);
    outHeader.fileSize = sizeof(WavHeader) - 8 + (numSamples * 2 * sizeof(float));
    std::memcpy(outHeader.wave, "WAVE", 4);
    std::memcpy(outHeader.fmt, "fmt ", 4);
    outHeader.fmtSize = 16;
    outHeader.audioFormat = 3; // IEEE Float
    outHeader.numChannels = 2; // Stereo
    outHeader.sampleRate = static_cast<uint32_t>(sampleRate);
    outHeader.bitsPerSample = 32;
    outHeader.byteRate = outHeader.sampleRate * outHeader.numChannels * (outHeader.bitsPerSample / 8);
    outHeader.blockAlign = outHeader.numChannels * (outHeader.bitsPerSample / 8);
    std::memcpy(outHeader.data, "data", 4);
    outHeader.dataSize = static_cast<uint32_t>(numSamples * 2 * sizeof(float));

    outFile.write(reinterpret_cast<const char*>(&outHeader), sizeof(WavHeader));
    for (size_t i = 0; i < numSamples; ++i) {
        outFile.write(reinterpret_cast<const char*>(&leftOut[i]), sizeof(float));
        outFile.write(reinterpret_cast<const char*>(&rightOut[i]), sizeof(float));
    }
    outFile.close();

    std::cout << "✓ Saved Mesa Boogie processed audio to: " << outPath << "\n";
    return 0;
}
