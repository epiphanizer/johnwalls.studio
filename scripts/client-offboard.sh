#!/usr/bin/env bash
# ==============================================================================
# Client Offboarding & Technical Sanitization Automation
# Studio: seanhalls.online
# Purpose: Automate database dumping, secret purging, repo detachment,
#          manifest generation, and de-provisioning runbooks.
# ==============================================================================

set -euo pipefail

# --- Color formatting ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- Defaults ---
CLIENT_SLUG=""
REPO_PATH=""
OUTPUT_DIR=""
DB_NAME=""
DB_USER="root"
DB_HOST="127.0.0.1"
DB_PORT="3306"
REMOTE_HOST=""
SKIP_DB=false
CLEARED=false
DRY_RUN=false
FORCE=false
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Helper: Portable SHA256 ---
compute_sha256() {
  local target_file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target_file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$target_file" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$target_file" | awk '{print $NF}'
  else
    echo "NO_SHA256_TOOL_FOUND"
  fi
}

# --- Helper: Usage ---
usage() {
  echo -e "${BOLD}seanhalls.online — Client Offboarding & Sanitization Tool${NC}

${BOLD}USAGE:${NC}
  $(basename "$0") --client <slug> [OPTIONS]

${BOLD}REQUIRED ARGUMENTS:${NC}
  -c, --client <slug>       Client identifier / folder slug (e.g. occ, england, tbm, cluck, namastay)

${BOLD}OPTIONS:${NC}
  -r, --repo <path>         Path to client repository (default: ./clients/<slug> or ./clients/<slug>_master)
  -o, --output-dir <path>   Destination directory for offboarding bundle (default: ./dist/offboarding/<slug>_<timestamp>)
      --db-name <name>      Database name to dump (e.g. sh_online_clients, career_local)
      --db-user <user>      Database user (default: root)
      --db-host <host>      Database host (default: 127.0.0.1)
      --db-port <port>      Database port (default: 3306)
      --remote-host <host>  SSH host alias if running database dump remotely (e.g. cgu)
      --skip-db             Skip database dumping (for static sites or headless frontends)
      --cleared             Affirm that all client invoices and the \$2,500 Offboarding Fee are paid in full
  -n, --dry-run             Simulate steps without writing archives or modifying files
  -f, --force               Bypass interactive confirmation prompts
  -h, --help                Show this documentation

${BOLD}EXAMPLES:${NC}
  # Standard offboarding for OCC (WordPress/MariaDB on remote host cgu):
  ./scripts/client-offboard.sh --client occ --repo ./clients/ramone_master/occ --db-name sh_online_clients --remote-host cgu --cleared

  # Offboarding for Christian Englander (Node/Express, no DB):
  ./scripts/client-offboard.sh --client england --repo ./clients/neff_master --skip-db --cleared

  # Dry run test:
  ./scripts/client-offboard.sh --client test --repo ./clients/namastay --skip-db --dry-run"
  exit 0
}

# --- Parse CLI Arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--client)
      CLIENT_SLUG="$2"
      shift 2
      ;;
    -r|--repo)
      REPO_PATH="$2"
      shift 2
      ;;
    -o|--output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --db-name)
      DB_NAME="$2"
      shift 2
      ;;
    --db-user)
      DB_USER="$2"
      shift 2
      ;;
    --db-host)
      DB_HOST="$2"
      shift 2
      ;;
    --db-port)
      DB_PORT="$2"
      shift 2
      ;;
    --remote-host)
      REMOTE_HOST="$2"
      shift 2
      ;;
    --skip-db)
      SKIP_DB=true
      shift
      ;;
    --cleared)
      CLEARED=true
      shift
      ;;
    -n|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -f|--force)
      FORCE=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo -e "${RED}Error: Unknown argument: $1${NC}"
      usage
      ;;
  esac
done

# --- Validate Required Inputs ---
if [[ -z "$CLIENT_SLUG" ]]; then
  echo -e "${RED}Error: Client slug is required (--client <slug>).${NC}"
  exit 1
fi

