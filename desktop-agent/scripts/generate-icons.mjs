import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const assetsDir = path.resolve(root, "assets");
const sourceSvg = path.resolve(assetsDir, "tavilo-logo.svg");
/**
 * Taskbar and Dock icons sit on a dark ink rounded square. The mark is periwinkle
 * (#7F8EFF) and lime (#C4FF46): on white they measure 2.9:1 and 1.2:1 and the star
 * all but vanishes at Dock size; on this plate they measure 6.1:1 and 14.9:1.
 */
const PLATE_FILL = "#14172b";
const requiredOutputs = [
  "icon.png",
  "icon.ico",
  "icon.icns",
  "tavilo-mark.png",
  "tavilo-logo-wide.png",
  "tray-icon.png",
  "tray-iconTemplate.png",
  "tray-iconTemplate@2x.png",
];

if (!fs.existsSync(sourceSvg)) {
  const haveOutputs = requiredOutputs.every((name) =>
    fs.existsSync(path.join(assetsDir, name)),
  );
  if (haveOutputs) {
    console.warn(`Missing ${sourceSvg}; using existing desktop-agent/assets icons.`);
    process.exit(0);
  }
  console.error(`Missing Tavilo logo mark: ${sourceSvg}`);
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

// Rasterize the SVG at the exact pixel size. Downscaling a big bitmap softens the mark.
const svgMeta = await sharp(sourceSvg).metadata();
const trimmed = await sharp(sourceSvg).trim().toBuffer({ resolveWithObject: true });
const trim = {
  fullW: svgMeta.width,
  fullH: svgMeta.height,
  width: trimmed.info.width,
  height: trimmed.info.height,
  left: -trimmed.info.trimOffsetLeft,
  top: -trimmed.info.trimOffsetTop,
};

async function renderMark(width, height) {
  const scale = width / trim.width;
  const renderW = Math.max(width, Math.round(trim.fullW * scale));
  const renderH = Math.max(height, Math.round(trim.fullH * scale));
  const rendered = await sharp(sourceSvg)
    .resize(renderW, renderH, { fit: "fill" })
    .png()
    .toBuffer();
  const meta = await sharp(rendered).metadata();
  let left = Math.round(trim.left * scale);
  let top = Math.round(trim.top * scale);
  if (left + width > meta.width) left = meta.width - width;
  if (top + height > meta.height) top = meta.height - height;
  left = Math.max(0, left);
  top = Math.max(0, top);
  return sharp(rendered).extract({ left, top, width, height }).png().toBuffer();
}

async function renderPng(size, outPath) {
  fs.writeFileSync(outPath, await renderMark(size, size));
  console.log("Wrote:", outPath);
}

/**
 * Dark plate with the wide mark filling the width and centered vertically.
 * A square plate (Windows .ico) stays opaque. Rounded plates (dock) use a
 * modest corner so the star is not clipped. The mark is wider than tall, so a
 * small inset matters: every point of inset shrinks it twice as much in height.
 */
async function renderOnPlateBuffer(size, { square = false } = {}) {
  const canvas = Math.max(16, Math.floor(size));
  const inset = Math.max(1, Math.round(canvas * (square ? 0.03 : 0.04)));
  const corner = square ? 0 : Math.max(2, Math.round(canvas * 0.18));
  const logoW = Math.max(8, canvas - inset * 2);
  const logoH = Math.max(1, Math.round(logoW * trim.height / trim.width));
  const logo = await renderMark(logoW, logoH);
  const top = Math.max(0, Math.round((canvas - logoH) / 2));
  const left = Math.max(0, Math.round((canvas - logoW) / 2));
  const plate = Buffer.from(
    `<svg width="${canvas}" height="${canvas}" xmlns="http://www.w3.org/2000/svg"><rect width="${canvas}" height="${canvas}" rx="${corner}" ry="${corner}" fill="${PLATE_FILL}"/></svg>`,
  );
  return sharp(plate)
    .composite([{ input: logo, top, left }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderOnPlate(size, outPath) {
  fs.writeFileSync(outPath, await renderOnPlateBuffer(size));
  console.log("Wrote:", outPath);
}

/** Windows ICO with embedded PNGs (Vista+). */
function buildIco(images) {
  const count = images.length;
  const headerSize = 6 + count * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = headerSize;
  const parts = [header];
  images.forEach((img, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, entry);
    header.writeUInt8(img.size >= 256 ? 0 : img.size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(img.buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += img.buffer.length;
    parts.push(img.buffer);
  });
  return Buffer.concat(parts);
}

/** macOS menu-bar template fallback: black silhouette on transparent. */
async function renderTemplateIcon(size, outPath) {
  const { data, info } = await sharp(await renderMark(size, size))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha > 24) {
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
      pixels[i + 3] = Math.min(255, alpha);
    } else {
      pixels[i + 3] = 0;
    }
  }

  await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("Wrote:", outPath);
}

await renderOnPlate(1024, path.join(assetsDir, "icon.png"));
await renderOnPlate(256, path.join(assetsDir, "tavilo-mark.png"));
await renderOnPlate(32, path.join(assetsDir, "icon-32.png"));
await renderOnPlate(48, path.join(assetsDir, "icon-48.png"));
await renderOnPlate(64, path.join(assetsDir, "icon-64.png"));
const wideH = 256;
const wideW = Math.max(1, Math.round(wideH * trim.width / trim.height));
fs.writeFileSync(path.join(assetsDir, "tavilo-logo-wide.png"), await renderMark(wideW, wideH));
console.log("Wrote:", path.join(assetsDir, "tavilo-logo-wide.png"));
/** macOS menu bar: the colored mark only. A white chip reads as a sticker next to the clock. */
async function renderMenuBar(height, outPath) {
  const pad = Math.max(1, Math.round(height * 0.04));
  const logoH = Math.max(8, height - pad * 2);
  const logoW = Math.max(1, Math.round(logoH * trim.width / trim.height));
  const logo = await renderMark(logoW, logoH);
  const meta = await sharp(logo).metadata();
  await sharp({
    create: {
      width: meta.width + pad * 2,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("Wrote:", outPath);
}

await renderMenuBar(22, path.join(assetsDir, "tavilo-menubar.png"));
await renderMenuBar(44, path.join(assetsDir, "tavilo-menubar@2x.png"));
await renderPng(32, path.join(assetsDir, "tray-icon.png"));
await renderTemplateIcon(22, path.join(assetsDir, "tray-iconTemplate.png"));
await renderTemplateIcon(44, path.join(assetsDir, "tray-iconTemplate@2x.png"));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = [];
for (const size of icoSizes) {
  // Same rounded ink tile as the macOS Dock icon. The frames are 32-bit PNGs with
  // alpha, which Windows (Vista+) draws transparent — the corners do not turn black.
  icoImages.push({ size, buffer: await renderOnPlateBuffer(size) });
}
const icoPath = path.join(assetsDir, "icon.ico");
fs.writeFileSync(icoPath, buildIco(icoImages));
console.log("Wrote:", icoPath);

const iconset = path.join(assetsDir, "Tavilo.iconset");
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });
const icnsSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];
for (const [name, size] of icnsSizes) {
  const filePath = path.join(iconset, name);
  await renderOnPlate(size, filePath);
  // iconutil rejects sharp PNGs; sips rewrites them into a set it accepts.
  execFileSync("sips", ["-s", "format", "png", filePath, "--out", filePath], { stdio: "ignore" });
}
const icnsPath = path.join(assetsDir, "icon.icns");
execFileSync("iconutil", ["-c", "icns", iconset, "-o", icnsPath], { stdio: "inherit" });
fs.rmSync(iconset, { recursive: true, force: true });
console.log("Wrote:", icnsPath);
