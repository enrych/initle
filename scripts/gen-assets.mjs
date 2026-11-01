// Renders the social preview image and PNG app icons with headless Chromium.
// Usage: node scripts/gen-assets.mjs   (writes into apps/web/public)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const out = new URL("../apps/web/public/", import.meta.url).pathname;

const tile = (ch, bg, fg, size) =>
  `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size * 0.8}px;height:${size}px;margin:0 ${size * 0.06}px;border-radius:${size * 0.16}px;background:${bg};color:${fg};font:400 ${size * 0.66}px 'Lilita One',Arial Black,sans-serif;border:${size * 0.05}px solid #160731;box-shadow:0 ${size * 0.08}px 0 #160731;transform:rotate(${[-8, 5, -4, 7, -6, 4][Math.floor(Math.random() * 6)]}deg)">${ch}</span>`;
const logo = (size) =>
  [["I", "#3f8cff", "#fff"], ["N", "#3f8cff", "#fff"], ["I", "#ff4fa0", "#fff"], ["T", "#ff4fa0", "#fff"], ["L", "#ffc531", "#160731"], ["E", "#ffc531", "#160731"]]
    .map(([c, b, f]) => tile(c, b, f, size))
    .join("");

const og = `<html><head><link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@800&display=swap" rel="stylesheet"></head>
<body style="margin:0;width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;font-family:Nunito,sans-serif;color:#fff;
background:radial-gradient(circle at 1px 1px,rgba(255,255,255,.08) 1.5px,transparent 0) 0 0/22px 22px,radial-gradient(800px 500px at 0% 0%,rgba(63,140,255,.4),transparent 60%),radial-gradient(700px 500px at 100% 20%,rgba(255,79,160,.35),transparent 60%),#2a1160">
<div>${logo(130)}</div>
<div style="font:400 60px 'Lilita One',sans-serif;color:#fff3d6;text-shadow:0 5px 0 #160731">Every letter counts!</div>
<div style="font-size:30px;font-weight:800;color:#cdbcff">The party game of initials · crack them, fake them, write your own</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og, { waitUntil: "networkidle" }).catch(() => page.setContent(og));
await page.waitForTimeout(500);
await page.screenshot({ path: out + "og.png" });

const svg = readFileSync(out + "icon.svg", "utf8");
for (const size of [180, 192, 512]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#2a1160">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: out + `icon-${size}.png` });
}
await browser.close();
console.log("assets written to", out);
