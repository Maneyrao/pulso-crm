/**
 * Verifica que el .env local tenga todo lo que hace falta.
 *
 * Existe para que un desarrollador nuevo no descubra que le falta una variable
 * cuando la API ya arrancó a medias.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('Falta .env. Copiá .env.example y ajustá los valores.');
  process.exit(1);
}

const keysOf = (file: string): Set<string> =>
  new Set(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('=')[0]!.trim()),
  );

const expected = keysOf(examplePath);
const actual = keysOf(envPath);
const missing = [...expected].filter((k) => !actual.has(k));

if (missing.length > 0) {
  console.error('Faltan variables en tu .env:\n' + missing.map((m) => `  - ${m}`).join('\n'));
  process.exit(1);
}

console.log(`.env completo (${actual.size} variables).`);
