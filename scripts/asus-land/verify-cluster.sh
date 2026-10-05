#!/usr/bin/env bash
# ==============================================================================
# ASUS Ascent GX10 Cluster Verification & Diagnostic Probe
# Runnable from: Apple Silicon Mac Studio (M-Series, 64GB) or local workstation
# Target: asus-spark.local (ASUS Ascent GX10 · 128GB Unified VRAM)
# ==============================================================================

set -euo pipefail

SPARK_HOST="${1:-asus-spark.local}"
VLLM_PORT="8000"
OLLAMA_PORT="11434"
TEI_PORT="8080"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${CYAN}   Probing ASUS Ascent GX10 DGX Spark GB10 Cluster Node (${SPARK_HOST})     ${NC}"
echo -e "${CYAN}==============================================================================${NC}"

# 1. ICMP Ping / Latency
echo -e "\n${YELLOW}[1/5] Checking LAN Ping & Round-Trip Latency...${NC}"
if ping -c 2 -W 1 "${SPARK_HOST}" &> /dev/null; then
    PING_TIME=$(ping -c 2 "${SPARK_HOST}" | tail -1 | awk -F '/' '{print $5}')
    echo -e "${GREEN}✓ Host ${SPARK_HOST} is online. Avg ping latency: ${PING_TIME} ms${NC}"
else
    echo -e "${RED}✗ Host ${SPARK_HOST} is offline or unreachable on LAN.${NC}"
    echo -e "  Tip: Ensure the ASUS machine is connected to the upstairs LAN/switch and avahi-daemon is running."
fi

# 2. Probe vLLM OpenAI Server (Port 8000)
echo -e "\n${YELLOW}[2/5] Probing vLLM OpenAI API (http://${SPARK_HOST}:${VLLM_PORT}/v1/models)...${NC}"
VLLM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://${SPARK_HOST}:${VLLM_PORT}/v1/models" || echo "000")
if [ "${VLLM_STATUS}" == "200" ]; then
    MODELS=$(curl -s "http://${SPARK_HOST}:${VLLM_PORT}/v1/models" | jq -r '.data[].id' 2>/dev/null || echo "Unknown")
    echo -e "${GREEN}✓ vLLM is ONLINE (HTTP 200). Active models:${NC}"
    echo "${MODELS}" | sed 's/^/    - /'
else
    echo -e "${YELLOW}○ vLLM endpoint not reachable (HTTP ${VLLM_STATUS}). Node may be offline or in deployment.${NC}"
fi

# 3. Probe Ollama GPU Server (Port 11434)
echo -e "\n${YELLOW}[3/5] Probing Ollama GPU Server (http://${SPARK_HOST}:${OLLAMA_PORT}/api/tags)...${NC}"
OLLAMA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://${SPARK_HOST}:${OLLAMA_PORT}/api/tags" || echo "000")
if [ "${OLLAMA_STATUS}" == "200" ]; then
    OLLAMA_MODELS=$(curl -s "http://${SPARK_HOST}:${OLLAMA_PORT}/api/tags" | jq -r '.models[].name' 2>/dev/null || echo "Unknown")
    echo -e "${GREEN}✓ Ollama GPU is ONLINE (HTTP 200). Loaded models:${NC}"
    echo "${OLLAMA_MODELS}" | sed 's/^/    - /'
else
    echo -e "${YELLOW}○ Ollama endpoint not reachable (HTTP ${OLLAMA_STATUS}).${NC}"
fi

# 4. Probe Text Embeddings Inference (Port 8080)
echo -e "\n${YELLOW}[4/5] Probing TEI Embeddings API (http://${SPARK_HOST}:${TEI_PORT}/health)...${NC}"
TEI_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://${SPARK_HOST}:${TEI_PORT}/health" || echo "000")
if [ "${TEI_STATUS}" == "200" ]; then
    echo -e "${GREEN}✓ TEI Semantic Vector Engine is ONLINE (HTTP 200).${NC}"
else
    echo -e "${YELLOW}○ TEI endpoint not reachable (HTTP ${TEI_STATUS}).${NC}"
fi

# 5. Security & Gate 6 FAIL-CLOSED Port Assertion
echo -e "\n${YELLOW}[5/5] Asserting Gate 6 Network Isolation (Ports 7496, 4001)...${NC}"
GATE6_FAIL=0
if nc -z -w 1 "${SPARK_HOST}" 7496 2>/dev/null; then
    echo -e "${RED}[SECURITY VIOLATION] Port 7496 (Live Broker) is OPEN on ${SPARK_HOST}!${NC}"
    GATE6_FAIL=1
fi
if nc -z -w 1 "${SPARK_HOST}" 4001 2>/dev/null; then
    echo -e "${RED}[SECURITY VIOLATION] Port 4001 (Paper Broker) is OPEN on ${SPARK_HOST}!${NC}"
    GATE6_FAIL=1
fi

if [ "${GATE6_FAIL}" -eq 0 ]; then
    echo -e "${GREEN}✓ Gate 6 FAIL-CLOSED confirmed: Zero open broker ports on ${SPARK_HOST}.${NC}"
fi

echo -e "\n${CYAN}==============================================================================${NC}"
echo -e "${CYAN}   Diagnostic probe complete.                                                 ${NC}"
echo -e "${CYAN}==============================================================================${NC}"
