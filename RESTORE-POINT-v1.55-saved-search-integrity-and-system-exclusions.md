# TSE Lead Generator — Full Disaster-Recovery Restore Point

**Version:** `v1.55-lg-stable`  
**Git Tag:** `lg-v1.55-saved-search-integrity-and-system-exclusions`  
**Commit:** `964f48490fe6dc92ddcaaeb135f8e35a62d272a6`  
**Date:** 23 SEP 2026  
**Status:** Accepted Production Baseline / Full Disaster Recovery  
**Application:** Lead Generator (`tse-lead-generator` / `Lead Gen`)  
**Production URL:** `https://lead-gen.thesearchequation.co.uk`  
**Backend API URL:** `https://lead-gen.thesearchequation.co.uk/api` (proxied to `127.0.0.1:5000`)

---

## 1. Executive Summary & Purpose

This document provides the authoritative **Full Disaster-Recovery Specification and Restore Point** for the TSE Lead Generator application (V1.55), incorporating:
- **Saved Search Integrity Protection:** `handleSearch` detects query changes (Business Type, Location, or Search Mode) vs active searches, automatically assigning a new Search ID (`SR0012`+) and preventing accidental corruption of existing search records.
- **Explicit Rerun Persistence:** Genuine exact reruns explicitly persist updated timestamps and search metadata without relying on stale object spread.
- **Restored SR0009 Record:** Reconciled metadata to `businessType: 'window shutters'`, `location: 'Croydon'`, `searchMode: 'organic'`, `count: 25`, preserving all 25 Croydon organic ranking results.
- **Global `.gov.uk` & `.gov` System Exclusions:** Normalised hostname suffix engine excludes government and municipal domains across the server API and client interface.
- **Locked Exclusions UI:** `.gov.uk` and `.gov` rendered with locked system exclusion badges in Manage Exclusions table.
- **Dynamic Existing Search Filtering:** Historical saved search results dynamically filter out government domains when loaded in the UI, ensuring excluded results cannot reach Shortlist, Re-analyse All Prospects, or Outreach packs.

---

## 2. System Architecture & Inventory

1. **Frontend SPA:** React 18, Vite 8, Tailwind CSS, Lucide Icons.
2. **Backend API:** Node.js Express server (`server/server.js`) listening on internal port `5000`.
3. **Database Engine:** SQLite 3.
   - Primary Storage: `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db`
4. **Process Supervision:** PM2 daemon (`lead-gen-api`, PID running on port 5000).
5. **Web Server & Reverse Proxy:** Nginx with Let's Encrypt TLS/SSL.

---

## 3. Key Invariants & Verification Status

| Invariant | Implementation | Status |
| :--- | :--- | :--- |
| Saved Search Integrity | Normalised parameter comparison generating new `SRxxxx` ID on change | Verified (Tests A–E) |
| Exact Query Rerun | Refreshes timestamp and explicitly sets metadata | Verified (Test D) |
| SR0009 Consistency | `location: 'Croydon'`, `businessType: 'window shutters'`, 25 results | Verified in SQLite DB |
| System Exclusions | `.gov.uk` and `.gov` hostname suffix filtering in server & client | Verified (Tests F–G) |
| Downstream Protection | Shortlist & Outreach contain 0 `.gov` items | Verified in DB |

---

## 4. Disaster Recovery & Restore Instructions

To restore Lead Generator from this baseline:
1. Clone or checkout repository at commit `964f484` / tag `lg-v1.55-saved-search-integrity-and-system-exclusions`.
2. Ensure `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/.env` exists with required API and SMTP credentials.
3. In `client/`: Run `npm install && npm run build`.
4. In `server/`: Run `npm install`.
5. Start or reload PM2 service:
   ```bash
   PORT=5000 DB_PATH=/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/persistent/database.db pm2 restart lead-gen-api
   ```
6. Verify health endpoint: `curl -s http://localhost:5000/api/health` returns `{"status":"ok"}`.
