import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(repositoryRoot, 'apps/web');
const requireFromWeb = createRequire(resolve(webRoot, 'package.json'));
const destination = resolve(webRoot, 'public/vendor/hid');

const webSdkRoot = dirname(requireFromWeb.resolve('@digitalpersona/websdk/package.json'));
const fingerprintRoot = resolve(webRoot, 'node_modules/@digitalpersona/fingerprint');
const assets = [
  [resolve(webSdkRoot, 'dist/websdk.client.js'), 'websdk.client.js'],
  [resolve(fingerprintRoot, 'dist/fingerprint.sdk.js'), 'fingerprint.sdk.js'],
];

await mkdir(destination, { recursive: true });
for (const [source, name] of assets) {
  await copyFile(source, resolve(destination, name));
}
