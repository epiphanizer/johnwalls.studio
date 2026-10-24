#!/usr/bin/env node
/**
 * johnwalls.studio Auto-Push & Deploy Script
 *
 * Builds the johnwalls_studio UI and securely pushes the production bundle
 * to johnwalls.studio via the /api/johnwalls/deploy endpoint.
 *
 * Usage:
 *   node scripts/push-to-studio.mjs [--url <deployUrl>] [--token <deployToken>] [--skip-build]
 *   npm run push
 *   make push
 */

import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyDeployedApp } from './deploymentSmokeCheck.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const UI_DIR = resolve(ROOT_DIR, 'ui');
const DIST_DIR = resolve(UI_DIR, 'dist');
const TMP_BUNDLE = resolve(ROOT_DIR, 'studio-bundle.tar.gz');

// Parse CLI flags
const args = process.argv.slice(2);
let deployUrl = process.env.STUDIO_DEPLOY_URL || 'https://johnwalls.studio/api/johnwalls/deploy';
let deployToken = process.env.STUDIO_DEPLOY_TOKEN || '';
let skipBuild = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) {
    deployUrl = args[++i];
  } else if (args[i] === '--token' && args[i + 1]) {
    deployToken = args[++i];
  } else if (args[i] === '--skip-build') {
    skipBuild = true;
  }
}

console.log('\n┌──────────────────────────────────────────────────────────┐');
console.log('│  ⚡ johnwalls.studio DIRECT DAW & WEB APP PUSH PIPELINE  │');
console.log('└──────────────────────────────────────────────────────────┘\n');

async function main() {
  // 1. Build UI unless skipped
  if (!skipBuild) {
    console.log('⚙️  [1/4] Building production UI bundle (tsc + vite)...');
    try {
      execSync('npm run build', {
        cwd: UI_DIR,
        stdio: 'inherit'
      });
      console.log('✓ UI build completed successfully.');
    } catch (err) {
      console.error('❌ Build failed. Aborting deploy.');
      process.exit(1);
    }
  } else {
    console.log('⏭️  [1/4] Skipping build step (--skip-build flag set).');
  }

  // Verify dist/index.html
  const indexPath = resolve(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(`❌ Dist directory does not contain index.html at ${indexPath}. Run build first.`);
    process.exit(1);
  }

  let gitRev = 'unknown';
  let releaseVersion;
  const buildInfoPath = resolve(DIST_DIR, 'build-info.json');
  if (skipBuild) {
    if (!existsSync(buildInfoPath)) {
      console.error('❌ --skip-build requires a dist/build-info.json created by a prior push build.');
      process.exit(1);
    }
    try {
      const previousBuild = JSON.parse(readFileSync(buildInfoPath, 'utf-8'));
      if (!previousBuild.version || !previousBuild.indexSha256 || !Array.isArray(previousBuild.assets)) {
        throw new Error('missing build fingerprint');
      }
      gitRev = previousBuild.gitRevision || 'unknown';
      releaseVersion = previousBuild.version;
    } catch {
      console.error('❌ --skip-build requires valid dist/build-info.json build metadata.');
      process.exit(1);
    }
  } else {
    let hasUncommittedChanges = false;
    try {
      gitRev = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim();
      hasUncommittedChanges = Boolean(execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf-8' }).trim());
    } catch {}
    releaseVersion = `v1.0-${gitRev}${hasUncommittedChanges ? '-dirty' : ''}-${Date.now()}`;
    const builtHtml = readFileSync(indexPath, 'utf-8');
    const assets = [...builtHtml.matchAll(/(?:src|href)="([^"]+\.(?:m?js|css))"/g)].map((match) => match[1]);
    if (assets.length === 0) {
      console.error('❌ Built index.html does not reference any JavaScript or CSS assets.');
      process.exit(1);
    }
    writeFileSync(
      buildInfoPath,
      `${JSON.stringify({ name: 'johnwalls.studio', version: releaseVersion, gitRevision: gitRev, dirty: hasUncommittedChanges, indexSha256: createHash('sha256').update(builtHtml).digest('hex'), assets, createdAt: new Date().toISOString() }, null, 2)}\n`
    );
  }

  // 2. Package into tarball
  console.log('\n📦 [2/4] Packaging web bundle from dist/...');
  try {
    if (existsSync(TMP_BUNDLE)) {
      unlinkSync(TMP_BUNDLE);
    }
    execSync(`tar -czf "${TMP_BUNDLE}" --exclude='./audio' -C "${DIST_DIR}" .`, { stdio: 'inherit' });
    const stats = statSync(TMP_BUNDLE);
    const sizeKb = (stats.size / 1024).toFixed(1);
    console.log(`✓ Packaged bundle: ${sizeKb} KB`);
  } catch (err) {
    console.error('❌ Failed to create tarball:', err);
    process.exit(1);
  }

  // 3. Prepare upload payload
  console.log(`\n🚀 [3/4] Transmitting bundle to ${deployUrl}...`);
  const bundleBuffer = readFileSync(TMP_BUNDLE);
  const bundleBlob = new Blob([bundleBuffer], { type: 'application/gzip' });

  const formData = new FormData();
  formData.append('bundle', bundleBlob, 'studio-bundle.tar.gz');
  formData.append('version', releaseVersion);
  if (deployToken) {
    formData.append('deployToken', deployToken);
  }

  // 4. Send request
  try {
    const res = await fetch(deployUrl, {
      method: 'POST',
      body: formData,
      headers: deployToken ? { 'x-deploy-token': deployToken } : {}
    });

    const responseText = await res.text();
    let json;
    try {
      json = JSON.parse(responseText);
    } catch {
      throw new Error(`Unexpected response from server (${res.status}): ${responseText}`);
    }

    if (!res.ok || !(json.ok || json.success)) {
      throw new Error(`Deployment rejected by server (${res.status}): ${json.error || json.message || responseText}`);
    }

    const manifest = json.manifest || json.deployManifest || {};
    const directUrl = json.directUrl || manifest.directUrl || 'https://johnwalls.studio/studio-app/index.html';
    const liveBuildInfo = await verifyDeployedApp({ directUrl, expectedVersion: releaseVersion });

    console.log('\n🎉 [4/4] DEPLOYMENT COMPLETE & VERIFIED LIVE!');
    console.log(`──────────────────────────────────────────────────────────`);
    console.log(`  Status:      LIVE`);
    console.log(`  Target:      ${deployUrl}`);
    console.log(`  Public URL:  ${json.publicUrl || manifest.publicUrl || 'https://johnwalls.studio/app'}`);
    console.log(`  Direct App:  ${directUrl}`);
    console.log(`  Version:     ${liveBuildInfo.version}`);
    console.log(`  Files:       ${manifest.fileCount || json.filesDeployed || 0} files extracted`);
    console.log(`  Timestamp:   ${manifest.deployedAt || new Date().toISOString()}`);
    console.log(`──────────────────────────────────────────────────────────\n`);
  } catch (err) {
    console.error('❌ Deployment or live verification failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    // Cleanup temporary bundle
    try {
      if (existsSync(TMP_BUNDLE)) {
        unlinkSync(TMP_BUNDLE);
      }
    } catch {}
  }
}

main().catch((err) => {
  console.error('Fatal deploy error:', err);
  process.exit(1);
});