# Detect repository path if omitted
if [[ -z "$REPO_PATH" ]]; then
  if [[ -d "${BASE_DIR}/clients/${CLIENT_SLUG}" ]]; then
    REPO_PATH="${BASE_DIR}/clients/${CLIENT_SLUG}"
  elif [[ -d "${BASE_DIR}/clients/${CLIENT_SLUG}_master" ]]; then
    REPO_PATH="${BASE_DIR}/clients/${CLIENT_SLUG}_master"
  elif [[ -d "${BASE_DIR}/clients/${CLIENT_SLUG}_master/${CLIENT_SLUG}" ]]; then
    REPO_PATH="${BASE_DIR}/clients/${CLIENT_SLUG}_master/${CLIENT_SLUG}"
  else
    echo -e "${RED}Error: Could not automatically locate client repository. Please specify --repo <path>.${NC}"
    exit 1
  fi
fi

# Resolve absolute repo path
REPO_PATH="$(cd "$REPO_PATH" && pwd)"

# Output Directory
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="${BASE_DIR}/dist/offboarding/${CLIENT_SLUG}_${TIMESTAMP}"
fi

# --- Billing & Legal Clearance Guard ---
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD}${CYAN}   seanhalls.online — Client Offboarding & Technical Sanitizer   ${NC}"
echo -e "${CYAN}================================================================${NC}"
echo -e "Client Identifier : ${BOLD}${CLIENT_SLUG}${NC}"
echo -e "Repository Source : ${REPO_PATH}"
echo -e "Target Output     : ${OUTPUT_DIR}"
echo -e "Database Export   : $(if [[ "$SKIP_DB" == "true" ]]; then echo "SKIPPED"; else echo "${DB_NAME:-'(None specified)'} via ${REMOTE_HOST:-'local'}"; fi)"
echo -e "Dry Run Mode      : $(if [[ "$DRY_RUN" == "true" ]]; then echo -e "${YELLOW}YES (Simulated)${NC}"; else echo "NO (Live Execution)"; fi)"
echo -e "Timestamp         : ${TIMESTAMP}"
echo -e "----------------------------------------------------------------"

if [[ "$CLEARED" != "true" && "$DRY_RUN" != "true" ]]; then
  echo -e "${RED}${BOLD}[LEGAL & FINANCIAL CLEARANCE CHECK]${NC}"
  echo -e "According to the seanhalls.online Terms of Service (Section 5.3) and the"
  echo -e "Client Offboarding Addendum (Section 2.1), source code and databases remain"
  echo -e "under Studio Lien until all outstanding invoices and the \$2,500 Offboarding Fee"
  echo -e "are paid in full (cleared funds)."
  echo ""
  if [[ "$FORCE" == "true" ]]; then
    echo -e "${YELLOW}Bypassing clearance prompt due to --force flag.${NC}"
  else
    read -r -p "Has Client paid all outstanding balances and the \$2,500 Offboarding Fee? [y/N]: " CONFIRM_CLEARANCE
    if [[ "$CONFIRM_CLEARANCE" != "y" && "$CONFIRM_CLEARANCE" != "Y" ]]; then
      echo -e "${RED}ABORTING: Financial clearance not affirmed. IP and archives remain locked.${NC}"
      exit 1
    fi
  fi
fi

# --- Dry Run Notice ---
if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}${BOLD}DRY RUN ACTIVATED: No archives will be generated. Scanning and validation only.${NC}"
fi

# --- Create Bundle Directory Structure ---
STAGING_DIR="${OUTPUT_DIR}/staging"
REPO_EXPORT_DIR="${STAGING_DIR}/source_code"
DB_EXPORT_DIR="${OUTPUT_DIR}/database"
DOCS_EXPORT_DIR="${OUTPUT_DIR}/documentation"

if [[ "$DRY_RUN" != "true" ]]; then
  mkdir -p "$STAGING_DIR" "$REPO_EXPORT_DIR" "$DB_EXPORT_DIR" "$DOCS_EXPORT_DIR"
fi

# ==============================================================================
# 1. DATABASE EXTRACTION
# ==============================================================================
DB_ARCHIVE_FILE=""
DB_CHECKSUM=""
DB_SIZE_BYTES=0

