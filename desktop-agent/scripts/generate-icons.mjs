import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const assetsDir = path.resolve(root, "assets");
const logoSvgPath = path.resolve(assetsDir, "tray-icon.svg");
const wideSvgPath = path.resolve(assetsDir, "alysonlogo.svg");

const outIconPng = path.resolve(assetsDir, "icon.png");
const outTrayPng = path.resolve(assetsDir, "tray-icon.png");
const outTrayTemplate = path.resolve(assetsDir, "tray-iconTemplate.png");
const outTrayTemplate2x = path.resolve(assetsDir, "tray-iconTemplate@2x.png");

function pickSvg() {
  if (fs.existsSync(logoSvgPath)) return logoSvgPath;
  if (fs.existsSync(wideSvgPath)) return wideSvgPath;
  console.error("No SVG source found in assets/");
  process.exit(1);
}

async function renderSquareIcon(svgPath, size, outPath) {
  const svgBuffer = fs.readFileSync(svgPath);
  const rendered = sharp(svgBuffer, { density: 600 }).png();
  const meta = await rendered.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error(`Could not read rendered SVG size for ${svgPath}`);
  }
  const side = Math.min(width, height);
  await rendered
    .extract({ left: 0, top: 0, width: side, height: side })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/** macOS menu bar template: black silhouette on transparent background. */
async function renderTemplateIcon(svgPath, size, outPath) {
  const svgBuffer = fs.readFileSync(svgPath);
  const { data, info } = await sharp(svgBuffer, { density: 600 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
}

const svgPath = pickSvg();

await renderSquareIcon(svgPath, 1024, outIconPng);
console.log("Wrote:", outIconPng);

await renderSquareIcon(svgPath, 32, outTrayPng);
console.log("Wrote:", outTrayPng);

await renderTemplateIcon(svgPath, 22, outTrayTemplate);
console.log("Wrote:", outTrayTemplate);

await renderTemplateIcon(svgPath, 44, outTrayTemplate2x);
console.log("Wrote:", outTrayTemplate2x);
