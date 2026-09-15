# Restore Point: V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION

**Application**: TSE Lead Generator  
**Build Version**: `V1.42 | READY`  
**Git Tag**: `V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION`  
**Git Commit**: `1863136`  
**Timestamp**: 2026-09-15 12:32:00  
**VPS Host**: `77.245.157.66` (SSH Port: `22667`)  
**Production URL**: `https://lead-gen.thesearchequation.co.uk/`  
**PM2 Process**: ID `52` (`lead-gen-api`)  

---

## 1. Scope & Purpose

This restore point captures the full, working, and verified production state of **TSE Lead Generator V1.42** prior to the implementation of user workspace separation.

### Key Working Features at this Point:
1. **Master Email Templates UI Cleaned**:
   - Single `+ Create Master Template` button on the template count panel bar.
   - Header duplicate button removed.
   - Empty-state duplicate button removed.
2. **Personalisation Variables Reference Panel**:
   - 3-column reference table (`VARIABLE | WHAT IT USES | EXAMPLE`) on the right side of the Create/Edit Master Template form.
   - Clickable variable pills retained in the form.
3. **Cache-Busting & Global Deployment Indicator**:
   - Active build version: `1.42`.
   - Normal idle state: `● V1.42 | READY` + `↻ Refresh` button.
   - Deployment detection: Red `CLICK TO REFRESH` button upon new build detection.
4. **Authentication Integration**:
   - Protected via `/_auth/verify` on `tse-auth-service` (Port 3010).
   - Explicit `/login` screen navigation without auto-redirect loops.

---

## 2. Production Database & Config Backup Details

### Backup Locations:
* **VPS Path**: `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/backups/V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION/`
* **VPS Tarball**: `/var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/backups/V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION.tar.gz`
* **Local Path**: `C:\Antigravity\Lead Gen\backups\V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION\`

### Database Schema & State (`database.db`):
* **SHA-256 Checksum**: `ad918f7f4b27fd4a8e522dd207eeb33c0d43730fb427852a43393fcf0a841c6b`
* **Size**: `77,824 bytes`
* **Table Row Counts**:
  - `email_templates`: 6 rows
  - `app_settings`: 3 rows
  - `saved_searches`: 0 rows
  - `excluded_domains`: 0 rows
  - `outreach_shortlist`: 0 rows
  - `outreach_packs`: 0 rows
  - `outreach_contact_history`: 0 rows

---

## 3. Exact Restoration Procedure

To revert Lead Generator to this exact state at any time:

### Step 1: Revert Code to Git Tag
```bash
cd "C:\Antigravity\Lead Gen"
git checkout V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION
```

### Step 2: Restore Database & Environment Config on VPS
```bash
ssh -i ~/.ssh/id_clean_ed25519 -p 22667 root@77.245.157.66 "
  cp /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/backups/V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION/database.db /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/server/database.db
  cp /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/backups/V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION/server.env /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/server/.env
  cp /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/backups/V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION/version.json /var/www/www-root/data/www/lead-gen.thesearchequation.co.uk/current/version.json
"
```

### Step 3: Rebuild Client & Restart Services
```bash
cd "C:\Antigravity\Lead Gen\client"
npm run build
python "C:\Antigravity\Lead Gen\scratch\deploy_leadgen.py"
```

---

## 4. Verification

The restore point was verified by comparing database checksums, SQLite schema validation, and verifying that Git Tag `V1.42-STABLE-PRIOR-TO-USER-WORKSPACE-SEPARATION` points to commit `1863136`.