if [[ "$SKIP_DB" == "true" ]]; then
  echo -e "\n${BLUE}[1/5] Database Extraction: SKIPPED (--skip-db)${NC}"
else
  echo -e "\n${BLUE}[1/5] Database Extraction...${NC}"
  if [[ -z "$DB_NAME" ]]; then
    echo -e "${YELLOW}Warning: No database name provided (--db-name). Skipping database dump.${NC}"
  else
    DB_ARCHIVE_FILE="${DB_EXPORT_DIR}/${CLIENT_SLUG}_db_${DB_NAME}_${TIMESTAMP}.sql.gz"
    if [[ "$DRY_RUN" == "true" ]]; then
      echo -e "${YELLOW}[DRY-RUN] Would dump database '${DB_NAME}' from ${REMOTE_HOST:-'localhost'} -> ${DB_ARCHIVE_FILE}${NC}"
      DB_CHECKSUM="DRY_RUN_CHECKSUM"
    else
      if [[ -n "$REMOTE_HOST" ]]; then
        echo -e "  Executing remote dump on ${BOLD}${REMOTE_HOST}${NC} for database: ${BOLD}${DB_NAME}${NC}..."
        ssh "$REMOTE_HOST" "sudo mysqldump --single-transaction --quick --skip-lock-tables --routines --triggers '${DB_NAME}' | gzip -9" > "$DB_ARCHIVE_FILE"
      else
        echo -e "  Executing local mysqldump for database: ${BOLD}${DB_NAME}${NC}..."
        mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --single-transaction --quick --skip-lock-tables --routines --triggers "$DB_NAME" | gzip -9 > "$DB_ARCHIVE_FILE"
      fi

      if [[ -f "$DB_ARCHIVE_FILE" && -s "$DB_ARCHIVE_FILE" ]]; then
        DB_CHECKSUM="$(compute_sha256 "$DB_ARCHIVE_FILE")"
        DB_SIZE_BYTES="$(wc -c < "$DB_ARCHIVE_FILE" | tr -d ' ')"
        echo -e "  ${GREEN}✓ Database dump successful:${NC} $(basename "$DB_ARCHIVE_FILE")"
        echo -e "    Size   : $(numfmt --to=iec-i --suffix=B "$DB_SIZE_BYTES" 2>/dev/null || echo "${DB_SIZE_BYTES} bytes")"
        echo -e "    SHA256 : ${DB_CHECKSUM}"
      else
        echo -e "${RED}Error: Database dump file was not generated or is empty.${NC}"
        exit 1
      fi
    fi
  fi
fi

# ==============================================================================
# 2. SOURCE CODE SANITIZATION & LEAK SCANNING
# ==============================================================================
echo -e "\n${BLUE}[2/5] Scanning Repository for Secrets & Studio Credentials...${NC}"

# Define patterns to inspect
SENSITIVE_PATTERNS=(
  "BEGIN OPENSSH PRIVATE KEY"
  "BEGIN RSA PRIVATE KEY"
  "AIzaSy"
  "sk_live_"
  "ghp_"
  "gho_"
  "glpat-"
  "xoxb-"
  "AKIA[0-9A-Z]{16}"
  "epiphanizer"
  "sean_halls"
  "136.118.46.53"
  "sh-online-clients"
)

LEAK_FOUND=false
SCAN_LOG="${OUTPUT_DIR}/secret_scan_audit.log"
if [[ "$DRY_RUN" != "true" ]]; then
  touch "$SCAN_LOG"
fi

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  MATCHES="$(grep -rnE "$pattern" "$REPO_PATH" \
    --exclude-dir={.git,node_modules,vendor,dist,build,staging,.cache,.next} \
    --exclude="*.log" --exclude="*.gz" --exclude="*.zip" 2>/dev/null || true)"
  if [[ -n "$MATCHES" ]]; then
    LEAK_FOUND=true
    echo -e "  ${RED}⚠ WARNING: Sensitive pattern matched [${pattern}]${NC}"
    echo "$MATCHES" | head -n 5 | sed 's/^/    /'
    if [[ "$DRY_RUN" != "true" ]]; then
      echo "=== MATCH FOR PATTERN: $pattern ===" >> "$SCAN_LOG"
      echo "$MATCHES" >> "$SCAN_LOG"
      echo "" >> "$SCAN_LOG"
    fi
  fi
