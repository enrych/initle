// Renders the social preview image and PNG app icons with headless Chromium.
// Usage: node scripts/gen-assets.mjs   (writes into apps/web/public)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const out = new URL("../apps/web/public/", import.meta.url).pathname;

const tile = (ch, bg, fg, size) =>
  `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size * 0.8}px;height:${size}px;margin:0 ${size * 0.06}px;border-radius:${size * 0.16}px;background:${bg};color:${fg};font:700 ${size * 0.62}px 'Space Grotesk',Arial Black,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)">${ch}</span>`;
const logo = (size) =>
  [["I", "#4f8cff", "#fff"], ["N", "#4f8cff", "#fff"], ["I", "#ff4fa3", "#fff"], ["T", "#ff4fa3", "#fff"], ["L", "#ffb020", "#0b0d1a"], ["E", "#ffb020", "#0b0d1a"]]
    .map(([c, b, f]) => tile(c, b, f, size))
    .join("");

const og = `<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet"></head>
<body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;font-family:Inter,sans-serif;color:#f4f5ff;
background:radial-gradient(800px 400px at 10% 0%,rgba(79,140,255,.25),transparent 60%),radial-gradient(700px 400px at 100% 20%,rgba(255,79,163,.2),transparent 60%),#0b0d1a">
<div>${logo(130)}</div>
<div style="font:700 52px 'Space Grotesk',sans-serif">Every letter counts.</div>
<div style="font-size:30px;color:#9aa0c7">The party game of initials · crack them, fake them, write your own</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: "networkidle" }).catch(() => page.setContent(og));
await page.waitForTimeout(500);
await page.screenshot({ path: out + "og.png" });

const svg = readFileSync(out + "icon.svg", "utf8");
for (const size of [180, 192, 512]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#0b0d1a">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: out + `icon-${size}.png` });
}
await browser.close();
console.log("assets written to", out);
