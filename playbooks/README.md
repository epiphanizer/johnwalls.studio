# Studio Operations & Engineering Playbooks

**Repository**: `seanhalls.online` / `sh_hub`  
**Location**: `/Users/seanhalls/Desktop/sh/playbooks`  

This directory contains operational playbooks and engineering runbooks for the Sean Halls studio infrastructure, client workloads, cloud deployment topologies, and agentic compute distribution.

---

## Playbook Registry

| Playbook | Identifier | Scope / Primary Target | Key Protocols & Responsibilities |
| :--- | :--- | :--- | :--- |
| [**Compute Distribution & Automated Coding**](automated-coding-compute-distribution.md) | `PLAYBOOK-COMPUTE-OPS-2026-01` | Multi-tier AI compute & development workflows | Tri-tier model routing: Gemini/Antigravity Ultra (1M+ context for everyday dev & cross-repo sync), Clinepass/Claude (surgical adversarial audits for SEC 15c3-5, Gate 6, HIPAA, Crypto), and Local Mac Studio + GX10 bare metal (Tokonawaki quant lab, DuckDB, 193 pytest + 118 vitest). |
| [**Cloud Server Operations & Deployment**](cgu-cloud-server.md) | `PLAYBOOK-INFRA-CGU-01` | `sh-online-clients` (`cgu` / `136.118.46.53`) | Apache 2.4 reverse proxy, Let's Encrypt SSL, PM2 process management for Next.js (`cgu_master`), Appreesh, Sean Halls Online, Christian Englander, and OCC / WordPress. |
| [**Infrastructure Isolation Roadmap**](infrastructure-isolation-roadmap.md) | `INFRA-ROADMAP-2026-01` | Dual-Zone Container Migration | Hardened Studio Bastion (Zero third-party code) vs. Isolated Client Container Grid (Traefik + Docker cgroups for OCC / third-party PHP). |
| [**Namastay Deployment & Operations**](deploy-namastay-placeholders.md) | `PLAYBOOK-NAMASTAY-01` | `namastay.online` / `namastay.yoga` | Single-command deployment (`./scripts/deploy-namastay.sh`), Apache vhost configuration, and animated particle canvas sanctuary setup. |

---

## Cross-Repo Integration

- **Orchestration & Operations**: [`../sh_hub`](../sh_hub) (Local-first SQLite control plane `.hub-data/sh-hub.sqlite`)
- **Shared Marketing & Link Hub**: [`../cgu_master`](../cgu_master) (Next.js 16, Firestore content layer)
- **Public Portfolio & Intake**: [`../seanhalls_online`](../seanhalls_online) (Brand frontend & mirrored CRM)
- **Client Workloads**: [`../clients`](../clients) (`followup_master`, `ramone_master`, `namastay`, `cluck`, etc.)
- **Quant Lab**: [`/Users/seanhalls/Desktop/quant/tokonawaki`](/Users/seanhalls/Desktop/quant/tokonawaki) (DuckDB warehouse, Nautilus Trader, Gate 6 lock)
