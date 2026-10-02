# Namastay Deployment & Operations Playbook

## Brand & Sanctuary Vision: `namastay.online` & `namastay.yoga`

- **Brand**: **Namastay**
- **Domains**:
  - `namastay.online` (Digital Studio, On-Demand Streaming & Community)
  - `namastay.yoga` (In-Person Practice, Sanctuary & Visiting Residencies)
- **Primary Physical Prospect**: Mixed Residential / Commercial Property near **Downtown Hilo, Hawaiʻi**
- **Founder / Anchor**: **Sean Halls** — Certified Yoga Instructor Track (in progress)
- **Target Host**: `cgu` (`136.118.46.53`)
- **Web Root on Host**: `/var/www/namastay`
- **Apache VirtualHost**: `/etc/apache2/sites-available/namastay.conf`
- **Visual Design**: Animated, calming "Dot Calligraphy" fluid particle canvas (Ensō Zen Circle, Lemniscate Infinity, and Ocean Flow breathing modes) with clean typography, mobile responsiveness, and inquiry channel (`aloha@namastay.online`).

---

## 1. Quick Fast-Path Deployment

From your local machine (`/Users/seanhalls/Desktop/sh`):

```bash
# Deploy placeholder HTML, sync Apache vhost, and verify loopback in one step:
./scripts/deploy-namastay.sh
```

---

## 2. DNS Configuration Guide

In your domain registrar DNS management (e.g. GoDaddy, Namecheap, Cloudflare, or Google Domains):

| Domain / Host | Record Type | Target Value / IP | TTL |
| :--- | :--- | :--- | :--- |
| `namastay.online` (@) | **A** | `136.118.46.53` | 300 / Auto |
| `www.namastay.online` | **A** or **CNAME** | `136.118.46.53` (or `namastay.online`) | 300 / Auto |
| `namastay.yoga` (@) | **A** | `136.118.46.53` | 300 / Auto |
| `www.namastay.yoga` | **A** or **CNAME** | `136.118.46.53` (or `namastay.yoga`) | 300 / Auto |

To verify DNS propagation from your terminal:

```bash
dig +short namastay.online
dig +short namastay.yoga
```

Once either returns `136.118.46.53`, the Apache vhost is already listening and will serve the animated screen immediately over HTTP.

---

## 3. SSL / HTTPS Activation via Certbot

Once DNS points to `136.118.46.53`, issue a free Let's Encrypt SSL certificate covering both domains and their `www` aliases:

```bash
ssh cgu 'sudo certbot --apache -d namastay.online -d www.namastay.online -d namastay.yoga -d www.namastay.yoga'
```

Certbot will:
1. Validate ACME challenges via the existing port 80 virtual host.
2. Generate SSL certificates under `/etc/letsencrypt/live/namastay.online/`.
3. Automatically configure the HTTPS `*:443` block and HTTP-to-HTTPS 301 redirection.
4. Integrate with `snap.certbot.renew.service` for automatic 60-day renewals.

Verify SSL certificate health:

```bash
ssh cgu 'sudo certbot certificates | grep -A 4 namastay'
```

---

## 4. Manual Deployment Runbook

If you prefer executing steps manually without the script:

```bash
# 1. SSH into the cloud box
ssh cgu

# 2. Ensure web directory exists with correct ownership
sudo mkdir -p /var/www/namastay
sudo chown -R www-data:www-data /var/www/namastay
sudo chmod 755 /var/www/namastay

# 3. Copy the placeholder HTML screen
# (From local machine):
scp clients/namastay/index.html cgu:/tmp/namastay.html
ssh cgu 'sudo mv /tmp/namastay.html /var/www/namastay/index.html && sudo chmod 644 /var/www/namastay/index.html'

# 4. Copy and enable Apache configuration
scp seanhalls_online/deploy/apache/namastay.conf cgu:/tmp/namastay.conf
ssh cgu 'sudo mv /tmp/namastay.conf /etc/apache2/sites-available/namastay.conf'
ssh cgu 'sudo a2ensite namastay.conf'
ssh cgu 'sudo apache2ctl configtest'
ssh cgu 'sudo systemctl reload apache2'

# 5. Test loopback
ssh cgu "curl -sI -H 'Host: namastay.online' http://127.0.0.1/ | head -n 3"
```

---

## 5. Preview & Testing

- **Local File Preview**: Open `clients/namastay/index.html` in your browser.
- **Studio Subpath Preview**: The file is also deployed with `seanhalls.online` and accessible live at:  
  [https://seanhalls.online/namastay/index.html](https://seanhalls.online/namastay/index.html)
- **Direct Domain Preview (Local hosts override)**:  
  You can test how the domain looks before DNS propagates by adding this line to your Mac's `/etc/hosts`:
  ```text
  136.118.46.53 namastay.online www.namastay.online namastay.yoga www.namastay.yoga
  ```
  Then browse to `http://namastay.online`.

---

## 6. Internal Client Portal & Strategic Asset Architecture

Namastay is tracked across the studio's operating stack:

- **Client Portal Projects**:
  - `namastay-online` — Digital Studio & On-Demand Streaming.
  - `namastay-yoga` — Hilo Sanctuary Acquisition & Physical Studio.
  - `namastay-wellness` — Unified holding entity.
- **Admin Command Center**:
  - Registered as 100% Sole Ownership under **Proprietary Internal Assets**.
  - Earmarked on-demand compute allocation for brand architecture, CMS, and acquisition modeling.
  - Visual acquisition callout: **Mixed Residential / Commercial Property (Downtown Hilo, Big Island, Hawaiʻi)** with `Fundraising in Progress` status badge.
