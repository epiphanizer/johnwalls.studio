#!/usr/bin/env bash
# ==============================================================================
# Prism Web Presence Deployment Script
# Domains: prismwebpresence.com & prismwp.com
# Target Host: cgu (136.118.46.53)
# DocumentRoot: /var/www/prism
# Registered Utah DBA of Sean Halls
# ==============================================================================
set -euo pipefail

REMOTE_HOST="${1:-cgu}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINDU_DIR="$(cd "${SOURCE_DIR}/.." && pwd)"
PROPERTIES_DIR="${BINDU_DIR}/properties"
PRISM_DIR="${PROPERTIES_DIR}/prism"
APACHE_CONF="${PROPERTIES_DIR}/seanhalls_online/deploy/apache/prism.conf"

echo "========================================================================"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploying Prism Web Presence (Utah DBA)"
echo "Remote Target: ${REMOTE_HOST} (136.118.46.53)"
echo "Source Dir:    ${PRISM_DIR}"
echo "Apache Config: ${APACHE_CONF}"
echo "========================================================================"

if [ ! -d "${PRISM_DIR}" ]; then
  echo "Error: Directory ${PRISM_DIR} does not exist!" >&2
  exit 1
fi

if [ ! -f "${PRISM_DIR}/index.html" ]; then
  echo "Error: ${PRISM_DIR}/index.html does not exist!" >&2
  exit 1
fi

if [ ! -f "${APACHE_CONF}" ]; then
  echo "Error: ${APACHE_CONF} does not exist!" >&2
  exit 1
fi

echo "[1/5] Ensuring remote /var/www/prism directory exists on ${REMOTE_HOST}..."
ssh "${REMOTE_HOST}" "sudo mkdir -p /var/www/prism && sudo chown -R seanhalls:seanhalls /var/www/prism"

echo "[2/5] Syncing Prism Web Presence HTML and assets..."
rsync -avz --delete "${PRISM_DIR}/" "${REMOTE_HOST}:/var/www/prism/"
ssh "${REMOTE_HOST}" "sudo chmod -R 755 /var/www/prism && sudo chown -R www-data:www-data /var/www/prism"

echo "[3/5] Syncing Apache VirtualHost configuration..."
scp -q "${APACHE_CONF}" "${REMOTE_HOST}:/tmp/prism.conf"
ssh "${REMOTE_HOST}" "sudo mv /tmp/prism.conf /etc/apache2/sites-available/prism.conf && sudo a2ensite prism.conf >/dev/null 2>&1 || true"

echo "[4/5] Testing Apache configuration & reloading service..."
ssh "${REMOTE_HOST}" "sudo apache2ctl configtest && sudo systemctl reload apache2"

echo "[5/5] Checking local HTTP loopback responses on server..."
STATUS_FULL=$(ssh "${REMOTE_HOST}" "curl -s -o /dev/null -w '%{http_code}' -H 'Host: prismwebpresence.com' http://127.0.0.1/" || echo "ERR")
STATUS_SHORT=$(ssh "${REMOTE_HOST}" "curl -s -o /dev/null -w '%{http_code}' -H 'Host: prismwp.com' http://127.0.0.1/" || echo "ERR")

if [ "${STATUS_FULL}" = "200" ] && [ "${STATUS_SHORT}" = "200" ]; then
  echo "✓ Prism Web Presence successfully serving HTTP 200 via Apache for both domains!"
else
  echo "Notice: Status codes -> prismwebpresence.com: ${STATUS_FULL}, prismwp.com: ${STATUS_SHORT}"
fi

echo "========================================================================"
echo "Deployment Complete!"
echo "Current DNS A Record Status:"
echo "  prismwebpresence.com -> $(dig +short prismwebpresence.com | head -n 1 || echo 'pending')"
echo "  prismwp.com          -> $(dig +short prismwp.com | head -n 1 || echo 'pending')"
echo ""
echo "NEXT STEPS TO GO FULLY LIVE ON SSL:"
echo "1. In Google Domains / Cloud DNS for prismwebpresence.com and prismwp.com:"
echo "   - Create A Record: '@' -> 136.118.46.53"
echo "   - Create CNAME Record: 'www' -> prismwebpresence.com (or A Record to 136.118.46.53)"
echo "2. Once DNS resolves, SSH to server and run Certbot:"
echo "   ssh cgu 'sudo certbot --apache -d prismwebpresence.com -d www.prismwebpresence.com -d prismwp.com -d www.prismwp.com'"
echo "========================================================================"
