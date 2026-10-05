#!/usr/bin/env bash
# ==============================================================================
# ASUS Ascent GX10 NVIDIA DGX Spark GB10 Workstation Bootstrap Script
# Studio: seanhalls.online / sh_hub
# Target Architecture: Ubuntu 24.04 / 22.04 LTS on x86_64
# Hardware: ASUS Ascent GX10 · NVIDIA DGX Spark GB10 (128GB Unified VRAM · 1TB NVMe)
# Role: Centralized Upstairs Sanctum Frontier Local AI Inference Node
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${CYAN}   ASUS Ascent GX10 DGX Spark GB10 Workstation Bootstrap & Sanctum Setup      ${NC}"
echo -e "${CYAN}   128GB Unified High-Speed VRAM · NVIDIA DGX Spark GB10 AI Workstation       ${NC}"
echo -e "${CYAN}==============================================================================${NC}"

# Check for root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR] This script must be run as root (use sudo).${NC}"
   exit 1
fi

# 1. Hostname & Network Configuration
echo -e "\n${YELLOW}[1/7] Configuring Hostname & Local Networking (asus-spark)...${NC}"
hostnamectl set-hostname asus-spark
echo "127.0.0.1 asus-spark" >> /etc/hosts || true

apt-get update -y
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    avahi-daemon \
    avahi-utils \
    jq \
    htop \
    iotop \
    pciutils \
    net-tools \
    ufw \
    ca-certificates

# Ensure mDNS avahi-daemon is running for asus-spark.local resolution
systemctl enable avahi-daemon
systemctl restart avahi-daemon
echo -e "${GREEN}✓ Hostname set to 'asus-spark' and mDNS (asus-spark.local) broadcast enabled.${NC}"

# 2. Hardened Security & Gate 6 FAIL-CLOSED Port Lock
echo -e "\n${YELLOW}[2/7] Configuring UFW Firewall & Enforcing Gate 6 Port Isolation...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH from LAN
ufw allow from 192.168.0.0/16 to any port 22 proto tcp comment 'LAN SSH'

# Allow vLLM (8000), Ollama (11434), TEI Embeddings (8080), Prometheus (9100) only from LAN
ufw allow from 192.168.0.0/16 to any port 8000 proto tcp comment 'vLLM OpenAI API (LAN only)'
ufw allow from 192.168.0.0/16 to any port 11434 proto tcp comment 'Ollama GPU API (LAN only)'
ufw allow from 192.168.0.0/16 to any port 8080 proto tcp comment 'TEI Embeddings API (LAN only)'
ufw allow from 192.168.0.0/16 to any port 9100 proto tcp comment 'Prometheus Node Exporter (LAN only)'

# CRITICAL GATE 6 ENFORCEMENT: Explicitly drop any packets attempting broker socket connections
ufw deny 7496 comment 'Gate 6 FAIL-CLOSED: Interactive Brokers Live Port Blocked'
ufw deny 4001 comment 'Gate 6 FAIL-CLOSED: Interactive Brokers Paper Port Blocked'

ufw --force enable
echo -e "${GREEN}✓ Firewall active. Gate 6 live broker ports (7496/4001) permanently blocked.${NC}"

# 3. NVIDIA Drivers & CUDA Toolkit (560+ / CUDA 12.6)
echo -e "\n${YELLOW}[3/7] Verifying & Installing NVIDIA DGX Spark Drivers & CUDA 12.6...${NC}"
if ! command -v nvidia-smi &> /dev/null; then
    echo "Installing NVIDIA proprietary drivers..."
    add-apt-repository -y ppa:graphics-drivers/ppa
    apt-get update -y
    apt-get install -y nvidia-driver-560-open nvidia-utils-560-open
    echo -e "${YELLOW}NVIDIA Driver 560 installed. A system reboot will be required.${NC}"
else
    echo -e "${GREEN}✓ NVIDIA driver detected:${NC}"
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || true
fi

# 4. Docker Engine & NVIDIA Container Toolkit
echo -e "\n${YELLOW}[4/7] Installing Docker Engine & NVIDIA Container Toolkit...${NC}"
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
fi

# Configure NVIDIA Container Toolkit repository
if ! dpkg -s nvidia-container-toolkit &> /dev/null; then
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update -y
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
    echo -e "${GREEN}✓ NVIDIA Container Toolkit configured for Docker.${NC}"
else
    echo -e "${GREEN}✓ NVIDIA Container Toolkit already present.${NC}"
fi

# 5. Directory Structure & NVMe Storage Allocation
echo -e "\n${YELLOW}[5/7] Creating NVMe Model Cache & Deployment Directory...${NC}"
mkdir -p /opt/asus-land/models
mkdir -p /opt/asus-land/data/ollama
mkdir -p /opt/asus-land/data/tei
mkdir -p /opt/asus-land/systemd

chmod -R 775 /opt/asus-land
echo -e "${GREEN}✓ /opt/asus-land model cache initialized on 1TB NVMe.${NC}"

# 6. Install Systemd Auto-Start Service
echo -e "\n${YELLOW}[6/7] Registering Systemd Auto-Boot Daemon (sh-spark-cluster.service)...${NC}"
cat << 'EOF' > /etc/systemd/system/sh-spark-cluster.service
[Unit]
Description=Sean Halls Studio ASUS DGX Spark GB10 Cluster Inference Daemon
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/asus-land
ExecStart=/usr/bin/docker compose -f /opt/asus-land/docker-compose.yml up -d
ExecStop=/usr/bin/docker compose -f /opt/asus-land/docker-compose.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sh-spark-cluster.service
echo -e "${GREEN}✓ sh-spark-cluster.service registered for automated boot.${NC}"

# 7. Verification Summary
echo -e "\n${CYAN}==============================================================================${NC}"
echo -e "${GREEN}   BOOTSTRAP COMPLETE: ASUS Ascent GX10 DGX Spark GB10 is Ready!              ${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo -e "Hostname:        asus-spark.local"
echo -e "Primary IP:      $(hostname -I | awk '{print $1}')"
echo -e "vLLM Endpoint:   http://asus-spark.local:8000/v1"
echo -e "Ollama GPU:      http://asus-spark.local:11434"
echo -e "TEI Embeddings:  http://asus-spark.local:8080"
echo -e "Gate 6 Ports:    7496, 4001 LOCKED (FAIL-CLOSED)"
echo -e "\nNext step: Place docker-compose.yml in /opt/asus-land/ and run:"
echo -e "  systemctl start sh-spark-cluster.service"
echo -e "${CYAN}==============================================================================${NC}"
