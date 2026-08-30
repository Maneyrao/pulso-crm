/**
 * Copia el SDK oficial de HID (`@digitalpersona/websdk` y
 * `@digitalpersona/fingerprint`) desde node_modules a `apps/web/public/vendor/hid`,
 * que es de donde `app/layout.tsx` los carga por `<script>`.
 *
 * Además VERIFICA que la versión realmente instalada coincida con la declarada
 * en `apps/web/package.json`. El panel de diagnóstico del CRM informa esas
 * versiones al operador: si el archivo servido viniera de otra versión, el
 * informe mentiría justo cuando se lo necesita para decidir si un problema es
 * del código o del cliente local de HID.
 */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(repositoryRoot, 'apps/web');
const requireFromWeb = createRequire(resolve(webRoot, 'package.json'));
const destination = resolve(webRoot, 'public/vendor/hid');

const webPackage = JSON.parse(await readFile(resolve(webRoot, 'package.json'), 'utf8'));

const webSdkRoot = dirname(requireFromWeb.resolve('@digitalpersona/websdk/package.json'));
const fingerprintRoot = resolve(webRoot, 'node_modules/@digitalpersona/fingerprint');

/**
 * `websdk.client.ui.js` (no `websdk.client.js`): es la variante que la
 * documentación oficial de `@digitalpersona/fingerprint` indica cargar junto
 * con `fingerprint.sdk.js`.
 */
const assets = [
  {
    package: '@digitalpersona/websdk',
    manifest: resolve(webSdkRoot, 'package.json'),
    source: resolve(webSdkRoot, 'dist/websdk.client.ui.js'),
    name: 'websdk.client.ui.js',
  },
  {
    package: '@digitalpersona/fingerprint',
    manifest: resolve(fingerprintRoot, 'package.json'),
    source: resolve(fingerprintRoot, 'dist/fingerprint.sdk.js'),
    name: 'fingerprint.sdk.js',
  },
];

await mkdir(destination, { recursive: true });

for (const asset of assets) {
  const declared = webPackage.dependencies?.[asset.package];
  const installed = JSON.parse(await readFile(asset.manifest, 'utf8')).version;
  if (declared !== installed) {
    throw new Error(
      `${asset.package}: apps/web/package.json declara "${declared}" pero hay instalada "${installed}". ` +
        `El diagnóstico del CRM informa la versión declarada; tienen que coincidir. ` +
        `Fijá la versión exacta (sin ^) y reinstalá.`,
    );
  }
  await copyFile(asset.source, resolve(destination, asset.name));
}
