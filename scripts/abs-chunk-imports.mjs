import fs from 'fs';
import path from 'path';

const outDir = path.resolve('dist/taylor-access/browser');

function patchJs(content) {
  return content
    .replace(/from"\.\/(chunk-[^"]+)"/g, 'from"/$1"')
    .replace(/from'\.\/(chunk-[^']+)'/g, "from'/$1'")
    .replace(/import\("\.\/(chunk-[^"]+)"\)/g, 'import("/$1")')
    .replace(/import\('\.\/(chunk-[^']+)'\)/g, "import('/$1')");
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!name.endsWith('.js')) continue;

    const content = fs.readFileSync(full, 'utf8');
    const next = patchJs(content);
    if (next !== content) {
      fs.writeFileSync(full, next);
    }
  }
}

if (!fs.existsSync(outDir)) {
  console.error(`Build output not found: ${outDir}`);
  process.exit(1);
}

walk(outDir);
