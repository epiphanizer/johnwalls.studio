#!/usr/bin/env bash
# ==============================================================================
# SEAN HALLS EMPIRE BUSINESS PLAN & PITCH DECK CLI GENERATOR
# ==============================================================================
# Taps live cross-repo telemetry across Studio PPO, ARTHA Quant, CGU Media,
# Namastay Hilo Sanctuary, and DashboardHC Equity.
#
# Usage:
#   ./scripts/generate-proposal.sh --type bank_sba_facility
#   ./scripts/generate-proposal.sh --type institutional_investor --amount 500000 --output ./pitch-deck.md
#   ./scripts/generate-proposal.sh --type custom_query --prompt "Pitch deck emphasizing our on-prem GPU cluster"
#   ./scripts/generate-proposal.sh --open
#
# Available Preset Types:
#   bank_sba_facility       : Commercial Bank & SBA 7(a) $500k Credit Facility Deck
#   institutional_investor  : Institutional Equity Memorandum ($5.76M–$8.64M Capitalized)
#   enterprise_client       : Enterprise Client SOW & Platform Pitch (Pay-Per-Outcome)
#   creative_media_film     : Bong Tour & Creative Media IP Memorandum
#   real_estate_sanctuary   : Namastay Hilo Mixed-Use Real Estate Sanctuary
#   custom_query            : Freeform LLM Multi-Modal Pitch Deck
# ==============================================================================

set -euo pipefail

HUB_PORT="${HUB_PORT:-3033}"
HUB_URL="http://127.0.0.1:${HUB_PORT}"

TYPE="bank_sba_facility"
AUDIENCE=""
AMOUNT=""
MULTIPLE=""
PROMPT=""
OUTPUT=""
OPEN_BROWSER=false

function show_help() {
  cat << 'EOF'
SEAN HALLS EMPIRE: PITCH DECK & BUSINESS PLAN GENERATOR

Options:
  --type <type>         Preset type:
                          bank_sba_facility (default)
                          institutional_investor
                          enterprise_client
                          creative_media_film
                          real_estate_sanctuary
                          custom_query
  --audience <text>     Target audience label (e.g. "Senior Bank Underwriter")
  --amount <number>     Requested capital / facility amount (e.g. 500000)
  --multiple <number>   Valuation multiple (default 12 for institutional)
  --prompt <string>     Custom query or instruction for AI synthesizer
  --output <path>       Save markdown pitch deck to specified file path
  --open                Open the interactive presentation deck in default browser
  --help, -h            Show this help dialog

Examples:
  ./scripts/generate-proposal.sh --type bank_sba_facility --open
  ./scripts/generate-proposal.sh --type institutional_investor --output ./institutional-deck.md
  ./scripts/generate-proposal.sh --type enterprise_client --amount 50000
  ./scripts/generate-proposal.sh --type custom_query --prompt "Highlight local GPU mesh and zero-token markup"
EOF
}

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)
      TYPE="$2"
      shift 2
      ;;
    --audience)
      AUDIENCE="$2"
      shift 2
      ;;
    --amount)
      AMOUNT="$2"
      shift 2
      ;;
    --multiple)
      MULTIPLE="$2"
      shift 2
      ;;
    --prompt)
      PROMPT="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --open)
      OPEN_BROWSER=true
      shift
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      show_help
      exit 1
      ;;
  esac
done

# If --open is specified without explicit generation, launch presentation viewer
if [ "$OPEN_BROWSER" = true ] && [ -z "$OUTPUT" ] && [ -z "$PROMPT" ] && [ -z "$AMOUNT" ]; then
  DECK_URL="${HUB_URL}/pitch-deck?type=${TYPE}"
  echo "⚡ Opening Sean Halls Empire Pitch Deck in browser: ${DECK_URL}"
  if command -v open >/dev/null 2>&1; then
    open "${DECK_URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${DECK_URL}"
  else
    echo "Please visit: ${DECK_URL}"
  fi
  exit 0
fi

echo "======================================================================"
echo "⚡ SEAN HALLS EMPIRE BUSINESS PLAN & PITCH DECK GENERATOR"
echo "======================================================================"
echo "Connecting to sh_hub at ${HUB_URL}..."

# Build JSON payload
PAYLOAD=$(python3 -c "
import json, sys

data = {'type': sys.argv[1]}
if sys.argv[2]: data['targetAudience'] = sys.argv[2]
if sys.argv[3]: data['requestedAmountUsd'] = float(sys.argv[3])
if sys.argv[4]: data['valuationMultiple'] = float(sys.argv[4])
if sys.argv[5]: data['customPrompt'] = sys.argv[5]

print(json.dumps(data))
" "$TYPE" "$AUDIENCE" "$AMOUNT" "$MULTIPLE" "$PROMPT")

# Make request to generator API
RESPONSE=$(curl -s -X POST "${HUB_URL}/proposals/generate" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Check status
OK=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")

if [ "$OK" != "True" ]; then
  echo "❌ Proposal synthesis failed:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

TITLE=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['deck']['title'])")
SLIDES_COUNT=$(echo "$RESPONSE" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']['deck']['slides']))")
AUDIENCE_LABEL=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['deck']['targetAudience'])")
MARKDOWN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['markdown'])")

echo "✅ Successfully Synthesized Pitch Deck!"
echo "   Title:           ${TITLE}"
echo "   Target Audience: ${AUDIENCE_LABEL}"
echo "   Slides:          ${SLIDES_COUNT} structured presentation slides"
echo "   Interactive URL: ${HUB_URL}/pitch-deck?type=${TYPE}"
echo ""

if [ -n "$OUTPUT" ]; then
  mkdir -p "$(dirname "$OUTPUT")"
  echo "$MARKDOWN" > "$OUTPUT"
  echo "📄 Exported Markdown Deck to: ${OUTPUT}"
else
  echo "--- Pitch Deck Markdown Preview (Top 25 Lines) ---"
  echo "$MARKDOWN" | head -n 25
  echo "..."
  echo "(Use --output <path> to save full markdown deck)"
fi

if [ "$OPEN_BROWSER" = true ]; then
  DECK_URL="${HUB_URL}/pitch-deck?type=${TYPE}"
  echo ""
  echo "⚡ Launching interactive full-screen slide deck: ${DECK_URL}"
  if command -v open >/dev/null 2>&1; then
    open "${DECK_URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${DECK_URL}"
  fi
fi
