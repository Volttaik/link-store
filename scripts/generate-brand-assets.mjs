/** Generate icons from the checked-in Rush Cart logo; never redraw the brand. */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
const source = fileURLToPath(new URL("../public/brand/rush-cart-logo.png", import.meta.url));
const metadata = await sharp(source).metadata();
if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error("Rush Cart logo must be a valid PNG.");
for (const [file, size] of [["app/icon.png", 32], ["app/apple-icon.png", 180], ["public/brand/rush-cart-icon.png", 192]]) {
  await sharp(source).resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(file);
}
const png = await sharp(source).resize(32, 32, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 32; header[7] = 32; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await writeFile("app/favicon.ico", Buffer.concat([header, png]));
console.log(`Rush Cart icons generated from ${metadata.width}×${metadata.height} logo (aspect ratio preserved).`);
