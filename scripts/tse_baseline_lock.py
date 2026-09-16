#!/usr/bin/env python3
# TSE Production Baseline Lock Validator — Lead Generator
import os
import sys
import json
import re
import subprocess

BASELINE_DESCRIPTOR = os.path.join(os.path.dirname(__file__), 'lg_production_baseline.json')

def load_baseline():
    if not os.path.exists(BASELINE_DESCRIPTOR):
        raise Exception(f"[BASELINE LOCK ERROR] Baseline descriptor missing: {BASELINE_DESCRIPTOR}")
    with open(BASELINE_DESCRIPTOR, 'r', encoding='utf-8') as f:
        return json.load(f)

def run_baseline_lock_check(repo_path, manifest):
    print("=" * 70)
    print("[PRE-DEPLOYMENT GATE: PRODUCTION BASELINE LOCK — LEAD GENERATOR]")
    print("=" * 70)

    baseline = load_baseline()

    if not baseline.get('macAccepted', False):
        raise Exception("[BASELINE LOCK BLOCKED] The current baseline does not have Mac's verified acceptance. Deployment cannot proceed.")

    baseline_tag = baseline.get('baselineTag', 'lg-v1.42-full-disaster-recovery')
    print(f"Authoritative Accepted Baseline: {baseline.get('baselineVersion')} ({baseline_tag})")
    print(f"Mac Accepted Date: {baseline.get('acceptedDate')}")

    allowed_files = set(f.replace('\\', '/') for f in manifest.get('allowedFiles', []))
    task_desc = manifest.get('task', 'Unspecified task')
    print(f"Authorized Task Scope: {task_desc}")

    # 1. Verify Core Components on Disk
    print("\n[CHECK 1/4] Verifying Core Component Files...")
    for comp_rel in baseline['protectedFeatures']['components']:
        full_p = os.path.join(repo_path, comp_rel)
        if not os.path.exists(full_p):
            raise Exception(f"[BASELINE LOCK BLOCKED] Protected component file missing: {comp_rel}")
        if os.path.getsize(full_p) < 100:
            raise Exception(f"[BASELINE LOCK BLOCKED] Protected component '{comp_rel}' is truncated ({os.path.getsize(full_p)} bytes)!")
    print(f"  [PASS] All {len(baseline['protectedFeatures']['components'])} protected component files verified on disk.")

    # 2. Verify Server API Endpoints
    print("\n[CHECK 2/4] Verifying Server API Contracts...")
    server_js_path = os.path.join(repo_path, 'server', 'server.js')
    with open(server_js_path, 'r', encoding='utf-8') as f:
        server_content = f.read()

    for ep in baseline['protectedFeatures']['apiEndpoints']:
        if ep not in server_content:
            raise Exception(f"[BASELINE LOCK BLOCKED] Protected API route '{ep}' missing from server/server.js!")
    print(f"  [PASS] All {len(baseline['protectedFeatures']['apiEndpoints'])} API endpoint contracts verified.")

    # 3. Database Schema Tables
    print("\n[CHECK 3/4] Verifying SQLite Database Schema Definitions...")
    db_js_path = os.path.join(repo_path, 'server', 'db.js')
    with open(db_js_path, 'r', encoding='utf-8') as f:
        db_content = f.read()

    for table in baseline['protectedFeatures']['databaseTables']:
        if table not in db_content:
            raise Exception(f"[BASELINE LOCK BLOCKED] Protected database table definition '{table}' missing from server/db.js!")
    print(f"  [PASS] All {len(baseline['protectedFeatures']['databaseTables'])} database tables verified.")

    # 4. Compare Candidate Diff Against Authoritative Baseline Tag
    print("\n[CHECK 4/4] Comparing Candidate Diff Against Authoritative Baseline Tag...")
    candidate_commit = manifest.get('candidateCommit', 'HEAD')
    diff_res = subprocess.run(['git', 'diff', '--name-only', baseline_tag, candidate_commit], cwd=repo_path, capture_output=True, text=True)
    if diff_res.returncode != 0:
        raise Exception(f"[BASELINE LOCK BLOCKED] Failed to diff against baseline tag {baseline_tag}: {diff_res.stderr}")

    changed_files = [f.strip().replace('\\', '/') for f in diff_res.stdout.split('\n') if f.strip()]
    unauthorized_changes = [f for f in changed_files if f not in allowed_files]

    if unauthorized_changes:
        print("\n" + "="*70)
        print("[BASELINE LOCK BLOCKED] OUT-OF-SCOPE FUNCTIONALITY MODIFICATION DETECTED!")
        print(f"Candidate contains changes to {len(unauthorized_changes)} file(s) outside authorized task scope:")
        for uf in unauthorized_changes:
            print(f"  [UNAUTHORIZED REGRESSION RISK] {uf}")
        print("="*70 + "\n")
        raise Exception(f"Production Baseline Lock blocked deployment: {len(unauthorized_changes)} out-of-scope files modified.")

    print(f"  [PASS] All {len(changed_files)} changed files match declared allowed scope.")
    print("\n" + "="*70)
    print("[PASS] PRODUCTION BASELINE LOCK: 100% VERIFIED — ALL ACCEPTED BEHAVIOUR PROTECTED")
    print("="*70 + "\n")
    return True

if __name__ == '__main__':
    repo = r'c:\Antigravity\Lead Gen'
    manifest_p = os.path.join(repo, 'tse-manifest.json')
    if os.path.exists(manifest_p):
        with open(manifest_p, 'r', encoding='utf-8') as f:
            mf = json.load(f)
    else:
        mf = {'allowedFiles': [], 'task': 'Default check'}
    try:
        run_baseline_lock_check(repo, mf)
        print("[SUCCESS] Baseline lock check PASSED.")
    except Exception as e:
        print(f"[BLOCKED] {e}")
        sys.exit(1)
