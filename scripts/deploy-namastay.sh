#!/usr/bin/env bash
# ==============================================================================
# Namastay Deployment Script: namastay.online & namastay.yoga
# Target Host: cgu (136.118.46.53)
# DocumentRoot: /var/www/namastay
# ==============================================================================
set -euo pipefail

REMOTE_HOST="${1:-cgu}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINDU_DIR="$(cd "${SOURCE_DIR}/.." && pwd)"
PROPERTIES_DIR="${BINDU_DIR}/properties"
PLACEHOLDER_HTML="${PROPERTIES_DIR}/namastay/index.html"
APACHE_CONF="${PROPERTIES_DIR}/seanhalls_online/deploy/apache/namastay.conf"

echo "========================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploying Namastay Placeholders"
echo "Remote Target: ${REMOTE_HOST} (136.118.46.53)"
echo "HTML Source:   ${PLACEHOLDER_HTML}"
echo "Apache Config: ${APACHE_CONF}"
echo "========================================================================"

if [ ! -f "${PLACEHOLDER_HTML}" ]; then
  echo "Error: ${PLACEHOLDER_HTML} does not exist!" >&2
  exit 1
fi

if [ ! -f "${APACHE_CONF}" ]; then
  echo "Error: ${APACHE_CONF} does not exist!" >&2
  exit 1
fi

echo "[1/5] Ensuring remote /var/www/namastay directory exists..."
ssh "${REMOTE_HOST}" "sudo mkdir -p /var/www/namastay && sudo chown -R seanhalls:seanhalls /var/www/namastay"

echo "[2/5] Syncing Namastay Atelier & Sanctuary files (index.html, sanctuary.html, css, js)..."
scp -rq "${PROPERTIES_DIR}/namastay/"* "${REMOTE_HOST}:/var/www/namastay/"
ssh "${REMOTE_HOST}" "sudo chmod -R 755 /var/www/namastay && sudo chown -R www-data:www-data /var/www/namastay"

echo "[3/5] Syncing Apache VirtualHost configuration..."
scp -q "${APACHE_CONF}" "${REMOTE_HOST}:/tmp/namastay.conf"
ssh "${REMOTE_HOST}" "sudo mv /tmp/namastay.conf /etc/apache2/sites-available/namastay.conf && sudo a2ensite namastay.conf >/dev/null 2>&1 || true"

echo "[4/5] Testing Apache configuration & reloading service..."
ssh "${REMOTE_HOST}" "sudo apache2ctl configtest && sudo systemctl reload apache2"

echo "[5/5] Checking local HTTP loopback response..."
STATUS=$(ssh "${REMOTE_HOST}" "curl -s -o /dev/null -w '%{http_code}' -H 'Host: namastay.online' http://127.0.0.1/" || echo "ERR")

if [ "${STATUS}" = "200" ]; then
  echo "✓ Namastay placeholder successfully serving HTTP 200 via Apache loopback!"
else
  echo "Warning: HTTP status code was ${STATUS} (expected 200)."
fi

echo "========================================================================"
echo "Deployment Complete!"
echo "Current DNS A Record Status:"
echo "  namastay.online -> $(dig +short namastay.online | head -n 1 || echo 'pending')"
echo "  namastay.yoga   -> $(dig +short namastay.yoga | head -n 1 || echo 'pending')"
echo ""
echo "NEXT STEPS TO GO FULLY LIVE ON SSL:"
echo "1. In your domain registrar (GoDaddy, Namecheap, etc.), update DNS:"
echo "   - namastay.online A record -> 136.118.46.53"
echo "   - www.namastay.online CNAME or A -> 136.118.46.53"
echo "   - namastay.yoga A record   -> 136.118.46.53"
echo "   - www.namastay.yoga CNAME or A -> 136.118.46.53"
echo ""
echo "2. Once DNS propagates to 136.118.46.53, issue SSL with one command:"
echo "   ssh cgu 'sudo certbot --apache -d namastay.online -d www.namastay.online -d namastay.yoga -d www.namastay.yoga'"
echo "========================================================================"
