// После сборки: рядом с тяжёлыми файлами голосового гида кладёт .gz, nginx отдаёт
// их сам (gzip_static в deploy/nginx.conf). Модель барса — 60 МБ геометрии,
// сжатая — около 20: жать её на лету на каждый запрос дорого.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist', 'concierge');
const EXT = /\.(glb|bin|hdr)$/;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(name)) {
      const raw = readFileSync(p);
      const gz = gzipSync(raw, { level: 9 });
      if (gz.length > raw.length * 0.9) continue; // (модель висем почти не жмётся)
      writeFileSync(`${p}.gz`, gz);
      console.log(`${p.slice(root.length + 1)}: ${(raw.length / 1e6).toFixed(1)} -> ${(gz.length / 1e6).toFixed(1)} МБ`);
    }
  }
}

walk(root);
