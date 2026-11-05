/**
 * Assembles the GitHub Pages site into `_site/`: the static page under
 * `site/`, the generated figures, and the library bundled for the browser
 * (`lib/flash-guard.js` plus the readback worker beside it, which the
 * sampler loads relative to the bundle). It also redraws the link-preview
 * card (`og.png`) from the code being deployed and writes the site's absolute
 * URL into the OpenGraph tags, which chat apps need to fetch the card.
 *
 * The URL comes from SITE_URL (the Pages workflow passes the one GitHub
 * reports), else from GITHUB_REPOSITORY as a project Pages URL.
 *
 *   bun run site:build
 *   bun run site:preview      # serve _site/ on http://localhost:8787
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OG_IMAGE_ALT, packageVersion, renderOgPng } from './render-og.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const TSC_LOCAL = join(ROOT, 'node_modules', '.bin', 'tsc');
const TSC_MONOREPO = join(ROOT, '..', '..', 'node_modules', '.bin', 'tsc');
const tsc = existsSync(TSC_LOCAL)
  ? [TSC_LOCAL]
  : existsSync(TSC_MONOREPO)
    ? [TSC_MONOREPO]
    : ['bunx', 'tsc'];

const build = Bun.spawnSync([...tsc, '-p', 'tsconfig.build.json'], {
  cwd: ROOT,
  stdout: 'inherit',
  stderr: 'inherit',
});
if (build.exitCode !== 0) process.exit(build.exitCode);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'lib'), { recursive: true });

for (const [entry, name] of [
  ['dist/index.js', 'flash-guard.js'],
  ['dist/readback.worker.js', 'readback.worker.js'],
] as const) {
  const result = await Bun.build({
    entrypoints: [join(ROOT, entry)],
    outdir: join(OUT, 'lib'),
    target: 'browser',
    format: 'esm',
    naming: name,
    minify: false,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

cpSync(join(ROOT, 'site'), OUT, { recursive: true });
cpSync(join(ROOT, 'docs'), join(OUT, 'docs'), { recursive: true });

function siteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
  if (owner && repo) return `https://${owner.toLowerCase()}.github.io/${repo}/`;
  return 'https://zz-plant.github.io/flash-guard/';
}

if (renderOgPng(join(OUT, 'og.png'))) {
  console.log('redrew og.png');
} else {
  console.warn('no headless Chrome found; shipping the committed og.png');
}

// Changing the query string whenever the card can change makes chat apps
// that cache previews by URL fetch the new one.
const ogVersion = process.env.GITHUB_SHA?.slice(0, 7) ?? packageVersion();
const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const indexPath = join(OUT, 'index.html');
writeFileSync(
  indexPath,
  readFileSync(indexPath, 'utf8')
    .replaceAll('__SITE_URL__', siteUrl())
    .replaceAll('__OG_VERSION__', ogVersion)
    .replaceAll('__OG_IMAGE_ALT__', escapeAttr(OG_IMAGE_ALT)),
);
console.log(`wrote ${OUT} for ${siteUrl()}`);
