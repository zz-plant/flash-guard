/**
 * Renders the link-preview card (`site/og.png`, 1200x630) that chat apps and
 * social sites show when someone shares the site.
 *
 *   bun run og:png
 *
 * The numbers and the trace on the card come from the same governor run as
 * docs/governor-trace-*.svg (`runTrace` in render-figure.ts), so the card
 * cannot claim more than the code does. The card is HTML screenshotted by a
 * headless Chrome or Chromium found on the machine (CHROME_PATH, then the
 * usual binary names). build-site.ts calls `renderOgPng` too, so the deployed
 * card is redrawn from the code being deployed; when no browser is found it
 * keeps the committed site/og.png.
 */
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTrace, type Trace } from './render-figure.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 1200;
const HEIGHT = 630;
const FRAME_MS = 1000 / 60;
/** Frames drawn on the card: two seconds, enough to show the clamp. */
const SHOWN = 120;

export const OG_IMAGE_ALT =
  'flash-guard: a strobe at 20 flashes a second goes in, 3 a second comes out. A chart shows the raw strobe as a tall square wave and the governed output flattening within a fraction of a second.';

/** First frame on which the governor holds the output down. */
function engagedFrame(trace: Trace): number {
  return Math.max(0, trace.hold.findIndex((h) => h > 0));
}

function chartSvg(trace: Trace, width: number, height: number): string {
  const top = 14;
  const bottom = 10;
  const plotH = height - top - bottom;
  const x = (i: number) => (i / (SHOWN - 1)) * width;
  const y = (v: number) => top + (1 - v) * plotH;
  const path = (series: number[]) =>
    series
      .slice(0, SHOWN)
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ');
  const raw = path(trace.raw);
  const governed = path(trace.governed);
  const clampX = x(engagedFrame(trace));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="rawFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3c25a" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#e3c25a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="${(clampX / width).toFixed(3)}" stop-color="#fff" stop-opacity="1"/>
      <stop offset="${Math.min(1, clampX / width + 0.08).toFixed(3)}" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.35"/>
    </linearGradient>
    <mask id="rawMask"><rect width="${width}" height="${height}" fill="url(#fade)"/></mask>
  </defs>
  <g mask="url(#rawMask)">
    <path d="${raw} L${width} ${y(0)} L0 ${y(0)} Z" fill="url(#rawFill)"/>
    <path d="${raw}" fill="none" stroke="#e3c25a" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
  <line x1="${clampX.toFixed(1)}" y1="0" x2="${clampX.toFixed(1)}" y2="${height}" stroke="#e6edf3" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="4 5"/>
  <path d="${governed}" fill="none" stroke="#6ea0d8" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

export function ogCardHtml(
  trace: Trace = runTrace(),
  version = packageVersion(),
): string {
  const clampMs = Math.round(engagedFrame(trace) * FRAME_MS);
  const chartW = WIDTH - 96;
  const chartH = 168;
  const clampLeft = (engagedFrame(trace) / (SHOWN - 1)) * chartW + 12;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    font-family: Inter, ui-sans-serif, system-ui, "DejaVu Sans", sans-serif;
    color: #e6edf3;
    background:
      radial-gradient(900px 520px at 100% 0%, rgba(179, 92, 68, 0.38), transparent 60%),
      radial-gradient(700px 420px at 0% 100%, rgba(110, 160, 216, 0.22), transparent 65%),
      #0d1117;
    padding: 52px 48px 40px;
    position: relative;
  }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 700; letter-spacing: -0.01em; }
  .brand svg { width: 46px; height: 46px; }
  .brand .tag { margin-left: auto; font: 500 20px "JetBrains Mono", ui-monospace, monospace; color: #8b949e; }
  h1 { margin-top: 26px; font-size: 74px; line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; }
  h1 .in { color: #e3c25a; }
  h1 .out { color: #6ea0d8; }
  .sub { margin-top: 14px; font-size: 27px; line-height: 1.3; color: #b6c0ca; max-width: 980px; }
  .chart { position: absolute; left: 48px; bottom: 78px; width: ${chartW}px; height: ${chartH}px; }
  .pill { position: absolute; font: 700 20px Inter, ui-sans-serif, sans-serif; padding: 6px 12px; border-radius: 999px; white-space: nowrap; }
  .pill.raw { right: 0; top: 4px; color: #0d1117; background: #e3c25a; }
  .pill.clamp { top: 62px; color: #e6edf3; background: rgba(230, 237, 243, 0.12); border: 1px solid rgba(230, 237, 243, 0.3); }
  .pill.gov { right: 0; bottom: 26px; color: #0d1117; background: #6ea0d8; }
  footer { position: absolute; left: 48px; right: 48px; bottom: 30px; display: flex; justify-content: space-between; font: 500 21px "JetBrains Mono", ui-monospace, monospace; color: #8b949e; }
  footer b { color: #e6edf3; font-weight: 500; }
</style></head>
<body>
  <div class="brand">
    <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#b35c44"/><path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#fff"/></svg>
    flash-guard
    <span class="tag">WCAG 2.3.1</span>
  </div>
  <h1><span class="in">${trace.rawPeak} flashes a second</span> in.<br><span class="out">${trace.governedPeak}</span> out.</h1>
  <p class="sub">Holds any canvas under the seizure threshold while it plays.</p>
  <div class="chart">
    ${chartSvg(trace, chartW, chartH)}
    <span class="pill raw">raw strobe · ${trace.rawPeak}/s</span>
    <span class="pill clamp" style="left: ${clampLeft.toFixed(0)}px">clamped in ${clampMs} ms</span>
    <span class="pill gov">what the viewer sees · ${trace.governedPeak}/s ✓</span>
  </div>
  <footer><span><b>npm i flash-guard</b> · zero dependencies</span><span>v${version} · try it in your browser →</span></footer>
</body></html>`;
}

export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/** A headless-capable Chrome or Chromium binary, or null when none is found. */
export function findChrome(): string | null {
  const env = process.env.CHROME_PATH;
  if (env) return env;
  for (const name of [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
  ]) {
    const found = Bun.which(name);
    if (found) return found;
  }
  for (const path of [
    '/opt/pw-browsers/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) {
    try {
      if (statSync(path)) return path;
    } catch {}
  }
  return null;
}

/**
 * Screenshots the card to `outPath`. Returns false, leaving `outPath`
 * untouched, when no browser is available or the screenshot fails.
 */
export function renderOgPng(outPath: string, html = ogCardHtml()): boolean {
  const chrome = findChrome();
  if (!chrome) return false;
  const dir = mkdtempSync(join(tmpdir(), 'og-'));
  try {
    const page = join(dir, 'card.html');
    const shot = join(dir, 'card.png');
    writeFileSync(page, html);
    const result = Bun.spawnSync(
      [
        chrome,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        // Gives the web font time to load before the shot is taken.
        '--virtual-time-budget=8000',
        `--window-size=${WIDTH},${HEIGHT}`,
        `--screenshot=${shot}`,
        `file://${page}`,
      ],
      { stdout: 'ignore', stderr: 'ignore' },
    );
    if (result.exitCode !== 0) return false;
    try {
      if (statSync(shot).size === 0) return false;
    } catch {
      return false;
    }
    copyFileSync(shot, outPath);
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const out = join(ROOT, 'site', 'og.png');
  if (!renderOgPng(out)) {
    console.error(
      'render-og: no headless Chrome or Chromium found; set CHROME_PATH to one.',
    );
    process.exit(1);
  }
  console.log(`wrote ${out}`);
}