done

if [[ "$LEAK_FOUND" == "false" ]]; then
  echo -e "  ${GREEN}✓ No high-entropy secrets or private studio signatures detected in tracked files.${NC}"
else
  echo -e "  ${YELLOW}Notice: Sensitive strings identified. Live .env files and private keys will be excluded from the archive.${NC}"
fi

# ==============================================================================
# 3. REPOSITORY DETACHMENT & PACKAGING
# ==============================================================================
echo -e "\n${BLUE}[3/5] Sanitizing Codebase & Detaching Remotes...${NC}"

REPO_ARCHIVE_FILE="${OUTPUT_DIR}/${CLIENT_SLUG}_clean_repo_${TIMESTAMP}.tar.gz"
REPO_CHECKSUM=""
REPO_SIZE_BYTES=0

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}[DRY-RUN] Would stage repo from ${REPO_PATH}, purge studio remotes, and create ${REPO_ARCHIVE_FILE}${NC}"
  REPO_CHECKSUM="DRY_RUN_CHECKSUM"
else
  # Copy repository excluding untracked artifacts, cache, and actual live secret files
  echo -e "  Staging clean codebase..."
  rsync -a \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='vendor' \
    --exclude='.next' \
    --exclude='build' \
    --exclude='dist' \
    --exclude='.DS_Store' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='.env.production' \
    --exclude='*.pem' \
    --exclude='*.key' \
    "$REPO_PATH/" "$REPO_EXPORT_DIR/"

  # Create a sanitized .env.example / .env.client-template if an actual .env existed
  if [[ -f "${REPO_PATH}/.env" || -f "${REPO_PATH}/.env.example" ]]; then
    TARGET_ENV="${REPO_PATH}/.env"
    [[ ! -f "$TARGET_ENV" ]] && TARGET_ENV="${REPO_PATH}/.env.example"
    
    echo -e "  Generating sanitized .env.client-template..."
    sed -E 's/=(.*)$/=<CLIENT_SUPPLIED_VALUE>/g' "$TARGET_ENV" > "${REPO_EXPORT_DIR}/.env.client-template"
  fi

  # Initialize fresh standalone git repo without Studio commit history or remotes
  echo -e "  Initializing fresh standalone git repository for client..."
  (
    cd "$REPO_EXPORT_DIR"
    git init -q
    git branch -M main
    
    # Ensure robust .gitignore exists
    cat <<'GITIGNORE' > .gitignore
# Production dependencies
node_modules/
vendor/

# Environment and secrets
.env
.env.local
.env.*.local
*.pem
*.key

# Build output
dist/
build/
.next/
out/

# System files
.DS_Store
Thumbs.db
*.log
GITIGNORE

    git add .
    git commit -q -m "Initial clean repository transfer by seanhalls.online ($TIMESTAMP)"
  )

  # Compress the sanitized repository
  echo -e "  Compressing clean repository archive..."
  tar -czf "$REPO_ARCHIVE_FILE" -C "$STAGING_DIR" source_code
  
  REPO_CHECKSUM="$(compute_sha256 "$REPO_ARCHIVE_FILE")"
  REPO_SIZE_BYTES="$(wc -c < "$REPO_ARCHIVE_FILE" | tr -d ' ')"
  
  # Remove staging folder
  rm -rf "$STAGING_DIR"

  echo -e "  ${GREEN}✓ Clean repository package generated:${NC} $(basename "$REPO_ARCHIVE_FILE")"
  echo -e "    Size   : $(numfmt --to=iec-i --suffix=B "$REPO_SIZE_BYTES" 2>/dev/null || echo "${REPO_SIZE_BYTES} bytes")"
  echo -e "    SHA256 : ${REPO_CHECKSUM}"
fi

# ==============================================================================
# 4. MANIFEST & DOCUMENTATION GENERATION
# ==============================================================================
echo -e "\n${BLUE}[4/5] Generating Manifest & Offboarding Summary...${NC}"

