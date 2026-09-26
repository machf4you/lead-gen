const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return 'dev';
  }
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const commitHash = getGitCommitHash();
  const timestamp = Date.now();
  const versionStr = '1.56';
  const labelStr = `V${versionStr} | SENT EMAIL HISTORY`;

  const configVersionPath = path.join(rootDir, 'client', 'src', 'config', 'version.js');
  const versionContent = `// Automatically generated during build - DO NOT EDIT MANUALLY
export const CURRENT_BUILD_VERSION = '${versionStr}';
export const CURRENT_BUILD_LABEL = '${labelStr}';
export const CURRENT_BUILD_HASH = '${commitHash}';
export const CURRENT_BUILD_TIMESTAMP = ${timestamp};
`;

  fs.writeFileSync(configVersionPath, versionContent, 'utf8');
  console.log(`[generate_version] Updated ${configVersionPath} (commit: ${commitHash.slice(0, 7)}, timestamp: ${timestamp})`);

  const publicVersionPath = path.join(rootDir, 'client', 'public', 'version.json');
  const versionJsonData = {
    id: 'tse_lead_gen',
    name: 'TSE Lead Gen',
    commit_hash: commitHash,
    version: versionStr,
    version_tag: `v${versionStr}-sent-email-history`,
    build_time: new Date(timestamp).toISOString(),
    buildTimestamp: timestamp,
    isDeploymentInProgress: false
  };

  fs.writeFileSync(publicVersionPath, JSON.stringify(versionJsonData, null, 2), 'utf8');
  console.log(`[generate_version] Updated ${publicVersionPath}`);
}

main();
