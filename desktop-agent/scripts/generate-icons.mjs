import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const assetsDir = path.resolve(root, "assets");
const sourcePng = path.resolve(root, "../tavilo-time-logo-2048.png");

if (!fs.existsSync(sourcePng)) {
  console.error(`Missing Tavilo Time logo: ${sourcePng}`);
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

async function renderPng(size, outPath) {
  await sharp(sourcePng)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log("Wrote:", outPath);
}

/** Same proportions as the menu-bar icon: white rounded square, mark inset. */
function whitePlateMetrics(size) {
  const canvas = Math.max(16, Math.floor(size));
  const pad = Math.max(1, Math.round(canvas * 2 / 22));
  const radius = Math.max(2, Math.round(canvas * 6 / 22));
  const logoSize = Math.max(8, canvas - pad * 2);
  return { canvas, pad, radius, logoSize };
}

async function renderOnWhiteBuffer(size) {
  const { canvas, pad, radius, logoSize } = whitePlateMetrics(size);
  const logo = await sharp(sourcePng)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const plate = Buffer.from(
    `<svg width="${canvas}" height="${canvas}" xmlns="http://www.w3.org/2000/svg"><rect width="${canvas}" height="${canvas}" rx="${radius}" ry="${radius}" fill="#ffffff"/></svg>`,
  );
  return sharp(plate)
    .composite([{ input: logo, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderOnWhite(size, outPath) {
  fs.writeFileSync(outPath, await renderOnWhiteBuffer(size));
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
  const { data, info } = await sharp(sourcePng)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
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

await renderOnWhite(1024, path.join(assetsDir, "icon.png"));
await renderOnWhite(256, path.join(assetsDir, "tavilo-mark.png"));
await renderPng(32, path.join(assetsDir, "tray-icon.png"));
await renderTemplateIcon(22, path.join(assetsDir, "tray-iconTemplate.png"));
await renderTemplateIcon(44, path.join(assetsDir, "tray-iconTemplate@2x.png"));

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = [];
for (const size of icoSizes) {
  icoImages.push({ size, buffer: await renderOnWhiteBuffer(size) });
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
  await renderOnWhite(size, filePath);
  // iconutil rejects sharp PNGs; sips rewrites them into a set it accepts.
  execFileSync("sips", ["-s", "format", "png", filePath, "--out", filePath], { stdio: "ignore" });
}
const icnsPath = path.join(assetsDir, "icon.icns");
execFileSync("iconutil", ["-c", "icns", iconset, "-o", icnsPath], { stdio: "inherit" });
fs.rmSync(iconset, { recursive: true, force: true });
console.log("Wrote:", icnsPath);
