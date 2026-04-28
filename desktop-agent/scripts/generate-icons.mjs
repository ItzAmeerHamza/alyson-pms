import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(new URL(".", import.meta.url).pathname, ".."); // desktop-agent/
const svgPath = path.resolve(root, "./assets/alysonlogo.svg");
const outPngPath = path.resolve(root, "./assets/icon.png");

if (!fs.existsSync(svgPath)) {
  console.error("SVG not found:", svgPath);
  process.exit(1);
}

// Create a square icon from the left circular mark.
// The source SVG is wide, so we render at high density then crop a square from the left.
const SIZE = 1024;

const svgBuffer = fs.readFileSync(svgPath);

const rendered = sharp(svgBuffer, { density: 600 }).png();
const meta = await rendered.metadata();

const width = meta.width ?? 0;
const height = meta.height ?? 0;
if (!width || !height) {
  console.error("Could not read rendered SVG size.");
  process.exit(1);
}

const side = Math.min(height, width);

await rendered
  .extract({ left: 0, top: 0, width: side, height: side })
  .resize(SIZE, SIZE)
  .png({ compressionLevel: 9 })
  .toFile(outPngPath);

console.log("Wrote:", outPngPath);

