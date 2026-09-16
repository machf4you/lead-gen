import { useState, useEffect } from 'react';
import { CURRENT_BUILD_VERSION, CURRENT_BUILD_LABEL, CURRENT_BUILD_HASH, CURRENT_BUILD_TIMESTAMP } from '../config/version';
import './GlobalDeploymentIndicator.css';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : '';

export default function GlobalDeploymentIndicator() {
  const [deployState, setDeployState] = useState('normal'); // 'normal' | 'updating' | 'update_ready'
  const [serverVersion, setServerVersion] = useState(CURRENT_BUILD_VERSION);

  useEffect(() => {
    let isMounted = true;

    function isServerNewer(sVer, sTimestamp, sCommit) {
      // 1. Strict timestamp check: Server timestamp is strictly newer than current bundle timestamp (+ 1000ms grace period)
      if (sTimestamp && CURRENT_BUILD_TIMESTAMP && Number(sTimestamp) > Number(CURRENT_BUILD_TIMESTAMP) + 1000) {
        return true;
      }

      // 2. Commit/Hash check: Server commit hash is valid, non-placeholder, and differs from current build hash
      if (sCommit && CURRENT_BUILD_HASH && sCommit !== CURRENT_BUILD_HASH && sCommit !== 'unknown' && sCommit !== 'dev') {
        if (!sTimestamp || !CURRENT_BUILD_TIMESTAMP || Number(sTimestamp) >= Number(CURRENT_BUILD_TIMESTAMP)) {
          return true;
        }
      }

      // 3. Semver / Version string comparison (e.g. 1.46 > 1.45)
      if (sVer && CURRENT_BUILD_VERSION && sVer !== CURRENT_BUILD_VERSION && sVer !== 'unknown') {
        const sParts = String(sVer).replace(/^[vV]/, '').split('.').map(n => parseInt(n, 10) || 0);
        const cParts = String(CURRENT_BUILD_VERSION).replace(/^[vV]/, '').split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(sParts.length, cParts.length); i++) {
          const sNum = sParts[i] || 0;
          const cNum = cParts[i] || 0;
          if (sNum > cNum) return true;
          if (sNum < cNum) return false;
        }
      }

      return false;
    }

    async function checkDeploymentStatus() {
      try {
        let isUpdating = false;
        let serverVer = CURRENT_BUILD_VERSION;
        let serverTimestamp = CURRENT_BUILD_TIMESTAMP;
        let serverCommit = CURRENT_BUILD_HASH;

        // 1. Primary check: Server API /api/version
        try {
          const apiRes = await fetch(`${API_BASE}/api/version?_t=${Date.now()}`, {
            cache: 'no-store'
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData.isDeploymentInProgress === true || apiData.building) {
              isUpdating = true;
            }
            if (apiData.version || apiData.version_tag) serverVer = apiData.version || apiData.version_tag;
            if (apiData.buildTimestamp) {
              serverTimestamp = Number(apiData.buildTimestamp);
            } else if (apiData.build_time) {
              const parsed = new Date(apiData.build_time).getTime();
              if (!isNaN(parsed)) serverTimestamp = parsed;
            }
            if (apiData.commit_hash) serverCommit = apiData.commit_hash;
          }
        } catch (_e) {}

        // 2. Secondary check: /version.json static file
        try {
          const staticRes = await fetch(`/version.json?_t=${Date.now()}`, {
            cache: 'no-store',
            credentials: 'same-origin'
          });
          if (staticRes.ok) {
            const staticData = await staticRes.json();
            if (staticData.isDeploymentInProgress === true || staticData.building) {
              isUpdating = true;
            }
            if (staticData.version || staticData.version_tag) serverVer = staticData.version || staticData.version_tag;
            if (staticData.buildTimestamp) {
              serverTimestamp = Number(staticData.buildTimestamp);
            } else if (staticData.build_time) {
              const parsed = new Date(staticData.build_time).getTime();
              if (!isNaN(parsed)) serverTimestamp = parsed;
            }
            if (staticData.commit_hash) serverCommit = staticData.commit_hash;
          }
        } catch (_e) {}

        if (!isMounted) return;

        setServerVersion(serverVer || CURRENT_BUILD_VERSION);

        if (isUpdating) {
          setDeployState('updating');
        } else if (isServerNewer(serverVer, serverTimestamp, serverCommit)) {
          setDeployState('update_ready');
        } else {
          setDeployState('normal');
        }
      } catch (_err) {}
    }

    checkDeploymentStatus();
    const interval = setInterval(checkDeploymentStatus, 2500);
    window.addEventListener('focus', checkDeploymentStatus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', checkDeploymentStatus);
    };
  }, []);

  const handleManualRefresh = async () => {
    try {
      if ('caches' in window) {
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map(k => caches.delete(k)));
        } catch (_e) {}
      }
      const url = new URL(window.location.href);
      url.searchParams.set('_v', Date.now().toString());
      window.location.href = url.toString();
      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (_e) {
      window.location.reload();
    }
  };

  return (
    <>
      {/* 1. Full-Width Updating Banner (Deployment in progress) */}
      {deployState === 'updating' && (
        <div className="global-updating-banner" role="status" aria-live="polite">
          <div className="global-update-banner-content">
            <span className="banner-message">
              <span className="deploy-spin-icon" aria-hidden="true">⏳</span>
              <strong>DEPLOYMENT IN PROGRESS:</strong> A new build is currently being deployed. Please wait and <em>DO NOT press Ctrl + F5 yet</em>.
            </span>
          </div>
        </div>
      )}

      {/* 2. Full-Width New Version Ready Banner */}
      {deployState === 'update_ready' && (
        <div
          className="global-updating-banner global-update-ready-banner"
          role="status"
          aria-live="polite"
          onClick={handleManualRefresh}
          style={{ cursor: 'pointer' }}
          id="banner-new-version-ready"
        >
          <div className="global-update-banner-content">
            <span className="banner-message">
              <span className="deploy-ready-icon" aria-hidden="true">↻</span>
              <strong>NEW VERSION READY:</strong> An update has been deployed. <strong>Click here to refresh</strong> and load the latest changes.
            </span>
            <button
              type="button"
              className="banner-action-button"
              onClick={(e) => {
                e.stopPropagation();
                handleManualRefresh();
              }}
            >
              Refresh Now
            </button>
          </div>
        </div>
      )}

      {/* 3. Header Indicator & Refresh Button */}
      {deployState === 'updating' ? (
        <div className="global-deploy-indicator global-deploy-updating" role="status" aria-live="polite" title="Deployment in progress - Do NOT refresh yet">
          <span className="deploy-spin-icon" aria-hidden="true">⏳</span>
          <span className="deploy-text-updating">UPDATING — PLEASE WAIT</span>
        </div>
      ) : deployState === 'update_ready' ? (
        <div className="global-deploy-indicator">
          <button 
            type="button"
            className="global-deploy-update-ready-btn" 
            onClick={handleManualRefresh}
            title="New version is live! Click to reload latest changes"
            id="btn-global-click-to-refresh"
          >
            <span className="deploy-ready-icon" aria-hidden="true">↻</span>
            <span className="deploy-ready-text">CLICK TO REFRESH</span>
          </button>
        </div>
      ) : (
        <div className="global-deploy-indicator global-deploy-normal">
          <span className="global-deploy-live-badge">
            <span className="deploy-live-dot">●</span> {CURRENT_BUILD_LABEL}
          </span>
          <button
            type="button"
            className="global-deploy-refresh-btn global-deploy-refresh-normal"
            onClick={handleManualRefresh}
            title="Reload application"
            id="btn-global-header-refresh"
          >
            <span className="refresh-icon" aria-hidden="true">↻</span> Refresh
          </button>
        </div>
      )}
    </>
  );
}
