# TSE Lead Generator — Full Disaster-Recovery Restore Point

**Version:** `v1.42-lg-stable`  
**Git Tag:** `lg-v1.42-full-disaster-recovery`  
**Date:** 16 SEP 2026  
**Status:** Accepted Production Baseline / Full Disaster Recovery  
**Application:** Lead Generator (`Lead Gen`)  
**Production URL:** `https://lead-gen.thesearchequation.co.uk`  
**Backend API URL:** `https://lead-gen.thesearchequation.co.uk/api` (proxied to `127.0.0.1:5000`)

---

## 1. Executive Summary & Purpose

This document is the authoritative **Full Disaster-Recovery Specification and Restore Point** for the TSE Lead Generator application. It provides complete instructions, architecture manifests, configuration files, schema layouts, and recovery procedures required to rebuild and deploy the entire production application from scratch if both the development workstation and the live host environment were completely lost.

---

## 2. System Architecture & Inventory

### 2.1 Core Components
1. **Frontend SPA:** React 18, Vite 5, Tailwind CSS, Lucide Icons, Radix UI.
   - Client directory: `client/`
2. **Backend API Server:** Node.js Express server (`server/server.js`, `server/db.js`, `server/enrich_tse_saved_searches.js`) listening on internal port `5000`.
3. **Database Engine:** SQLite 3 with persistent volume storage.
   - Authoritative Storage: `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db`
   - Cold DR Snapshot: `/opt/tse-apps/backups/databases/lead-gen/lead_gen_persistent_disaster_recovery_v1.42.db` (972 KB)
4. **Process Supervision:** Node.js backend daemon on port `5000` / PM2 deployment manager.
5. **Web Server & Reverse Proxy:** Nginx with Let's Encrypt TLS/SSL, forwarding `/api/` requests to `127.0.0.1:5000` and serving static assets from `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/client/dist`.

---

## 3. Database Schema & Data Invariants

### 3.1 SQLite Tables & Verified Invariants
| Table Name | Description | Status |
| :--- | :--- | :--- |
| `saved_searches` | Cached lead discovery searches, Google Business Profile results, and scores | Verified |
| `email_templates` | Master email templates and personalisations variables catalog | 8 master templates |
| `outreach_packs` | Prepared client outreach packs and campaign sequences | Verified |
| `outreach_shortlist` | Shortlisted high-opportunity business leads (Score 70+) | Verified |
| `outreach_contact_history` | Contact attempt logs and email delivery audit | Verified |
| `app_settings` | Lead Generator environment and threshold configurations | Configured |

### 3.2 Cold Backup Verification
The complete production database snapshot is preserved on the VPS backup volume:
```bash
/opt/tse-apps/backups/databases/lead-gen/lead_gen_persistent_disaster_recovery_v1.42.db
```
To verify data integrity:
```bash
sqlite3 /opt/tse-apps/backups/databases/lead-gen/lead_gen_persistent_disaster_recovery_v1.42.db "PRAGMA integrity_check; SELECT count(*) FROM email_templates;"
```

---

## 4. Environment & Runtime Configuration

### 4.1 Production Environment Variables
Create `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/.env`:
```ini
PORT=5000
NODE_ENV=production
DATAFORSEO_LOGIN=<DATAFORSEO_LOGIN>
DATAFORSEO_PASSWORD=<DATAFORSEO_PASSWORD>
SMTP_HOST=mail.thesearchequation.co.uk
SMTP_PORT=587
SMTP_USER=mac@thesearchequation.co.uk
SMTP_PASS=<SMTP_PASSWORD>
SMTP_FROM=mac@thesearchequation.co.uk
SMTP_SECURE=false
```

### 4.2 Nginx Server Block
File: `/etc/nginx/sites-available/lead-gen.thesearchequation.co.uk`
```nginx
server {
    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;
    server_name lead-gen.thesearchequation.co.uk;

    root /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/client/dist;
    index index.html;

    include /etc/nginx/snippets/tse-auth.conf;
    include /etc/nginx/snippets/tse-security-headers.conf;

    location = /robots.txt {
        auth_request off;
        default_type text/plain;
        return 200 "User-agent: *
Disallow: /
";
    }

    location = /version.json {
        auth_request off;
        default_type application/json;
        try_files /version.json =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Auth-User $auth_user;
        proxy_set_header X-Auth-Role $auth_role;
        proxy_set_header X-Auth-Email $auth_email;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    listen [::]:443 ssl;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/lead-gen.thesearchequation.co.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lead-gen.thesearchequation.co.uk/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;
    if ($host = lead-gen.thesearchequation.co.uk) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name lead-gen.thesearchequation.co.uk;
    return 404;
}
```

---

## 5. Step-by-Step Disaster Recovery Procedure

In the event of total server loss:

### Step 1: Provision Host and Prerequisites
```bash
apt-get update && apt-get install -y nodejs npm nginx sqlite3 git
npm install -g pm2
mkdir -p /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent
mkdir -p /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/releases
```

### Step 2: Restore Application Code & Dependencies
```bash
cd /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk
git clone <repository_url> repo
cd repo
git checkout lg-v1.42-full-disaster-recovery
cd client && npm install && npm run build && cd ..
cd server && npm install && cd ..
```

### Step 3: Restore Database Snapshot
```bash
cp /opt/tse-apps/backups/databases/lead-gen/lead_gen_persistent_disaster_recovery_v1.42.db /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db
chmod 664 /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db
```

### Step 4: Configure and Launch Server Process
```bash
cd /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/repo/server
node server.js &
```

### Step 5: Configure Nginx & SSL
```bash
cp nginx/lead-gen.conf /etc/nginx/sites-available/lead-gen.thesearchequation.co.uk
ln -s /etc/nginx/sites-available/lead-gen.thesearchequation.co.uk /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Step 6: Post-Recovery Verification
1. Open `https://lead-gen.thesearchequation.co.uk` in browser.
2. Verify all Master Email Templates and search discovery tools load properly.
3. Test API ping: `curl -I https://lead-gen.thesearchequation.co.uk/api/templates`.
