/**
 * TSE Universal Production Deployment Lock
 * Mechanical Gate: Prevents build/bundle creation unless candidate source is proven
 * to descend from the authoritative accepted disaster recovery baseline.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (_e) {
    return process.cwd();
  }
}

function findManifest() {
  const possiblePaths = [
    path.join(__dirname, 'tse_production_baseline.json'),
    path.join(__dirname, '..', 'scripts', 'tse_production_baseline.json'),
    path.join(getGitRoot(), 'scripts', 'tse_production_baseline.json'),
    path.join(process.cwd(), 'scripts', 'tse_production_baseline.json'),
    path.join(process.cwd(), 'tse_production_baseline.json')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function fatal(msg) {
  console.error('\n============================================================');
  console.error('🛑 PRODUCTION BUILD BLOCKED');
  console.error(msg);
  console.error('============================================================\n');
  process.exit(1);
}

function runGit(cmd, cwd) {
  try {
    return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (_e) {
    return null;
  }
}

function validateProductionAncestry() {
  const manifestPath = findManifest();
  if (!manifestPath) {
    fatal('CRITICAL: Authoritative baseline manifest missing (tse_production_baseline.json).');
  }

  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fatal(`CRITICAL: Baseline manifest JSON invalid: ${e.message}`);
  }

  const { appName, acceptedVersion, acceptedTag, acceptedCommit } = baseline;
  const gitRoot = getGitRoot();

  console.log(`\n🔒 [TSE DEPLOYMENT LOCK] Validating ${appName} (Accepted Baseline: V${acceptedVersion} / Tag: ${acceptedTag} / Commit: ${acceptedCommit.substring(0, 8)})...`);

  const isGit = runGit('rev-parse --is-inside-work-tree', gitRoot);
  if (isGit !== 'true') {
    fatal(`Repository check failed: ${gitRoot} is not a valid Git working tree.`);
  }

  const currentHead = runGit('rev-parse HEAD', gitRoot);
  if (!currentHead) {
    fatal(`Failed to resolve current Git HEAD.`);
  }

  // 1. Verify accepted commit exists in local git object database
  const commitType = runGit(`cat-file -t ${acceptedCommit}`, gitRoot);
  if (commitType !== 'commit') {
    // Try resolving from tag
    const tagCommit = runGit(`rev-parse ${acceptedTag}^{commit}`, gitRoot);
    if (!tagCommit) {
      fatal(`ACCEPTED BASELINE COMMIT NOT FOUND IN LOCAL GIT REPOSITORY.\nRequired Commit: ${acceptedCommit}\nRequired Tag: ${acceptedTag}\nCURRENT HEAD: ${currentHead}\nREASON: Local git database is missing the accepted production baseline.`);
    }
  }

  // 2. MANDATORY MECHANICAL ANCESTRY CHECK
  // git merge-base --is-ancestor <ACCEPTED_COMMIT> HEAD
  try {
    execSync(`git merge-base --is-ancestor ${acceptedCommit} HEAD`, { cwd: gitRoot, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (_err) {
    const shortHead = currentHead.substring(0, 8);
    const shortBase = acceptedCommit.substring(0, 8);
    fatal(`CURRENT HEAD: ${shortHead} (${currentHead})\nREQUIRED ACCEPTED BASELINE: ${acceptedTag} (${shortBase})\nREASON: Candidate source does not descend from accepted production baseline (${acceptedTag}).\n\nProduction build is mechanically forbidden.`);
  }

  console.log(`✅ [TSE DEPLOYMENT LOCK PASS] Candidate HEAD (${currentHead.substring(0, 8)}) is proven descendant of accepted baseline V${acceptedVersion} (${acceptedCommit.substring(0, 8)}).\n`);

  // 3. Emit secure validation marker
  const marker = {
    appName,
    acceptedVersion,
    acceptedTag,
    acceptedCommit,
    candidateHead: currentHead,
    validatedAt: new Date().toISOString(),
    timestamp: Date.now(),
    signature: 'TSE_VALIDATED_' + currentHead.substring(0, 8) + '_' + acceptedCommit.substring(0, 8)
  };

  try {
    fs.writeFileSync(path.join(gitRoot, '.deployment-validated.json'), JSON.stringify(marker, null, 2), 'utf8');
  } catch (_e) {}

  return true;
}

if (require.main === module) {
  validateProductionAncestry();
}

module.exports = { validateProductionAncestry };
