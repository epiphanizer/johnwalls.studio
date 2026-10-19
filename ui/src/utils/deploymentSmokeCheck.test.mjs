import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { verifyDeployedApp } from '../../../scripts/deploymentSmokeCheck.mjs';

function response({ status = 200, contentType = 'text/html; charset=utf-8', body = '' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    text: async () => body,
    json: async () => JSON.parse(body)
  };
}

describe('deployment smoke check', () => {
  it('requires the deployed app shell and exact build version', async () => {
    const html = '<html><script src="./assets/app-123.js"></script><link href="./assets/app-123.css"><div id="root"></div></html>';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ body: html }))
      .mockResolvedValueOnce(response({ contentType: 'application/json', body: JSON.stringify({
        version: 'build-42',
        indexSha256: createHash('sha256').update(html).digest('hex'),
        assets: ['./assets/app-123.js', './assets/app-123.css']
      }) }))
      .mockResolvedValue(response({ contentType: 'application/javascript', body: 'asset' }));

    await expect(verifyDeployedApp({
      directUrl: 'https://johnwalls.studio/studio-app/index.html',
      expectedVersion: 'build-42',
      fetchImpl
    })).resolves.toMatchObject({ version: 'build-42' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('fails if the deployment API accepted the bundle but the live app still serves an older build', async () => {
    const html = '<html><div id="root"></div></html>';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ body: html }))
      .mockResolvedValueOnce(response({ contentType: 'application/json', body: JSON.stringify({
        version: 'old-build',
        indexSha256: createHash('sha256').update(html).digest('hex'),
        assets: ['./assets/old.js']
      }) }));

    await expect(verifyDeployedApp({
      directUrl: 'https://johnwalls.studio/studio-app/index.html',
      expectedVersion: 'new-build',
      fetchImpl
    })).rejects.toThrow('Live version mismatch');
  });
});