MANIFEST_FILE="${OUTPUT_DIR}/MANIFEST.json"
SUMMARY_FILE="${OUTPUT_DIR}/OFFBOARDING_SUMMARY.md"
DEPROVISION_FILE="${OUTPUT_DIR}/deprovision_studio_server.sh"

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}[DRY-RUN] Would generate MANIFEST.json, OFFBOARDING_SUMMARY.md, and deprovision_studio_server.sh${NC}"
else
  # 4A. JSON Manifest
  cat <<EOF > "$MANIFEST_FILE"
{
  "studio": "seanhalls.online",
  "client_slug": "${CLIENT_SLUG}",
  "timestamp": "${TIMESTAMP}",
  "generated_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "operator": "$(whoami)",
  "financial_clearance_confirmed": ${CLEARED},
  "artifacts": [
    {
      "type": "source_code_repository",
      "filename": "$(basename "$REPO_ARCHIVE_FILE")",
      "sha256": "${REPO_CHECKSUM}",
      "size_bytes": ${REPO_SIZE_BYTES}
    }$(if [[ -n "$DB_ARCHIVE_FILE" && -f "$DB_ARCHIVE_FILE" ]]; then echo ",
    {
      \"type\": \"database_dump\",
      \"database_name\": \"${DB_NAME}\",
      \"filename\": \"$(basename "$DB_ARCHIVE_FILE")\",
      \"sha256\": \"${DB_CHECKSUM}\",
      \"size_bytes\": ${DB_SIZE_BYTES}
    }"; fi)
  ],
  "governing_agreements": [
    "STUDIO_TERMS_OF_SERVICE.md",
    "CLIENT_OFFBOARDING_ADDENDUM.md"
  ]
}
EOF

  # 4B. Human-Readable Offboarding Summary
  cat <<EOF > "$SUMMARY_FILE"
# Technical Offboarding & Handoff Summary

**Client**: \`${CLIENT_SLUG}\`  
**Issuing Studio**: **seanhalls.online**  
**Handoff Date**: $(date +'%B %d, %Y')  
**Package Identifier**: \`${CLIENT_SLUG}_${TIMESTAMP}\`  

---

## 1. Cryptographic Package Verification

To verify the integrity of the offboarding package files, run the following verification commands:

\`\`\`bash
# Verify Clean Source Code Archive
shasum -a 256 $(basename "$REPO_ARCHIVE_FILE")
# Expected Hash: ${REPO_CHECKSUM}
$(if [[ -n "$DB_ARCHIVE_FILE" && -f "$DB_ARCHIVE_FILE" ]]; then cat <<DBVERIFY
# Verify Database Dump
shasum -a 256 database/$(basename "$DB_ARCHIVE_FILE")
# Expected Hash: ${DB_CHECKSUM}
DBVERIFY
fi)
\`\`\`

---

## 2. Source Code Restoration Instructions

1. Extract the clean source code archive:
   \`\`\`bash
   tar -xzf $(basename "$REPO_ARCHIVE_FILE")
   cd source_code
   \`\`\`
2. Configure environment variables:
   - Copy \`.env.client-template\` to \`.env\`.
   - Populate all required API keys, database credentials, and production secrets.
3. Install dependencies:
   - For Node.js projects: \`npm install\` or \`pnpm install\`
   - For PHP projects: \`composer install --no-dev\`
4. Push to your private organization:
   \`\`\`bash
   git remote add origin git@github.com:YOUR_ORGANIZATION/${CLIENT_SLUG}.git
   git push -u origin main
   \`\`\`

---

## 3. Database Restoration Instructions

$(if [[ -n "$DB_ARCHIVE_FILE" && -f "$DB_ARCHIVE_FILE" ]]; then cat <<DBRESTORE
To import the compressed database archive into your MySQL/MariaDB server:

\`\`\`bash
# Create the target database (if not already created)
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Decompress and import
gunzip < database/$(basename "$DB_ARCHIVE_FILE") | mysql -u root -p \`${DB_NAME}\`
\`\`\`
DBRESTORE
else echo "No database was exported for this project (static site, headless app, or skipped)."; fi)

---

## 4. Post-Handoff Checklist & Security Obligations

- [ ] **Rotate All Secrets**: Rotate Stripe API keys, transactional email tokens, database passwords, and third-party webhooks immediately.
- [ ] **Update DNS**: Update your domain registrar's \`A\` or \`CNAME\` records to point to your new hosting infrastructure.
- [ ] **Sign Confirmation of Receipt**: Sign and return Schedule A of the [CLIENT_OFFBOARDING_ADDENDUM.md](file:///Users/seanhalls/Desktop/sh/CLIENT_OFFBOARDING_ADDENDUM.md).
- [ ] **Hosting De-commissioning**: Studio hosting and process units will terminate in accordance with Section 5 of the Addendum. Backups are expunged permanently after 14 calendar days.

---
*Generated automatically by seanhalls.online Technical Transition System.*
EOF

  # 4C. De-provisioning Script for Studio Operator
  cat <<'EOF' > "$DEPROVISION_FILE"
#!/usr/bin/env bash
# ==============================================================================
# Studio Server De-provisioning Runbook for Client: CLIENT_SLUG_PLACEHOLDER
# Run this on the studio server (cgu / 136.118.46.53) AFTER client confirms handoff.
# ==============================================================================
set -euo pipefail

echo "Executing de-provisioning for CLIENT_SLUG_PLACEHOLDER on studio infrastructure..."

# 1. Disable Apache VirtualHost (if applicable)
# sudo a2dissite CLIENT_SLUG_PLACEHOLDER.conf || true
# sudo systemctl reload apache2

# 2. Stop and disable systemd or PM2 process (if applicable)
# sudo systemctl stop CLIENT_SLUG_PLACEHOLDER.service || true
# sudo systemctl disable CLIENT_SLUG_PLACEHOLDER.service || true
# sudo -u sean_halls pm2 delete CLIENT_SLUG_PLACEHOLDER || true

# 3. Archive web root to cold storage before purging
# sudo tar -czf /home/seanhalls/cold_archives/CLIENT_SLUG_PLACEHOLDER_$(date +%Y%m%d).tar.gz /var/www/CLIENT_SLUG_PLACEHOLDER || true

# 4. Remove database user privileges (if applicable)
# sudo mysql -e "REVOKE ALL PRIVILEGES ON \`DB_NAME_PLACEHOLDER\`.* FROM 'DB_USER_PLACEHOLDER'@'localhost'; DROP USER IF EXISTS 'DB_USER_PLACEHOLDER'@'localhost';"

echo "De-provisioning script completed. Remember to purge cold archive after 14 days."
EOF
  sed -i.bak "s/CLIENT_SLUG_PLACEHOLDER/${CLIENT_SLUG}/g" "$DEPROVISION_FILE"
  sed -i.bak "s/DB_NAME_PLACEHOLDER/${DB_NAME:-'none'}/g" "$DEPROVISION_FILE"
  rm -f "${DEPROVISION_FILE}.bak"
  chmod +x "$DEPROVISION_FILE"

  echo -e "  ${GREEN}✓ Manifest and transition documentation generated successfully.${NC}"
fi

# ==============================================================================
# 5. COMPLETION & SUMMARY
# ==============================================================================
echo -e "\n${BLUE}[5/5] Offboarding Package Summary${NC}"
echo -e "================================================================"
echo -e "${GREEN}${BOLD}OFFBOARDING BUNDLE READY${NC}"
echo -e "Output Directory : ${BOLD}${OUTPUT_DIR}${NC}"
if [[ "$DRY_RUN" != "true" ]]; then
  echo -e "Contents:"
  ls -lh "$OUTPUT_DIR" | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}'
fi
echo -e "================================================================"
echo -e "Next steps:"
echo -e "1. Deliver ${BOLD}${SUMMARY_FILE}${NC} and archives to Client technical lead."
echo -e "2. Have Client sign Schedule A in ${BOLD}CLIENT_OFFBOARDING_ADDENDUM.md${NC}."
echo -e "3. Execute ${BOLD}${DEPROVISION_FILE}${NC} once DNS cutover completes."
echo -e "================================================================"
exit 0
