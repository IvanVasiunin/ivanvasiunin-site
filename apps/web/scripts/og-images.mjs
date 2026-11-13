// @ts-check
// Link-preview images (Open Graph / Twitter, ROADMAP 8.6; Ivan, 2026-11-13): 1200 × 630 JPEGs for `/` and
// `/cv` in the site's style (the dark sky, chart rings, stars, Ivan's photo), drawn in Playwright's
// Chromium from HTML and written to public/og/. Run by hand after the photo or the texts change:
//
//   node scripts/og-images.mjs
//
// Everything is local: the photo from src/assets, the font from node_modules (no network).
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(WEB_DIR, 'public', 'og');

/** The images: file name, the line under the name, and the call to action. */
export const OG_IMAGES = [
  {
    file: 'home.jpg',
    kicker: 'AI mode',
    line: 'Ask Elio, my AI assistant, about my experience, skills and projects',
  },
  {
    file: 'cv.jpg',
    kicker: 'CV',
    line: 'Experience, projects and skills — with a two-page PDF',
  },
];

/**
 * A file as a data: URL.
 * @param {string} file
 * @param {string} type
 */
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;

/**
 * The HTML of one image.
 * @param {{ kicker: string; line: string }} image
 * @param {{ photo: string; font: string; mark: string }} assets data URLs
 */
export function ogHtml(image, assets) {
  // Stars: a fixed pseudo-random field (the same every run).
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const stars = Array.from({ length: 70 }, () => {
    const size = random() < 0.85 ? 1.6 : 2.8;
    return `<i style="left:${(random() * 1200).toFixed(0)}px;top:${(random() * 630).toFixed(0)}px;width:${size}px;height:${size}px;opacity:${(0.35 + random() * 0.55).toFixed(2)}"></i>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Schibsted Grotesk'; font-weight: 400 900; src: url('${assets.font}') format('woff2'); }
    * { box-sizing: border-box; margin: 0; }
    html, body { width: 1200px; height: 630px; }
    body { position: relative; overflow: hidden; font-family: 'Schibsted Grotesk', sans-serif; color: #e6ecff;
      background: radial-gradient(circle at 78% 45%, #26306b 0%, #141b3f 38%, #0e1430 70%),
                  #0e1430; }
    .glow { position: absolute; inset: 0;
      background: radial-gradient(circle at 12% 110%, rgba(110, 211, 200, 0.18), transparent 45%),
                  radial-gradient(circle at 95% -10%, rgba(187, 166, 255, 0.22), transparent 45%); }
    .rings { position: absolute; left: 930px; top: 315px; }
    .rings b { position: absolute; border: 1.5px solid rgba(141, 178, 255, 0.16); border-radius: 50%; transform: translate(-50%, -50%); }
    .stars i { position: absolute; border-radius: 50%; background: #e6ecff; }
    .text { position: absolute; left: 80px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
    .kicker { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #8db2ff; }
    .kicker img { width: 44px; height: 44px; }
    h1 { font-size: 84px; line-height: 1; font-weight: 800; letter-spacing: -0.02em; }
    .role { font-size: 30px; font-weight: 600; white-space: nowrap; background: linear-gradient(90deg, #6ed3c8, #8db2ff 45%, #bba6ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .line { font-size: 30px; line-height: 1.3; color: #c2cbe8; max-width: 600px; }
    .url { margin-top: 10px; font-size: 26px; font-weight: 600; color: #e6ecff; opacity: 0.85; }
    .photo { position: absolute; left: 930px; top: 315px; width: 340px; height: 340px; transform: translate(-50%, -50%);
      border-radius: 50%; border: 3px solid #8db2ff; box-shadow: 0 0 0 10px rgba(141, 178, 255, 0.12), 0 0 80px rgba(141, 178, 255, 0.45);
      background: url('${assets.photo}') center / cover; }
  </style></head><body>
    <div class="glow"></div>
    <div class="stars">${stars}</div>
    <div class="rings"><b style="width:440px;height:440px"></b><b style="width:560px;height:560px"></b><b style="width:700px;height:700px"></b></div>
    <div class="photo"></div>
    <div class="text">
      <div class="kicker"><img src="${assets.mark}" alt="">${image.kicker}</div>
      <h1>Ivan Vasiunin</h1>
      <div class="role">Senior Frontend Engineer · AI Engineering</div>
      <p class="line">${image.line}</p>
      <div class="url">ivanvasiunin.com</div>
    </div>
  </body></html>`;
}

async function main() {
  const assets = {
    photo: dataUrl(path.join(WEB_DIR, 'src', 'assets', 'ivan-vasiunin.jpg'), 'image/jpeg'),
    font: dataUrl(
      path.join(
        WEB_DIR,
        'node_modules',
        '@fontsource-variable',
        'schibsted-grotesk',
        'files',
        'schibsted-grotesk-latin-wght-normal.woff2',
      ),
      'font/woff2',
    ),
    mark: dataUrl(path.join(WEB_DIR, 'public', 'favicon.svg'), 'image/svg+xml'),
  };
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const image of OG_IMAGES) {
      await page.setContent(ogHtml(image, assets), { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({ path: path.join(OUT_DIR, image.file), type: 'jpeg', quality: 88 });
      console.log(`public/og/${image.file}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
