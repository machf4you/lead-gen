# TSE Lead Generator — Full Disaster-Recovery Restore Point

**Version:** `v1.54-lg-stable`  
**Git Tag:** `lg-v1.54-full-disaster-recovery`  
**Date:** 16 SEP 2026  
**Status:** Accepted Production Baseline / Full Disaster Recovery  
**Application:** Lead Generator (`tse-lead-generator` / `Lead Gen`)  
**Production URL:** `https://lead-gen.thesearchequation.co.uk`  
**Backend API URL:** `https://lead-gen.thesearchequation.co.uk/api` (proxied to `127.0.0.1:5000`)

---

## 1. Executive Summary & Purpose

This document provides the authoritative **Full Disaster-Recovery Specification and Restore Point** for the TSE Lead Generator application (V1.54), incorporating:
- Multi-workspace sender separation (TSE vs. Smoking Chili Media).
- Clean URL navigation routing (`/saved-searches`, `/domain-exclusions`, `/outreach-shortlist`, `/outreach-packs`, `/outreach-email-templates`, `/settings`).
- Master Email Templates vertical split-screen design and live Send Test Email capability.
- Dedicated Google Workspace SMTP configuration for Smoking Chili (`smtp.gmail.com:587`, STARTTLS) strictly isolated from TSE SMTP (`mail.thesearchequation.co.uk:587`).

---

## 2. System Architecture & Inventory

1. **Frontend SPA:** React 18, Vite 8, Tailwind CSS, Lucide Icons.
2. **Backend API:** Node.js Express server (`server/server.js`) listening on internal port `5000`.
3. **Database Engine:** SQLite 3.
   - Primary Storage: `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db`
   - Backup Image: `/opt/tse-apps/backups/databases/lead-gen/lead_gen_disaster_recovery_v1.54.db`
4. **Process Supervision:** PM2 daemon (`lead-gen-api`).
5. **Web Server & Reverse Proxy:** Nginx with Let's Encrypt TLS/SSL.

---

## 3. Outbound SMTP Routing

| Workspace | Sender Identity | Host / Port / Encryption | Status |
| :--- | :--- | :--- | :--- |
| **TSE** | `"Mac McCarthy" <mac@thesearchequation.co.uk>` | `mail.thesearchequation.co.uk:587` | Active |
| **Smoking Chili** | `"Darren" <darren@smokingchilimedia.com>` | `smtp.gmail.com:587` (STARTTLS) | Active |

---

## 4. Cold Backup Verification

- **Full App Archive:** `/opt/tse-apps/backups/lead-gen/2026-09-16-full/lead-gen-app-2026-09-16-full.tar.gz`
- **Database Image:** `/opt/tse-apps/backups/databases/lead-gen/lead_gen_disaster_recovery_v1.54.db`
- **Nginx Config:** `/opt/tse-apps/backups/lead-gen/2026-09-16-full/nginx/lead-gen.thesearchequation.co.uk.conf`
- **Restore Manifest:** `/opt/tse-apps/backups/lead-gen/2026-09-16-full/RESTORE-MANIFEST.md`

Integrity verified via `sqlite3 PRAGMA integrity_check` (7 saved searches intact).
