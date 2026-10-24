import { createHash } from 'node:crypto';

export async function verifyDeployedApp({ directUrl, expectedVersion, fetchImpl = fetch }) {
  const appResponse = await fetchImpl(directUrl, { cache: 'no-store' });
  const appHtml = await appResponse.text();
  if (!appResponse.ok || !appResponse.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`App smoke check failed (${appResponse.status}) at ${directUrl}`);
  }
  if (!appHtml.includes('id="root"')) {
    throw new Error(`App smoke check failed: ${directUrl} did not return the johnwalls.studio app shell`);
  }

  const buildInfoUrl = new URL('build-info.json', directUrl);
  buildInfoUrl.searchParams.set('deploymentCheck', expectedVersion);
  const buildInfoResponse = await fetchImpl(buildInfoUrl, { cache: 'no-store' });
  if (!buildInfoResponse.ok) {
    throw new Error(`Live build metadata could not be read (${buildInfoResponse.status})`);
  }
  const buildInfo = await buildInfoResponse.json();
  if (buildInfo.version !== expectedVersion) {
    throw new Error(`Live version mismatch. Expected ${expectedVersion}, found ${buildInfo.version || 'unknown'}`);
  }
  const indexSha256 = createHash('sha256').update(appHtml).digest('hex');
  if (!buildInfo.indexSha256 || buildInfo.indexSha256 !== indexSha256) {
    throw new Error('Live app HTML does not match the uploaded build fingerprint');
  }
  if (!Array.isArray(buildInfo.assets) || buildInfo.assets.length === 0) {
    throw new Error('Live build metadata does not list its JavaScript and CSS assets');
  }
  for (const assetPath of buildInfo.assets) {
    if (!appHtml.includes(assetPath)) {
      throw new Error(`Live app shell does not reference expected asset ${assetPath}`);
    }
    const assetResponse = await fetchImpl(new URL(assetPath, directUrl), { cache: 'no-store' });
    if (!assetResponse.ok) {
      throw new Error(`Live asset check failed (${assetResponse.status}) for ${assetPath}`);
    }
  }
  return buildInfo;
}
